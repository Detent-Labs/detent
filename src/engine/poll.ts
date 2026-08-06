import { log } from "../log.js";
import { ConcurrencyConflict } from "./transition.js";

/** Runs `tick` on a fixed interval until `stop()` is called. A tick that
 * throws is logged under `name` and does not stop the loop; `stop()` lets an
 * in-flight tick finish but prevents the next one from being scheduled.
 *
 * `name` is required so the line says which of the four workers failed. Every
 * failing tick logs, with no per-worker suppression: state that hides a
 * repeating error from an operator is the defect this boundary had. Volume
 * belongs to `LOG_LEVEL`.
 *
 * This boundary sees only an error that escapes the whole tick. Each worker's
 * drain also holds a per-item boundary inside its own loop, which catches
 * first; those log their own line. */
export function pollForever(name: string, tick: () => Promise<unknown>, intervalMs: number): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const loop = async (): Promise<void> => {
    try {
      await tick();
    } catch (e) {
      // Not assumed transient: a schema drift or an exhausted pool throws on
      // every tick forever, and this line is the only record of it.
      log.error("worker tick failed", { worker: name, error: e instanceof Error ? e.message : String(e) });
    }
    if (!stopped) timer = setTimeout(loop, intervalMs);
  };
  timer = setTimeout(loop, intervalMs);
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/**
 * The line every worker's per-item boundary writes. One function so the four
 * boundaries cannot drift on the message or on the ConcurrencyConflict rule.
 *
 * `item` is the identifier that boundary's own recovery keys on: an outbox
 * row's idempotency key, an instance id everywhere else.
 *
 * A ConcurrencyConflict logs at debug, not error. Two workers reaching one
 * instance together is what the OCC predicate is for, and the lease retries
 * the loser's row. An error line per race would teach an operator to ignore
 * the level. The boundary still discards no error without a line.
 */
export function logSkippedItem(worker: string, item: Record<string, string>, e: unknown): void {
  const context = { worker, ...item, error: e instanceof Error ? e.message : String(e) };
  if (e instanceof ConcurrencyConflict) log.debug("worker skipped a failing item", context);
  else log.error("worker skipped a failing item", context);
}
