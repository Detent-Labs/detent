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
import { instance as instanceSchema, type Instance } from "../schema/definition.js";
import type { ResolveBody } from "./resolution.js";

function parseInstance(raw: unknown): Instance {
  return instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/**
 * One scheduler pass. For each running instance whose `next_timer_at` has elapsed,
 * fire the earliest unfired timer whose `fireAt` is in the past. Returns the number
 * of timers fired. At most one timer per instance per pass — a further due timer is
 * picked up next pass (a reminder recomputes `next_timer_at` to it; a transition
 * timer moves the instance).
 */
export async function drainTimers(db: SQL = sql, resolveBody: ResolveBody = () => undefined): Promise<number> {
  const dueRows = (await db`SELECT instance_id, body FROM instances
    WHERE (body->>'status') = 'running' AND next_timer_at IS NOT NULL AND next_timer_at <= now()
    ORDER BY next_timer_at
    LIMIT 100`) as { instance_id: string; body: unknown }[];

  const nowMs = Date.now();
  let fired = 0;
  for (const row of dueRows) {
    // The whole per-instance body — parse, resolve, due-timer selection, and the
    // fire — is inside the boundary. The scan is ORDER BY next_timer_at, so a
    // corrupt row with the earliest due time would otherwise re-throw at the head
    // of every pass and block every instance behind it. A skip leaves
    // next_timer_at due, so a later pass retries — as for a lost firing race.
    try {
      const inst = parseInstance(row.body);
      const body = await resolveBody(inst.processId, inst.version);
      if (!body) continue; // resolver miss: leave for a later pass
      const dueTimer = (inst.timers ?? [])
        .filter((t) => !t.fired && new Date(t.fireAt).getTime() <= nowMs)
        .sort((a, b) => ((a.fireAt as string) < (b.fireAt as string) ? -1 : 1))[0];
      if (!dueTimer) continue;
      await fireTimer(inst, dueTimer.timerId, body, db);
      fired++;
    } catch {
      // A lost OCC race (ConcurrencyConflict), a parse/resolve failure, or any
      // per-instance error: skip and continue; next_timer_at stays due.
    }
  }
  return fired;
}

/** Poll drainTimers on an interval. Returns a stop handle. */
export function startTimerScheduler(
  db: SQL = sql,
  resolveBody: ResolveBody = () => undefined,
  intervalMs = 500,
): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async (): Promise<void> => {
    try {
      await drainTimers(db, resolveBody);
    } catch {
      // transient (e.g. DB blip); the next tick retries.
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
