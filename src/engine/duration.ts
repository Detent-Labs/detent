/**
 * ISO 8601 duration -> milliseconds, for computing a timer's fire time at step
 * entry. v1 supports fixed-length units only: weeks, days, hours, minutes,
 * seconds. Calendar units (years, months) are ambiguous without a date library
 * and are rejected. ponytail: fixed units cover every timer the engine needs
 * (reminders, escalation deadlines); add calendar math only if a real Y/M timer
 * appears.
 */

import { evaluate } from "@marcbachmann/cel-js";
import { buildGuardContext, SYSTEM_ACTOR } from "../cel/eval.js";
import { parseIsoDuration } from "../schema/definition.js";
import type {
  Instance,
  ProcessBody,
  Step,
  TimerState,
  TimerUnarmedReason,
} from "../schema/definition.js";

/**
 * Unreachable for a body published after the duration check landed:
 * `validateDurations` (src/schema/compile.ts) runs the same `parseIsoDuration`
 * at publish, so a malformed value is a publish error. It stays reachable for a
 * body published before it, which is why the throw is kept — arming a wrong
 * instant silently is worse than failing loudly.
 */
export function durationMs(d: string): number {
  const ms = parseIsoDuration(d);
  if (ms === null)
    throw new Error(`unsupported ISO 8601 duration (v1 supports W/D/H/M/S, no calendar units): ${d}`);
  return ms;
}

/** entry instant (ISO) + ISO 8601 duration -> ISO fire time (UTC, sortable). */
export function addDuration(instant: string, dur: string): string {
  return new Date(new Date(instant).getTime() + durationMs(dur)).toISOString();
}

// The accepted instant forms, as a whitelist. `new Date()` must never see a string
// this does not match: for anything outside strict ISO-8601 it falls back to an
// implementation-defined legacy parser that reads the value in the HOST's zone
// ("2026-08-01 10:00:00", "12/25/2026") and that accepts strings denoting no date
// at all ("5" -> 2001-04-30, "2026" -> 2026-01-01). Either would make a persisted
// fireAt depend on which machine committed the entry, or arm a garbage value in the
// past that the scheduler fires immediately.
//
// The year is fixed at 4 digits deliberately. `toISOString()` emits the 27-char
// expanded-year form (`+275760-09-13T...`) outside 0001-9999, and `+` (0x2B) sorts
// before every digit — one such fireAt would win minFireAt's lexical sort and
// suppress every other timer on the step.
const INSTANT = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:?\d{2})?)?$/;

/** The exact width of `toISOString()` for a 4-digit year: YYYY-MM-DDTHH:mm:ss.sssZ. */
const ISO_WIDTH = 24;

/**
 * A value denoting an instant -> UTC ISO-8601 (the shape addDuration produces, so
 * the two sort together in minFireAt), or null if it is not a parseable instant.
 * Accepts date-only (midnight UTC), `Z`-suffixed, and offset-bearing values
 * (converted to UTC). A datetime carrying no zone is read as UTC, never host-local,
 * so the same data arms the same fireAt on every worker. `T` and a space both
 * separate date from time — the latter is what a Postgres timestamp stringifies to.
 * Total: a non-string, a form outside the whitelist, or an unparseable value is
 * null, never a throw.
 */
export function instantFromValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = INSTANT.exec(v.trim());
  if (!m) return null;
  const [, date, time, zone] = m;
  const d = new Date(time === undefined ? `${date}T00:00:00Z` : `${date}T${time}${zone ?? "Z"}`);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  // The fixed width minFireAt's lexical sort rests on. Unreachable given the
  // 4-digit year above; asserted rather than assumed because a violation is silent.
  return iso.length === ISO_WIDTH ? iso : null;
}

/** A declared timer that produced no fireAt at entry, with the reason it was dropped. */
export type TimerDrop = { timerId: TimerState["timerId"]; reason: TimerUnarmedReason };

/**
 * What arming produced: the timers that will fire, and the ones that will not.
 * `armed` replaces the previous step's TimerState[]; `drops` is what the caller
 * persists as `timer.unarmed` events in the same commit as the entry.
 */
export type ArmedTimers = { armed: TimerState[]; drops: TimerDrop[] };

/**
 * Arm a step's timers at entry. A `duration` timer's fireAt is the entry instant
 * plus its ISO-8601 duration; a `deadline` timer's is the instant its CEL
 * expression yields, evaluated once here over the guard context and persisted like
 * any other armed timer — downstream (minFireAt, next_timer_at, fireTimer) cannot
 * tell the two apart. The returned set replaces the previous step's timers,
 * disarming them. Homed here (not in transition.ts) so both the transition commit
 * and instance creation can arm without a store<->transition import cycle.
 *
 * `entering` is the instance as of the entry being committed — the target step and
 * its new transitionSeq for a transition, the seed for a creation — so a deadline
 * reading `instance.*` sees the step it is armed on. Its `timers` are the ones this
 * call produces and are not part of the CEL context (INSTANCE_SCHEMA does not
 * expose them), so passing it pre-arming is not a lie about the evaluated context.
 * The acting identity is SYSTEM_ACTOR: creation has no acting user, and one
 * identity keeps arming identical whether a step is entered initially or via a
 * transition. A deadline reading `actor` is an authoring smell, not a pattern.
 *
 * The deadline branch is total. It runs inside the transition commit, so a deadline
 * that raises (most commonly reading a field not yet written into `data`) or yields
 * a value that is not a parseable instant omits that timer rather than failing the
 * entry — the same stance guard totality takes. The omission is reported in `drops`,
 * with the reason distinguished at the point that knows it: the catch around
 * evaluation versus a null from `instantFromValue`, which is total and so returns
 * null for exactly one reason. A deadline already in the past arms as-is; the
 * scheduler's due-timer poll fires it on its next pass.
 *
 * Pure: it returns the drops rather than persisting them, since it runs inside the
 * transition commit and its contract is to compute the armed set. Each call site
 * writes them as `timer.unarmed` events in that same commit.
 *
 * The duration branch raises rather than dropping the timer, and two things can
 * make it raise. Neither is silent, so neither needs the drop channel.
 *
 * `durationMs` raises only for a body published before `validateDurations` existed,
 * since that check now rejects the grammar violation at publish.
 *
 * The width assertion covers what the publish-time magnitude bound cannot. That
 * bound guarantees no overflow from any entry instant before year 9000; it says
 * nothing about an entry at or after it. So the reachable case is exactly an entry
 * instant in the last thousand years of the four-digit-year window — not authoring
 * input, and not reachable while entry instants come from a real clock. The width
 * is checked rather than inferred because the bound is static while the produced
 * instant is not; this mirrors the deadline branch, where the whitelist bounds the
 * input and ISO_WIDTH asserts the output.
 */
export function armStepTimers(
  step: Step | undefined,
  entryInstant: string,
  body: ProcessBody,
  entering: Instance,
): ArmedTimers {
  const armed: TimerState[] = [];
  const drops: TimerDrop[] = [];
  // Built at most once per entry, and only if the step declares a deadline.
  let ctx: Record<string, unknown> | undefined;
  for (const t of step?.timers ?? []) {
    if (t.duration) {
      const fireAt = addDuration(entryInstant, t.duration);
      if (fireAt.length !== ISO_WIDTH)
        throw new Error(
          `timer ${t.id}: ${entryInstant} + ${t.duration} leaves the four-digit-year range (${fireAt})`,
        );
      armed.push({
        timerId: t.id,
        fireAt: fireAt as TimerState["fireAt"],
        provenance: { kind: "duration", duration: t.duration, armedAt: entryInstant as TimerState["fireAt"] },
      });
      continue;
    }
    if (!t.deadline) continue;
    ctx ??= buildGuardContext(body, entering, SYSTEM_ACTOR);
    let value: unknown;
    try {
      value = evaluate(t.deadline.src, ctx);
    } catch {
      drops.push({ timerId: t.id, reason: "expression-raised" });
      continue;
    }
    // instantFromValue is total, so null here means exactly one thing.
    const fireAt = instantFromValue(value);
    if (fireAt === null) {
      drops.push({ timerId: t.id, reason: "not-an-instant" });
      continue;
    }
    armed.push({
      timerId: t.id,
      fireAt: fireAt as TimerState["fireAt"],
      provenance: { kind: "deadline", src: t.deadline.src, armedAt: entryInstant as TimerState["fireAt"] },
    });
  }
  return { armed, drops };
}

/** The earliest fireAt among unfired timers (ISO strings sort chronologically), or null. */
export function minFireAt(timers: TimerState[]): string | null {
  const live = timers.filter((t) => !t.fired).map((t) => t.fireAt as string);
  return live.length ? [...live].sort()[0] : null;
}
