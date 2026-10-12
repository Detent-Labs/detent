/**
 * src/instant.ts: the ISO-8601 instant check shared by the instance list
 * filters, the report schema and the typed `timestamp` pagination cursor.
 * Pure function tests, no database.
 */
import { test, expect } from "bun:test";
import { isInstant, parseInstant } from "../src/instant.js";
import { RequestShapeError } from "../src/errors.js";

const REJECTED = [
  "gestern",
  "1",
  "",
  "2026-02-30",
  "2026-02-29",
  "2026-13-01",
  "2026-00-10",
  "2026-04-31",
  "0000-01-01T00:00:00Z",
  "2026-10-11T10:00:00+16:00",
  "2026-10-11 10:00:00+99",
  "2026-10-11T10:60:00Z",
  "Oct 11 2026",
  "2026-10-11T10",
  "2026-10-11 10:00:00+00 ",
  "2026-02-30 10:00:00+00",
];

const ACCEPTED = [
  "2026-10-11",
  "2026-10-11T10:00",
  "2026-10-11T10:00:00Z",
  "2026-10-11T10:00:00.123Z",
  "2026-10-11 10:00:00.123456+00",
  "2026-10-11T10:00:00+15:59",
  "2026-10-11T10:00:00-05",
  "2026-10-11 10:00:00-05:30",
  "2028-02-29",
  "2000-02-29T00:00:00Z",
  "0001-01-01T00:00:00Z",
];

test("isInstant rejects each string Postgres would refuse or the JavaScript parser misreads", () => {
  for (const raw of REJECTED) expect([raw, isInstant(raw)]).toEqual([raw, false]);
});

test("isInstant accepts ISO-8601 and the Postgres timestamptz text form", () => {
  for (const raw of ACCEPTED) expect([raw, isInstant(raw)]).toEqual([raw, true]);
});

test("a century year that is not divisible by 400 has no 29 February", () => {
  expect(isInstant("1900-02-29")).toBe(false);
});

test("parseInstant returns an accepted string unchanged", () => {
  expect(parseInstant("2026-10-11T10:00:00.123Z", "createdAfter")).toBe("2026-10-11T10:00:00.123Z");
});

test("parseInstant raises a RequestShapeError naming the label for a rejected string", () => {
  let raised: unknown;
  try {
    parseInstant("gestern", "createdAfter");
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
  expect((raised as Error).message).toContain("createdAfter");
});
