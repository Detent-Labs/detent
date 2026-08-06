/**
 * Timer scheduler. Polls instances whose `next_timer_at` is due and fires the
 * earliest unfired timer on each. Firing is OCC-guarded (`fireTimer`), so no claim
 * or lease is needed: two schedulers firing the same timer collapse to one, and a
 * crashed fire leaves `next_timer_at` due for the next poll. Like the resolution
 * worker it needs the instance's pinned frozen body, so it takes an injected
 * `resolveBody`; a resolver returning `undefined` leaves the instance for a later
 * pass (inert in production until a definition store is wired).
 */

import type { SQL } from "bun";
import { sql } from "./store.js";
import { fireTimer } from "./transition.js";
import { createDefaultAssignmentRegistry, type AssignmentRegistry } from "./registry.js";
import { instance as instanceSchema, type Instance } from "../schema/definition.js";
import type { ResolveBody } from "./resolution.js";
import { pollForever, logSkippedItem } from "./poll.js";

function parseInstance(raw: unknown): Instance {
  return instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/**
 * Push an instance out of the due scan by a bounded interval, predicated on the
 * `next_timer_at` value this pass observed. The predicate is what makes it safe:
 * a concurrent `fireTimer` or a step entry that re-armed the timer has already
 * changed `next_timer_at`, so a stale push matches zero rows and clobbers
 * nothing. One minute is long enough that a stuck row stops being a 2 Hz write
 * loop and short enough that a transient fault self-heals within a human's
 * attention span — not tuned, and does not need to be. Failures here are
 * swallowed by the caller's own boundary: a push that cannot land leaves the
 * row exactly where it already is, no worse than before this existed.
 */
async function pushOutOfScan(db: SQL, instanceId: string, observedNextTimerAt: unknown): Promise<void> {
  await db`UPDATE instances SET next_timer_at = now() + interval '1 minute'
    WHERE instance_id = ${instanceId} AND next_timer_at = ${observedNextTimerAt}`;
}

/**
 * One scheduler pass. For each running instance whose `next_timer_at` has elapsed,
 * fire the earliest unfired timer whose `fireAt` is in the past. Returns the number
 * of timers fired. At most one timer per instance per pass — a further due timer is
 * picked up next pass (a reminder recomputes `next_timer_at` to it; a transition
 * timer moves the instance).
 */
export async function drainTimers(
  db: SQL = sql,
  resolveBody: ResolveBody = () => undefined,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<number> {
  const dueRows = (await db`SELECT instance_id, body, next_timer_at FROM instances
    WHERE (body->>'status') = 'running' AND next_timer_at IS NOT NULL AND next_timer_at <= now()
    ORDER BY next_timer_at
    LIMIT 100`) as { instance_id: string; body: unknown; next_timer_at: unknown }[];

  const nowMs = Date.now();
  let fired = 0;
  for (const row of dueRows) {
    // The whole per-instance body — parse, resolve, due-timer selection, and the
    // fire — is inside the boundary. The scan is ORDER BY next_timer_at, so a
    // corrupt row with the earliest due time would otherwise re-throw at the head
    // of every pass and block every instance behind it.
    //
    // A skip alone is not enough: next_timer_at stays due, so an unprocessable
    // instance would be re-selected on every pass — a permanent write loop, and,
    // at a hundred such instances, a batch no other instance can enter. A
    // resolver miss and a caught error therefore also push the row out of the
    // scan for a bounded interval; a "no due timer on this instance" outcome
    // does NOT push — that is a normal result of the scan, not a failure, and
    // pushing it would delay a timer this same read already knows is due.
    try {
      const inst = parseInstance(row.body);
      const body = await resolveBody(inst.processId, inst.version);
      if (!body) {
        await pushOutOfScan(db, row.instance_id, row.next_timer_at); // resolver miss: leave for a later pass
        continue;
      }
      const dueTimer = (inst.timers ?? [])
        .filter((t) => !t.fired && new Date(t.fireAt).getTime() <= nowMs)
        .sort((a, b) => ((a.fireAt as string) < (b.fireAt as string) ? -1 : 1))[0];
      if (!dueTimer) continue;
      await fireTimer(inst, dueTimer.timerId, body, db, assignmentRegistry);
      fired++;
    } catch (e) {
      // A lost OCC race (ConcurrencyConflict), a parse/resolve failure, or any
      // per-instance error: log it, push the row out and continue. The drain
      // returns normally, so the tick boundary never sees this and an instance
      // failing every pass is otherwise invisible. A ConcurrencyConflict logs
      // at debug — logSkippedItem holds that rule for all four workers.
      logSkippedItem("timers", { instanceId: row.instance_id }, e);
      await pushOutOfScan(db, row.instance_id, row.next_timer_at).catch(() => {});
    }
  }
  return fired;
}

/** Poll drainTimers on an interval. Returns a stop handle. */
export function startTimerScheduler(
  db: SQL = sql,
  resolveBody: ResolveBody = () => undefined,
  intervalMs = 500,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): { stop: () => void } {
  return pollForever("timers", () => drainTimers(db, resolveBody, assignmentRegistry), intervalMs);
}
