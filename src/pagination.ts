/**
 * Keyset-pagination cursor encode/decode, shared by `runtime/api.ts` (instance
 * listing, instance record) and `engine/admin-queries.ts` (outbox listing,
 * pending timers) — previously duplicated verbatim in both, until the
 * archived change `2026-07-29-correct-api-error-responses` extracted it. A
 * cursor is base64url of a JSON array of strings; its position kinds are the
 * tuple the caller's query destructures (`["timestamp", "text"]` for
 * `(createdAt, id)`-shaped cursors, `["int32", "text", "text"]` for
 * `getInstanceRecord`'s `(transitionSeq, at, id)`), since different callers
 * encode different tuples.
 *
 * `decodeCursor` checks the *kind* of every position, because the server
 * interpolates each one into a Postgres cast (`::timestamptz`, `::int`,
 * `::bigint`) and a value the cast rejects would answer 500. It does not
 * check that a value exists: a cursor whose values are stale or point past
 * the end of a result set stays a legitimate empty page (keyset pagination
 * has always had that property).
 */
import { RequestShapeError } from "./errors.js";
import { isInstant } from "./instant.js";

/** What one cursor position holds, read off the SQL cast of the query that consumes it. */
export type CursorKind = "timestamp" | "int32" | "int64" | "text";

const INT32_MAX = 2147483647n;
const INT64_MAX = 9223372036854775807n;

const KIND_CHECKS: Record<CursorKind, (v: string) => boolean> = {
  timestamp: isInstant,
  int32: (v) => /^\d+$/.test(v) && BigInt(v) <= INT32_MAX,
  int64: (v) => /^\d+$/.test(v) && BigInt(v) <= INT64_MAX,
  // Postgres text cannot hold a NUL character.
  text: (v) => !v.includes("\u0000"),
};

export function encodeCursor(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}

export function decodeCursor(cursor: string, kinds: readonly CursorKind[]): string[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new RequestShapeError(`malformed cursor`);
  }
  if (!Array.isArray(decoded) || decoded.length !== kinds.length || !decoded.every((v) => typeof v === "string")) {
    throw new RequestShapeError(`malformed cursor: expected an array of ${kinds.length} strings`);
  }
  const values = decoded as string[];
  values.forEach((value, i) => {
    if (!KIND_CHECKS[kinds[i]](value)) throw new RequestShapeError(`malformed cursor: position ${i} is not a valid ${kinds[i]}`);
  });
  return values;
}
