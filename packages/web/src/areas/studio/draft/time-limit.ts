import { MAX_TIMER_DURATION_MS, parseIsoDuration } from "workflow-engine/schema";

/**
 * The number-and-unit reading of a `Timer.duration`
 * (`studio-guided-vocabulary`). The control an author uses reads a number and
 * a unit; the definition still carries the ISO-8601 duration the contract
 * requires.
 *
 * Three units, no more. Minutes and seconds belong to a machine, and a month
 * is not an ISO duration this engine accepts (`parseIsoDuration` takes W/D/H/
 * M/S and no calendar unit).
 */
export type TimeLimitUnit = "hours" | "days" | "weeks";

export interface TimeLimitParts {
  count: number;
  unit: TimeLimitUnit;
}

const UNIT_MS: Record<TimeLimitUnit, number> = {
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

/** Largest first, so `PT72H` reads as three days rather than 72 hours. */
const LARGEST_FIRST: readonly TimeLimitUnit[] = ["weeks", "days", "hours"];

/**
 * The number and unit a duration reads as, or `undefined` when the pair
 * cannot state it. `P1DT4H30M` is the ordinary undefined case: it divides
 * into no whole number of hours, so no unit here holds it. The caller prints
 * such a duration in the mono face and leaves it exactly as it stands.
 *
 * A duration outside the engine's grammar, and a zero-length one, are
 * undefined too: neither is a time limit an author can read off a pair.
 */
export function timeLimitParts(duration: string | undefined): TimeLimitParts | undefined {
  if (duration === undefined) return undefined;
  const ms = parseIsoDuration(duration);
  if (ms === null || ms <= 0) return undefined;
  for (const unit of LARGEST_FIRST) {
    if (ms % UNIT_MS[unit] === 0) return { count: ms / UNIT_MS[unit], unit };
  }
  return undefined;
}

/** The ISO-8601 duration a number and a unit write. Weeks and days take the
 * date part, hours the time part, exactly as ISO 8601 orders them. */
export function timeLimitDuration({ count, unit }: TimeLimitParts): string {
  if (unit === "weeks") return `P${count}W`;
  if (unit === "days") return `P${count}D`;
  return `PT${count}H`;
}

/**
 * The largest number this unit may carry. `entryInstant + duration` has to
 * stay inside the four-digit-year window, which is the bound
 * `compile.ts::validateDurations` enforces at publish through
 * `MAX_TIMER_DURATION_MS`. The control refuses a larger number, so the publish
 * check never has to.
 */
export function maxTimeLimitCount(unit: TimeLimitUnit): number {
  return Math.floor(MAX_TIMER_DURATION_MS / UNIT_MS[unit]);
}

/** Whether a number and a unit name a time limit the window can hold. A
 * fractional or non-positive count fails too: neither writes a duration the
 * grammar accepts. */
export function timeLimitInRange({ count, unit }: TimeLimitParts): boolean {
  if (!Number.isInteger(count) || count <= 0) return false;
  return count <= maxTimeLimitCount(unit);
}
