/**
 * Production wiring: build the definition store and start the three workers
 * against its resolver, so re-resolution, timers, and action delivery are all
 * live (no longer inert). The registry supplies the outbox worker's action
 * handlers — without it, delivery dead-letters even though the other two run.
 */

import { SQL } from "bun";
import { sql } from "./store.js";
import { createDefinitionStore } from "./definitions.js";
import { startOutboxWorker } from "./outbox.js";
import { startResolutionWorker } from "./resolution.js";
import { startTimerScheduler } from "./timers.js";
import { startRetentionSweep } from "./retention.js";
import { registerSubprocessHandlers } from "./subprocess.js";
import {
  createRegistry,
  register,
  type Registry,
  createDataSourceRegistry,
  registerDataSource,
  createDefaultAssignmentRegistry,
  type DataSourceRegistry,
  type AssignmentRegistry,
} from "./registry.js";
import { HTTP_ACTION_TYPE, httpHandlerDef } from "../handlers/http.js";
import { NOTIFICATION_EMAIL_ACTION_TYPE, notificationEmailHandlerDef } from "../handlers/notification-email.js";
import { z } from "zod";
import { fieldOption, type FieldOption } from "../schema/definition.js";
import { MAX_KEY_LENGTH } from "../schema/compile.js";

/**
 * A registry pre-populated with the built-in, vendor-neutral `http.request`
 * and `notification.email` handlers. Lives here rather than in registry.ts:
 * both handlers import `PermanentError` from outbox.ts (needed for their
 * permanent/transient classification to be real — `drainOutbox` checks `e
 * instanceof PermanentError` against that exact class), and outbox.ts already
 * imports from registry.ts — so registry.ts importing a handler back would
 * close an import cycle. host.ts sits downstream of all three, so building the
 * default registry here is acyclic; registry.ts stays the leaf module it
 * already was.
 *
 * `db` defaults to the shared pool, matching `createDefaultDataSourceRegistry`
 * below: `notification.email` resolves an actor id to an account address, so it
 * reads `auth_users`. `http.request` takes no database and ignores it.
 */
export function createDefaultRegistry(db: SQL = sql): Registry {
  const reg = createRegistry();
  register(reg, HTTP_ACTION_TYPE, httpHandlerDef);
  register(reg, NOTIFICATION_EMAIL_ACTION_TYPE, notificationEmailHandlerDef(db));
  return reg;
}

export const staticDataSourceConfigSchema = z.object({ options: z.array(fieldOption) });

export const DB_LIST_DATA_SOURCE_TYPE = "db.list";

/**
 * The most values one data list may hold. A list past the bound raises rather
 * than resolving truncated: a silently short option list would let a
 * participant's valid value fail membership validation, which is worse than a
 * loud failure an operator can see and split the list over.
 */
export const MAX_DATA_LIST_VALUES = 500;

export const dbListDataSourceConfigSchema = z.object({ listKey: z.string().min(1).max(MAX_KEY_LENGTH) });

/**
 * A registry pre-populated with the built-in `"static"` and `"db.list"` data
 * source handlers. `"static"` echoes its configured `options` unchanged;
 * `"db.list"` reads them from `data_lists`/`data_list_values`, so an operator
 * changes them with no publish and no migration.
 *
 * `db` is closed over here rather than carried on `DataSourceContext`: only
 * this one type needs a handle, and putting it in the context would make every
 * caller supply one for types that do not.
 */
export function createDefaultDataSourceRegistry(db: SQL = sql): DataSourceRegistry {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", {
    configSchema: staticDataSourceConfigSchema,
    // A static option list holds no notion of a retired value, so heldValues is ignored.
    resolve: async (ctx) => (ctx.config as { options: FieldOption[] }).options,
  });
  registerDataSource(reg, DB_LIST_DATA_SOURCE_TYPE, {
    configSchema: dbListDataSourceConfigSchema,
    resolve: async (ctx) => {
      const { listKey } = ctx.config as { listKey: string };
      const held = ctx.heldValues ?? [];
      // The LEFT JOIN is what separates "no such list" (no rows at all) from
      // "a list with nothing to offer" (one row whose value is null). A
      // retired value the instance holds comes back so its label still
      // renders and membership validation still accepts it.
      //
      // The bound counts ACTIVE rows, and the limit leaves room for the held
      // ones on top of it. Bounding the row count instead would make a list
      // sitting exactly on the bound throw for the very instances the
      // retirement rule protects: 500 active values plus one retired value a
      // holder names is 501 rows and 500 offered values.
      const rows = (await db`
        SELECT v.value, v.label, v.active
        FROM data_lists l
        LEFT JOIN data_list_values v
          ON v.list_key = l.list_key AND (v.active OR v.value = ANY(${db.array(held, "TEXT")}))
        WHERE l.list_key = ${listKey}
        ORDER BY v.sort_order, v.value
        LIMIT ${MAX_DATA_LIST_VALUES + 1 + held.length}
      `) as { value: string | null; label: FieldOption["label"] | null; active: boolean | null }[];
      if (rows.length === 0) throw new Error(`data list '${listKey}' does not exist`);
      // At most `held.length` of the rows read are inactive, so the limit above
      // always leaves enough room to see a 501st active value when one exists.
      if (rows.filter((r) => r.active).length > MAX_DATA_LIST_VALUES) {
        throw new Error(`data list '${listKey}' holds more than the ${MAX_DATA_LIST_VALUES}-value bound`);
      }
      return rows.filter((r) => r.value !== null).map((r) => ({ value: r.value as string, label: r.label as FieldOption["label"] }));
    },
  });
  return reg;
}

/**
 * `undefined` when unset (the sweep stays off, matching every deployment's
 * current behavior). A set-but-invalid value throws rather than silently
 * leaving the sweep off: this variable gates a destructive, irreversible
 * action with no default of its own. An operator who mistypes it needs to
 * find out immediately, not after a silent no-op.
 *
 * `parseMaxAttachmentBytes` in `http/routes.ts` reads its own bound the same
 * way.
 */
export function parseRetentionDays(): number | undefined {
  const raw = process.env.DATA_RETENTION_DAYS;
  if (raw === undefined) return undefined;
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`DATA_RETENTION_DAYS must be a positive integer, got '${raw}'`);
  }
  return days;
}

export function startEngine(
  db: SQL = sql,
  registry: Registry = createDefaultRegistry(),
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): { stop: () => void } {
  const { resolveBody, resolveLatestByContract } = createDefinitionStore(db);
  // Register the engine-internal subprocess handlers so the outbox worker can
  // dispatch core.spawnSubprocess / core.returnSubprocess like any other action.
  // The spawn handler resolves a child's initial-step candidates, so it needs
  // the same assignment registry the rest of the engine runs against.
  registerSubprocessHandlers(registry, db, resolveBody, resolveLatestByContract, assignmentRegistry);
  const retentionDays = parseRetentionDays();
  const workers = [
    startOutboxWorker(db, registry, 500, resolveBody),
    startResolutionWorker(db, resolveBody, 500, undefined, assignmentRegistry),
    startTimerScheduler(db, resolveBody, 500, assignmentRegistry),
    ...(retentionDays !== undefined ? [startRetentionSweep(db, retentionDays)] : []),
  ];
  return { stop: () => workers.forEach((w) => w.stop()) };
}
