/**
 * Pure view-model helpers, mirroring the admin area's migrationsLogic.ts's
 * convention: everything a test can assert lives here, components stay thin.
 */
import { ReportingClientError } from "../api/client.js";
import type { ClientError, StepLabel } from "../api/types.js";
import type { UiLocale } from "../../../i18n/locale.js";
import { t } from "../catalog.js";

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

/** The unit catalog keys, largest first, with the millisecond size each one names. */
const DURATION_UNITS = [
  ["duration.d", 86_400_000],
  ["duration.h", 3_600_000],
  ["duration.min", 60_000],
  ["duration.s", 1000],
] as const;

/**
 * Durations here span seconds to weeks, so a fixed unit would read as either
 * noise or zero. Largest fitting unit, one decimal below ten, never more than
 * two components — a process owner comparing steps needs the magnitude, not
 * the milliseconds.
 *
 * The unit suffix comes from the catalog (`d` is `T` in German), and the
 * number goes through `Intl.NumberFormat`, so German reads `4,5 Std`. The `—`
 * stays a literal: it is a typographic mark, not a word.
 */
export function formatDuration(ms: number, locale: UiLocale): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const num = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (ms < 1000) return `${num(Math.round(ms))} ${t(locale, "duration.ms")}`;
  for (const [key, size] of DURATION_UNITS) {
    if (ms >= size) {
      const whole = Math.floor(ms / size);
      if (whole >= 10) return `${num(whole)} ${t(locale, key)}`;
      return `${num(Math.round((ms / size) * 10) / 10)} ${t(locale, key)}`;
    }
  }
  return `${num(Math.round(ms))} ${t(locale, "duration.ms")}`;
}

/** Whole percent in the locale's own form: German sets a space before the sign. */
export function formatPercent(rate: number, locale: UiLocale): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(rate);
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

/**
 * Process-owner-facing text for a `ClientError`, keyed on `error.type`. Same
 * shape and same reasoning as `areas/admin/errors.ts::describeError`: it never
 * reads `error.message`, since the server does not guarantee that string is
 * safe to show and sends none at all for an unexpected 500.
 *
 * The shared `api/client.ts::errorText` cannot serve here. Its last arm
 * returns `error.message`, which arrives from the server in English, and no
 * catalog reaches it.
 *
 * `ClientError` is the union of every server error type, so it carries
 * variants only another area provokes. One reaching a read-only report reads
 * as a generic failure rather than falling off the switch.
 */
export function describeError(error: ClientError, locale: UiLocale): string {
  switch (error.type) {
    case "authorization":
      return t(locale, "error.authorization");
    case "actor-resolution":
      return t(locale, "error.actorResolution");
    case "request-shape":
      return t(locale, "error.requestShape");
    case "not-found":
      return t(locale, "error.notFound");
    case "conflict":
      return t(locale, "error.conflict");
    case "network":
      return t(locale, "error.network");
    case "internal":
      return t(locale, "error.internal");
    default:
      return t(locale, "error.generic");
  }
}

/** The reports role, mirroring src/auth/authorize.ts::REPORTS_ROLE. The server enforces; this is presentational only. */
export const REPORTS_ROLE = "system:reports";
