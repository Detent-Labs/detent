/**
 * Canonical JSON per RFC 8785 (JCS): object keys sorted lexicographically,
 * arrays in order, no insignificant whitespace. A ProcessBody carries only
 * strings, integers, booleans, null, arrays and objects — for which JSON's own
 * number/string forms already match JCS.
 *
 * Its own module, and in the package's `exports` map, so the studio's version
 * diff compares bodies by the same rule `definitionHash` defines identity by:
 * two bodies that hash alike must diff as identical, and key order is not part
 * of a body's identity. `hash.ts` cannot serve that directly — it imports
 * `node:crypto`, which does not belong in a browser bundle. One canonicalizer
 * for engine and editor, the same reason the CEL library is shared.
 *
 * ponytail: full RFC-8785 number canonicalization (exponent/precision) only
 * matters if a non-integer number ever enters a ProcessBody; add it then.
 */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}
