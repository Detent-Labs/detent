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
  type DataSourceRegistry,
} from "./registry.js";
import { HTTP_ACTION_TYPE, httpHandlerDef } from "../handlers/http.js";
import { z } from "zod";
import { fieldOption, type FieldOption } from "../schema/definition.js";

/**
 * A registry pre-populated with the built-in, vendor-neutral `http.request`
 * handler. Lives here rather than in registry.ts: that handler imports
 * `PermanentError` from outbox.ts (needed for its permanent/transient
 * classification to be real — `drainOutbox` checks `e instanceof
 * PermanentError` against that exact class), and outbox.ts already imports
 * from registry.ts — so registry.ts importing the handler back would close an
 * import cycle. host.ts sits downstream of all three, so building the default
 * registry here is acyclic; registry.ts stays the leaf module it already was.
 */
export function createDefaultRegistry(): Registry {
  const reg = createRegistry();
  register(reg, HTTP_ACTION_TYPE, httpHandlerDef);
  return reg;
}

const staticDataSourceConfigSchema = z.object({ options: z.array(fieldOption) });

/**
 * A registry pre-populated with the built-in `"static"` data source handler,
 * which echoes its configured `options` unchanged. Mirrors
 * `createDefaultRegistry` above; only one data source type ships in v1.
 */
export function createDefaultDataSourceRegistry(): DataSourceRegistry {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", {
    configSchema: staticDataSourceConfigSchema,
    resolve: async (ctx) => (ctx.config as { options: FieldOption[] }).options,
  });
  return reg;
}

/**
 * `undefined` when unset (the sweep stays off, matching every deployment's
 * current behavior). A set-but-invalid value throws rather than silently
 * leaving the sweep off: this variable gates a destructive, irreversible
 * action with no default of its own, unlike `MAX_ATTACHMENT_BYTES` and
 * similar env vars that fall back to a default on a bad value. An operator
 * who mistypes it needs to find out immediately, not after a silent no-op.
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
): { stop: () => void } {
  const { resolveBody, resolveLatestByContract } = createDefinitionStore(db);
  // Register the engine-internal subprocess handlers so the outbox worker can
  // dispatch core.spawnSubprocess / core.returnSubprocess like any other action.
  registerSubprocessHandlers(registry, db, resolveBody, resolveLatestByContract);
  const retentionDays = parseRetentionDays();
  const workers = [
    startOutboxWorker(db, registry, 500, resolveBody),
    startResolutionWorker(db, resolveBody),
    startTimerScheduler(db, resolveBody),
    ...(retentionDays !== undefined ? [startRetentionSweep(db, retentionDays)] : []),
  ];
  return { stop: () => workers.forEach((w) => w.stop()) };
}
