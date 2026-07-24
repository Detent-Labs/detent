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
import { registerSubprocessHandlers } from "./subprocess.js";
import { createRegistry, register, type Registry } from "./registry.js";
import { HTTP_ACTION_TYPE, httpHandlerDef } from "../handlers/http.js";

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

export function startEngine(
  db: SQL = sql,
  registry: Registry = createDefaultRegistry(),
): { stop: () => void } {
  const { resolveBody, resolveLatestByContract } = createDefinitionStore(db);
  // Register the engine-internal subprocess handlers so the outbox worker can
  // dispatch core.spawnSubprocess / core.returnSubprocess like any other action.
  registerSubprocessHandlers(registry, db, resolveBody, resolveLatestByContract);
  const workers = [
    startOutboxWorker(db, registry),
    startResolutionWorker(db, resolveBody),
    startTimerScheduler(db, resolveBody),
  ];
  return { stop: () => workers.forEach((w) => w.stop()) };
}
