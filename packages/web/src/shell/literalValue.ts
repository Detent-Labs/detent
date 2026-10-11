/**
 * Parsing of a comparison literal for the two builders that write one: the
 * studio's `instance.query` form and the report builder. The engine compares
 * `jsonb` by type, so a number field needs the number `5` and never the
 * string `"5"`. Pure: no DOM, no React.
 */

export type ValueType = "string" | "number" | "boolean";
export type LiteralValue = string | number | boolean;
export type ParseFailure = "empty" | "not-number" | "not-boolean";
export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: ParseFailure };

// ponytail: a number past 2^53 loses precision in `Number()`. Upgrade entry
// point: parse the digits as a decimal string and keep the text.
const NUMBER = /^-?\d+(\.\d+)?$/;

/** `"number"` or `"boolean"` for those declared base types, `"string"` for the rest, `undefined` included. */
export function literalType(declared: string | undefined): ValueType {
  return declared === "number" || declared === "boolean" ? declared : "string";
}

/**
 * Number grammar `/^-?\d+(\.\d+)?$/` after trim, finite: it rejects an
 * exponent, a hex digit and a thousands separator, so one text means one number
 * in every locale. Boolean: trimmed, case-insensitive `true` or `false`.
 * String: unchanged, spaces included; only zero-length text is `empty`.
 */
export function parseLiteral(text: string, type: ValueType): Parsed<LiteralValue> {
  if (type === "string") {
    return text.length === 0 ? { ok: false, reason: "empty" } : { ok: true, value: text };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (type === "number") {
    const value = Number(trimmed);
    return NUMBER.test(trimmed) && Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, reason: "not-number" };
  }
  const lower = trimmed.toLowerCase();
  if (lower === "true") return { ok: true, value: true };
  if (lower === "false") return { ok: true, value: false };
  return { ok: false, reason: "not-boolean" };
}

/**
 * Splits on commas, trims each member and skips an empty one. Fails `empty`
 * when no member remains. The first bad member sets the failure reason.
 */
export function parseLiteralList(text: string, type: ValueType): Parsed<LiteralValue[]> {
  const members = text
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
  if (members.length === 0) return { ok: false, reason: "empty" };
  const values: LiteralValue[] = [];
  for (const member of members) {
    const parsed = parseLiteral(member, type);
    if (!parsed.ok) return parsed;
    values.push(parsed.value);
  }
  return { ok: true, value: values };
}

/**
 * Display text for a stored value: a string as is, a number or boolean through
 * `String`, an array joined with a comma and a space, anything else empty.
 */
export function literalText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(literalText).join(", ");
  return "";
}

function scalarType(value: unknown): ValueType | undefined {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return undefined;
}

/**
 * The value type a stored literal has: a scalar gives its own, an array gives
 * its first member's, anything else `undefined`.
 */
export function valueTypeOf(value: unknown): ValueType | undefined {
  return scalarType(Array.isArray(value) ? value[0] : value);
}

/**
 * Deep equality for a scalar or an array of scalars. A row's reseed guard
 * compares a stored value with its own parsed text through this. `===` makes
 * `-0` equal `0`, the way a JSON round trip does.
 */
export function sameLiteral(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((member, i) => sameLiteral(member, b[i]))
    );
  }
  return a === b;
}
