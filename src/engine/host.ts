/**
 * Production wiring: build the definition store and start the three workers
 * against its resolver, so re-resolution, timers, and action delivery are all
 * live (no longer inert). The registry supplies the outbox worker's action
 * handlers — without it, delivery dead-letters even though the other two run.
 */

import { SQL } from "bun";
import { sql } from "./store.js";
import { createDefinitionStore } from "./definitions.js";
import { drainOutbox, deliver, CLAIM_LEASE_MS } from "./outbox.js";
import { drainResolutions } from "./resolution.js";
import { drainTimers } from "./timers.js";
import { sweepRetention } from "./retention.js";
import { pollForever } from "./poll.js";
import { log } from "../log.js";
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
import { PROCESS_START_ACTION_TYPE, processStartHandlerDef } from "../handlers/process-start.js";
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
 * It takes no database. `notification.email` and `process.start` both read
 * `ctx.db` per delivery, so one registry serves every tenant — a handle
 * bound here would resolve every tenant's addresses, or start every
 * tenant's chained instances, against one database. `http.request` takes no
 * database at all and ignores the field.
 */
export function createDefaultRegistry(): Registry {
  const reg = createRegistry();
  register(reg, HTTP_ACTION_TYPE, httpHandlerDef);
  register(reg, NOTIFICATION_EMAIL_ACTION_TYPE, notificationEmailHandlerDef);
  register(reg, PROCESS_START_ACTION_TYPE, processStartHandlerDef);
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
 * The most columns one data list may declare beyond `value` and `label`. The
 * bound guards the payload, not the rendered option text: ten columns of long
 * values still make an unreadable `<option>`, which the browser check covers.
 */
export const MAX_DATA_LIST_COLUMNS = 10;

/** A column key names a `FieldDef.columnMapping` entry, so it takes the same slug grammar. */
const DATA_LIST_COLUMN_KEY_FORMAT = /^[a-z_][a-z0-9_]*$/;

/**
 * One declared column of a data list. `label` is plain operator-facing text in
 * one language, exactly as `data_lists.label` already is — this is operator
 * configuration, not authored content, so no `LocalizedText` rule reaches it.
 *
 * `type` earns its place: the write-back checks an attribute against its
 * target field's declared type rather than coercing it, and a text-only store
 * would make `data.price > 10` compare a string against a number.
 */
export const dataListColumn = z.object({
  key: z.string().regex(DATA_LIST_COLUMN_KEY_FORMAT).max(MAX_KEY_LENGTH),
  label: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]),
});
export type DataListColumn = z.infer<typeof dataListColumn>;

/** The declaration as a whole: bounded, and unique on `key`. */
export const dataListColumns = z
  .array(dataListColumn)
  .max(MAX_DATA_LIST_COLUMNS)
  .refine((cols) => new Set(cols.map((c) => c.key)).size === cols.length, {
    message: "column keys must be unique within a list",
  });

/**
 * A `jsonb` column as the driver hands it back. `Bun.sql` returns a parsed
 * value for a column written through an object parameter, and the raw text for
 * one written through an explicit `::jsonb` cast. Both reach these two
 * relations, so every read goes through here — the same shape `store.ts` uses
 * for an instance body.
 */
export function parseJsonb(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Whether a stored attribute matches the type its column declares. */
export function attributeMatchesColumn(column: DataListColumn, value: unknown): boolean {
  if (column.type === "number") return typeof value === "number";
  if (column.type === "boolean") return typeof value === "boolean";
  return typeof value === "string";
}

/**
 * A registry pre-populated with the built-in `"static"` and `"db.list"` data
 * source handlers. `"static"` echoes its configured `options` unchanged;
 * `"db.list"` reads them from `data_lists`/`data_list_values`, so an operator
 * changes them with no publish and no migration.
 *
 * It takes no database. `db.list` reads `ctx.db` per resolution, so one
 * registry serves every tenant — a handle closed over here would offer one
 * tenant's option values to every tenant. `"static"` needs none and ignores
 * the field. This reverses the comment that stood here until multi-tenancy
 * landed, which argued the opposite when one process meant one database.
 */
export function createDefaultDataSourceRegistry(): DataSourceRegistry {
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
      const db = ctx.db;
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
        SELECT l.columns, v.value, v.label, v.attributes, v.active
        FROM data_lists l
        LEFT JOIN data_list_values v
          ON v.list_key = l.list_key AND (v.active OR v.value = ANY(${db.array(held, "TEXT")}))
        WHERE l.list_key = ${listKey}
        ORDER BY v.sort_order, v.value
        LIMIT ${MAX_DATA_LIST_VALUES + 1 + held.length}
      `) as {
        columns: unknown;
        value: string | null;
        label: FieldOption["label"] | null;
        attributes: Record<string, unknown> | null;
        active: boolean | null;
      }[];
      if (rows.length === 0) throw new Error(`data list '${listKey}' does not exist`);
      // At most `held.length` of the rows read are inactive, so the limit above
      // always leaves enough room to see a 501st active value when one exists.
      if (rows.filter((r) => r.active).length > MAX_DATA_LIST_VALUES) {
        throw new Error(`data list '${listKey}' holds more than the ${MAX_DATA_LIST_VALUES}-value bound`);
      }
      // Every row of the join carries the same list, so one parse of the
      // declaration serves them all. A declaration the admin routes rejected
      // cannot be here; a hand-edited one that fails to parse reads as "no
      // columns" rather than bricking every step bound to the list.
      const declared = dataListColumns.safeParse(parseJsonb(rows[0]?.columns) ?? []);
      const columns = declared.success ? declared.data : [];
      return rows
        .filter((r) => r.value !== null)
        .map((r) => {
          const option: FieldOption = { value: r.value as string, label: parseJsonb(r.label) as FieldOption["label"] };
          if (columns.length === 0) return option;
          const stored = parseJsonb(r.attributes) as Record<string, unknown> | undefined;
          // Walk the DECLARATION, never the stored object: Postgres normalizes
          // a jsonb object's key order, so the stored order is not the
          // operator's. The renderer reads this map in order.
          const attributes: Record<string, string | number | boolean> = {};
          for (const column of columns) {
            const raw = stored?.[column.key];
            if (raw === undefined || raw === null) continue;
            if (attributeMatchesColumn(column, raw)) attributes[column.key] = raw as string | number | boolean;
          }
          // Absent, not empty: a renderer branches on the key's presence.
          return Object.keys(attributes).length > 0 ? { ...option, attributes } : option;
        });
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

/** One tenant's database, and the key naming it. `""` is the single-tenant deployment. */
export type TenantHandle = { key: string; db: SQL };

/**
 * Which tenant databases are live right now. Answered per poll tick, so a
 * tenant provisioned while the process runs is served without a restart, and
 * one removed stops being visited.
 */
export type TenantSource = () => Promise<TenantHandle[]>;

/** The default: this process's own database, one entry, which is today's behaviour exactly. */
export const singleTenantSource = (db: SQL): TenantSource => async () => [{ key: "", db }];

/**
 * Everything a worker tick needs for ONE tenant. Built on first sight of that
 * tenant and cached: `createDefinitionStore` holds a per-database cache, and
 * rebuilding it each tick would throw that cache away every 500ms.
 *
 * The registry is per-tenant too, and only because of the `core.*` subprocess
 * handlers: those close over a database AND that tenant's definition store, so
 * unlike the author-facing plugins they cannot read a handle off the context.
 * They are engine-internal and were never author-facing, so a private copy per
 * tenant costs nothing an author can observe. The shared entries
 * (`http.request`, `notification.email`) are copied in by reference and still
 * read `ctx.db`.
 */
function tenantContexts(shared: Registry, assignmentRegistry: AssignmentRegistry) {
  const cache = new Map<string, { db: SQL; registry: Registry; resolveBody: ReturnType<typeof createDefinitionStore>["resolveBody"] }>();
  return (t: TenantHandle) => {
    let ctx = cache.get(t.key);
    if (!ctx) {
      const { resolveBody, resolveLatestByContract } = createDefinitionStore(t.db);
      const registry: Registry = new Map(shared);
      registerSubprocessHandlers(registry, t.db, resolveBody, resolveLatestByContract, assignmentRegistry);
      ctx = { db: t.db, registry, resolveBody };
      cache.set(t.key, ctx);
    }
    return ctx;
  };
}

/**
 * `tenants` defaults to this process's own database, so an on-premise
 * deployment polls exactly what it polls today. In SaaS mode it reads the
 * control plane, and the worker COUNT stays four whatever the tenant count —
 * each tick walks the list rather than each tenant getting its own workers.
 *
 * `registry` is the shared, author-facing one. It is not mutated here: each
 * tenant gets a copy carrying its own `core.*` handlers.
 */
export function startEngine(
  db: SQL = sql,
  registry: Registry = createDefaultRegistry(),
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
  tenants: TenantSource = singleTenantSource(db),
): { stop: () => void } {
  const contextFor = tenantContexts(registry, assignmentRegistry);
  const retentionDays = parseRetentionDays();

  /**
   * Run `fn` for every live tenant. A tenant whose tick throws is logged and
   * skipped, and the rest still run: in a shared process one tenant's fault
   * must not stop the others. `pollForever` would otherwise abandon the whole
   * pass at the first throw.
   */
  const eachTenant = (worker: string, fn: (c: ReturnType<typeof contextFor>) => Promise<unknown>) => async () => {
    for (const t of await tenants()) {
      try {
        await fn(contextFor(t));
      } catch (e) {
        log.warn("tenant tick skipped", { worker, tenant: t.key, error: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  const workers = [
    pollForever("outbox", eachTenant("outbox", (c) => drainOutbox(c.db, c.registry, deliver, CLAIM_LEASE_MS, c.resolveBody)), 500),
    pollForever("resolution", eachTenant("resolution", (c) => drainResolutions(c.db, c.resolveBody, undefined, assignmentRegistry)), 500),
    pollForever("timers", eachTenant("timers", (c) => drainTimers(c.db, c.resolveBody, assignmentRegistry)), 500),
    ...(retentionDays !== undefined
      ? [pollForever("retention", eachTenant("retention", (c) => sweepRetention(c.db, retentionDays)), 500)]
      : []),
  ];
  return { stop: () => workers.forEach((w) => w.stop()) };
}
