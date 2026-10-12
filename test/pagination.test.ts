/**
 * src/pagination.ts: `decodeCursor` checks the kind of every cursor position.
 * Pure function tests, no database; the per-listing tests live in
 * cursor-values.test.ts.
 */
import { test, expect } from "bun:test";
import { encodeCursor, decodeCursor, type CursorKind } from "../src/pagination.js";
import { RequestShapeError } from "../src/errors.js";

/** One accepted and the rejected values of each kind. */
const CASES: Record<CursorKind, { accepted: string[]; rejected: string[] }> = {
  timestamp: {
    accepted: ["2026-10-11 10:00:00.123456+00", "2026-10-11T10:00:00Z"],
    rejected: ["gestern", "2026-02-30 10:00:00+00", ""],
  },
  int32: {
    accepted: ["0", "2147483647"],
    rejected: ["2147483648", "-1", "1.5", "abc", ""],
  },
  int64: {
    accepted: ["0", "9223372036854775807"],
    rejected: ["9223372036854775808", "-1", "1e3", ""],
  },
  text: {
    accepted: ["inst_x", "", "ünïcode"],
    rejected: ["a\u0000b", "\u0000"],
  },
};

for (const [kind, { accepted, rejected }] of Object.entries(CASES) as [CursorKind, (typeof CASES)[CursorKind]][]) {
  test(`decodeCursor kind '${kind}' accepts its values`, () => {
    for (const value of accepted) expect(decodeCursor(encodeCursor([value]), [kind])).toEqual([value]);
  });

  test(`decodeCursor kind '${kind}' rejects a value of the wrong kind with a RequestShapeError`, () => {
    for (const value of rejected) expect(() => decodeCursor(encodeCursor([value]), [kind])).toThrow(RequestShapeError);
  });
}

test("decodeCursor checks each position against its own kind", () => {
  const kinds: CursorKind[] = ["int32", "text", "timestamp"];
  expect(decodeCursor(encodeCursor(["7", "id", "2026-10-11T10:00:00Z"]), kinds)).toEqual(["7", "id", "2026-10-11T10:00:00Z"]);
  expect(() => decodeCursor(encodeCursor(["7", "id", "gestern"]), kinds)).toThrow(RequestShapeError);
  expect(() => decodeCursor(encodeCursor(["x", "id", "2026-10-11T10:00:00Z"]), kinds)).toThrow(RequestShapeError);
});

test("decodeCursor still rejects a wrong arity, non-base64 JSON and non-string elements", () => {
  expect(() => decodeCursor(encodeCursor(["only-one"]), ["text", "text"])).toThrow(RequestShapeError);
  expect(() => decodeCursor("%%%", ["text"])).toThrow(RequestShapeError);
  expect(() => decodeCursor(Buffer.from(JSON.stringify([1])).toString("base64url"), ["int32"])).toThrow(RequestShapeError);
  expect(() => decodeCursor(Buffer.from("{}").toString("base64url"), ["text"])).toThrow(RequestShapeError);
});
