/**
 * Canonical JSON per RFC 8785 (JCS): object keys sorted lexicographically,
 * arrays in order, no insignificant whitespace. A ProcessBody carries integers
 * and non-integers both (`fieldValidation.min`/`max`, a literal `default`,
 * `Path.priority`). RFC 8785 serializes a number the way ECMAScript does, and
 * `JSON.stringify` already does that, so no extra number handling is needed.
 *
 * Its own module, and in the package's `exports` map, so the studio's version
 * diff compares bodies by the same rule `definitionHash` defines identity by:
 * two bodies that hash alike must diff as identical, and key order is not part
 * of a body's identity. `hash.ts` cannot serve that directly — it imports
 * `node:crypto`, which does not belong in a browser bundle. One canonicalizer
 * for engine and editor, the same reason the CEL library is shared.
 */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}
