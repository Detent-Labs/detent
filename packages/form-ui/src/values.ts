/**
 * How a control's raw DOM value becomes the value `FieldForm` reports through
 * `onChange`, and how a stored value becomes a control's raw value. Pure
 * functions, so the mapping has one definition across every input branch and
 * a unit test can reach it without a render.
 */

/** A text-like control's value: an empty string means the participant cleared
 * it, which the engine reads as `null` (a removed field). */
export function textFromInput(raw: string): string | null {
  return raw === "" ? null : raw;
}

/** A `number` control's value: an empty string is a cleared field (`null`),
 * anything else is the number the browser accepted. */
export function numberFromInput(raw: string): number | null {
  return raw === "" ? null : Number(raw);
}

/** `Z` or a `±HH:MM` / `±HHMM` offset closing a date-time string. */
const ZONED_DATETIME = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i;
const OFFSET_WITHOUT_COLON = /([+-]\d{2})(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * The value a `datetime-local` input shows for a stored `datetime` string.
 * A string ending in `Z` or a `±HH:MM` offset becomes local `YYYY-MM-DDTHH:mm`
 * (`:ss` only when the seconds are non-zero). A zoneless or unparsable string
 * comes back unchanged. The stored value is never rewritten: this converts for
 * display alone.
 *
 * `localOffsetMinutes` is the display zone's offset east of UTC, in minutes
 * (UTC+02:00 is 120). Omitted, the browser's own zone applies.
 *
 * ponytail: typing in the input yields a zoneless local string, so the stored
 * value's original zone is dropped on the first edit. The ceiling is a process
 * that needs the author's zone kept. The upgrade entry point is to carry the
 * offset back out of this conversion into the reported value.
 */
export function datetimeInputValue(value: string, localOffsetMinutes?: number): string {
  if (!ZONED_DATETIME.test(value)) return value;
  const date = new Date(value.replace(OFFSET_WITHOUT_COLON, "$1:$2"));
  if (Number.isNaN(date.getTime())) return value;
  let y: number, mo: number, d: number, h: number, mi: number, s: number;
  if (localOffsetMinutes === undefined) {
    [y, mo, d, h, mi, s] = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  } else {
    const shifted = new Date(date.getTime() + localOffsetMinutes * 60_000);
    [y, mo, d, h, mi, s] = [
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
      shifted.getUTCHours(),
      shifted.getUTCMinutes(),
      shifted.getUTCSeconds(),
    ];
  }
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}${s === 0 ? "" : `:${pad(s)}`}`;
}
