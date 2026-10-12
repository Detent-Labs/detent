/**
 * The one check for "is this string an ISO-8601 instant Postgres will cast to
 * `timestamptz`". Shared by the `GET /instances` date filters, the report
 * schema and the typed `timestamp` pagination cursor, so a bad value answers
 * 400 where the cast would otherwise raise an untyped error and answer 500.
 */
import { RequestShapeError } from "./errors.js";

/** `YYYY-MM-DD`, then optionally `T` or a space, `HH:MM`, `:SS[.fraction]` and `Z` or `±HH[:MM]`. */
const INSTANT_SHAPE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-](\d{2})(?::?[0-5]\d)?)?)?$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * ponytail: knows no leap seconds and no time zone database. A value Postgres
 * rejects for those reasons still reaches the cast and answers 500 through
 * `mapError`. It also reads only the ISO `DateStyle` output of a
 * `timestamptz::text` cursor. Upgrade entry point: this function.
 */
export function isInstant(raw: string): boolean {
  const match = INSTANT_SHAPE.exec(raw);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Postgres has no year 0, and admits numeric offsets up to 15:59 only.
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  if (match[5] !== undefined && Number(match[5]) > 15) return false;
  return !Number.isNaN(instantMs(raw));
}

/** `Date.parse` of an accepted instant. Bun rejects a bare `T…±HH` offset that Postgres writes, so it gets `±HH:00`. */
export function instantMs(raw: string): number {
  return Date.parse(raw.replace(" ", "T").replace(/(T.*[+-]\d{2})$/, "$1:00"));
}

/** Returns `raw` when it is an ISO-8601 instant, else raises the 400 `label` names. */
export function parseInstant(raw: string, label: string): string {
  if (!isInstant(raw)) throw new RequestShapeError(`${label} must be an ISO-8601 instant, got '${raw}'`);
  return raw;
}
