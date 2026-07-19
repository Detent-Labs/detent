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
import type { Registry } from "./registry.js";

export function startEngine(db: SQL = sql, registry: Registry = new Map()): { stop: () => void } {
  const { resolveBody } = createDefinitionStore(db);
  const workers = [
    startOutboxWorker(db, registry),
    startResolutionWorker(db, resolveBody),
    startTimerScheduler(db, resolveBody),
  ];
  return { stop: () => workers.forEach((w) => w.stop()) };
}
