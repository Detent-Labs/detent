/**
 * Pure view-model helpers, mirroring the admin area's migrationsLogic.ts's
 * convention: everything a test can assert lives here, components stay thin.
 */
import { ReportingClientError } from "../api/client.js";
import type { ClientError, StepLabel } from "../api/types.js";

export type DateRange = { from: string; to: string };

export const DEFAULT_RANGE_DAYS = 30;

/**
 * The last thirty days, computed here and sent explicitly on every request.
 * The server applies no default of its own, so an omitted range would be a
 * request error rather than a silently assumed window.
 *
 * The bounds sit on local day edges, the same ones `fromDateInput` produces,
 * so the control redisplays this range unchanged. That widens the window past
 * thirty days: it runs from local midnight thirty days back to the last
 * millisecond of today, up to thirty-one local days. It still covers the
 * thirty days before `now`, which is what the requirement asks for.
 *
 * `now` is injectable so a test can assert against a fixed instant.
 */
export function defaultRange(now: Date = new Date()): DateRange {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DEFAULT_RANGE_DAYS);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * `<input type="date">` speaks YYYY-MM-DD; the API speaks ISO instants. The
 * day is the viewer's local day: reading it back with `iso.slice(0, 10)` would
 * take the UTC day, which is the previous one for any instant before local
 * midnight plus the offset.
 */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Start of day for `from`, end of day for `to`, so a one-day range covers that
 * whole day — the local day the viewer picked, not the UTC one. The local
 * `Date` constructor is what makes it local: appending a `Z` would pin the
 * boundary to UTC midnight, and `getTimezoneOffset()` arithmetic would break
 * across a DST shift inside the range.
 *
 * A value the control cannot parse yields an empty string, which
 * `rangeIsValid` rejects and the area's root renders as an invalid range.
 * Clearing the field is the way to reach that: `<input type="date">` reports
 * an empty value, and `toISOString()` on the resulting Invalid Date would
 * throw where nothing catches it.
 */
export function fromDateInput(value: string, edge: "start" | "end"): string {
  const [y, m, d] = value.split("-").map(Number);
  const at =
    edge === "start"
      ? new Date(y, m - 1, d)
      : new Date(y, m - 1, d, 23, 59, 59, 999);
  return Number.isNaN(at.getTime()) ? "" : at.toISOString();
}

export function rangeIsValid(range: DateRange): boolean {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  return !Number.isNaN(from) && !Number.isNaN(to) && from <= to;
}

/**
 * Durations here span seconds to weeks, so a fixed unit would read as either
 * noise or zero. Largest fitting unit, one decimal below ten, never more than
 * two components — a process owner comparing steps needs the magnitude, not
 * the milliseconds.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const units: [string, number][] = [["d", 86_400_000], ["h", 3_600_000], ["min", 60_000], ["s", 1000]];
  for (const [suffix, size] of units) {
    if (ms >= size) {
      const whole = Math.floor(ms / size);
      if (whole >= 10) return `${whole} ${suffix}`;
      const tenths = Math.round((ms / size) * 10) / 10;
      return `${tenths} ${suffix}`;
    }
  }
  return `${Math.round(ms)} ms`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Base-locale label with the key as the fallback, so a step never renders blank. */
export function stepName(step: StepLabel, baseLocale: string): string {
  return step.label[baseLocale] ?? Object.values(step.label)[0] ?? step.key;
}

/**
 * Share of the widest value in the set, as a 0..1 fraction — what the duration
 * rule's width is bound to. An all-zero set yields zero width rather than a
 * divide-by-zero, so a process whose steps all completed instantly renders a
 * flat set of rules instead of NaN.
 */
export function scaleTo(values: number[]): (value: number) => number {
  const max = Math.max(0, ...values);
  return (value: number) => (max <= 0 ? 0 : Math.max(0, Math.min(1, value / max)));
}

/** Longest median first. Pure so the ordering is asserted without rendering a component. */
export function rankByMedian<T extends { medianMs: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.medianMs - a.medianMs);
}

/**
 * A failed load renders as a failure, never as an empty result
 * (spa-error-reporting). An unrecognised throw still yields a stated error
 * rather than a screen that looks like "no data".
 */
export function describeCaughtError(cause: unknown): ClientError {
  if (cause instanceof ReportingClientError) return cause.error;
  return { type: "internal", message: cause instanceof Error ? cause.message : "Unexpected error" };
}

/** The reports role, mirroring src/auth/authorize.ts::REPORTS_ROLE. The server enforces; this is presentational only. */
export const REPORTS_ROLE = "system:reports";
