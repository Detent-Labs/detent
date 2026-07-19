/**
 * ISO 8601 duration -> milliseconds, for computing a timer's fire time at step
 * entry. v1 supports fixed-length units only: weeks, days, hours, minutes,
 * seconds. Calendar units (years, months) are ambiguous without a date library
 * and are rejected. ponytail: fixed units cover every timer the engine needs
 * (reminders, escalation deadlines); add calendar math only if a real Y/M timer
 * appears.
 */

import type { Step, TimerState } from "../schema/definition.js";

const ISO_DURATION = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

export function durationMs(d: string): number {
  const m = ISO_DURATION.exec(d);
  if (!m || d === "P" || d === "PT")
    throw new Error(`unsupported ISO 8601 duration (v1 supports W/D/H/M/S, no calendar units): ${d}`);
  const [, w, days, h, min, s] = m;
  const secs =
    Number(w ?? 0) * 604800 +
    Number(days ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Number(s ?? 0);
  return secs * 1000;
}

/** entry instant (ISO) + ISO 8601 duration -> ISO fire time (UTC, sortable). */
export function addDuration(instant: string, dur: string): string {
  return new Date(new Date(instant).getTime() + durationMs(dur)).toISOString();
}

/**
 * Arm a step's timers at entry: each `duration` timer's fireAt is the entry instant
 * plus its ISO-8601 duration. `deadline` timers are deferred (v1) and skipped. The
 * returned set replaces the previous step's timers, disarming them. Homed here (not
 * in transition.ts) so both the transition commit and instance creation can arm
 * without a store<->transition import cycle.
 */
export function armStepTimers(step: Step | undefined, entryInstant: string): TimerState[] {
  return (step?.timers ?? [])
    .filter((t) => t.duration)
    .map((t) => ({ timerId: t.id, fireAt: addDuration(entryInstant, t.duration as string) as TimerState["fireAt"] }));
}

/** The earliest fireAt among unfired timers (ISO strings sort chronologically), or null. */
export function minFireAt(timers: TimerState[]): string | null {
  const live = timers.filter((t) => !t.fired).map((t) => t.fireAt as string);
  return live.length ? [...live].sort()[0] : null;
}
