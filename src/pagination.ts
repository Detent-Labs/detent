/**
 * Keyset-pagination cursor encode/decode, shared by `runtime/api.ts` (instance
 * listing, instance record) and `engine/admin-queries.ts` (outbox listing,
 * pending timers) — previously duplicated verbatim in both
 * (`PONYTAIL-AUDIT.md` finding 9). A cursor is base64url of a JSON array of
 * strings; `arity` is the tuple length the caller's query destructures (2 for
 * `(createdAt, id)`-shaped cursors, 3 for `getInstanceRecord`'s
 * `(transitionSeq, at, id)`), since different callers encode different
 * tuples.
 *
 * `decodeCursor` validates shallowly on purpose: "a JSON array of `arity`
 * strings" is exactly what `encodeCursor` produces, so this only rejects a
 * cursor that could not have come from this encoder — not one whose *values*
 * are stale or point past the end of a result set, which stays a legitimate
 * empty page (keyset pagination has always had that property).
 */
import { RequestShapeError } from "./errors.js";

export function encodeCursor(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}

export function decodeCursor(cursor: string, arity: number): string[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new RequestShapeError(`malformed cursor`);
  }
  if (!Array.isArray(decoded) || decoded.length !== arity || !decoded.every((v) => typeof v === "string")) {
    throw new RequestShapeError(`malformed cursor: expected an array of ${arity} strings`);
  }
  return decoded as string[];
}
