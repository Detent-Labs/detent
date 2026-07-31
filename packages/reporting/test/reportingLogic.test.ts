/**
 * The pure view-model modules. Components stay untested, per the repo's
 * existing convention (packages/admin/test/migrationsLogic.test.ts).
 */
import { test, expect } from "bun:test";
import {
  defaultRange,
  DEFAULT_RANGE_DAYS,
  toDateInput,
  fromDateInput,
  rangeIsValid,
  formatDuration,
  formatPercent,
  stepName,
  scaleTo,
  rankByMedian,
  describeCaughtError,
} from "../src/screens/reportingLogic.js";
import { ReportingClientError } from "../src/api/client.js";

test("the default range covers the thirty days before a fixed reference instant", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const range = defaultRange(now);
  expect(range.to).toBe("2026-08-01T12:00:00.000Z");
  expect(range.from).toBe("2026-07-02T12:00:00.000Z");
  expect((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000).toBe(DEFAULT_RANGE_DAYS);
});

test("the default range is always valid", () => {
  expect(rangeIsValid(defaultRange(new Date("2026-08-01T00:00:00.000Z")))).toBe(true);
});

test("a start after the end is rejected", () => {
  expect(rangeIsValid({ from: "2026-08-02T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" })).toBe(false);
  expect(rangeIsValid({ from: "nonsense", to: "2026-08-01T00:00:00.000Z" })).toBe(false);
});

test("date inputs round-trip, with `to` covering the whole closing day", () => {
  expect(toDateInput("2026-07-02T12:00:00.000Z")).toBe("2026-07-02");
  expect(fromDateInput("2026-07-02", "start")).toBe("2026-07-02T00:00:00.000Z");
  expect(fromDateInput("2026-07-02", "end")).toBe("2026-07-02T23:59:59.999Z");
});

test("durations use the largest fitting unit", () => {
  expect(formatDuration(450)).toBe("450 ms");
  expect(formatDuration(4500)).toBe("4.5 s");
  expect(formatDuration(90_000)).toBe("1.5 min");
  expect(formatDuration(45 * 60_000)).toBe("45 min");
  expect(formatDuration(5.5 * 3_600_000)).toBe("5.5 h");
  expect(formatDuration(3 * 86_400_000)).toBe("3 d");
  expect(formatDuration(30 * 86_400_000)).toBe("30 d");
});

test("a negative or non-finite duration renders as an em dash, not as a number", () => {
  expect(formatDuration(-1)).toBe("—");
  expect(formatDuration(Number.NaN)).toBe("—");
});

test("a breach rate renders as a whole percent", () => {
  expect(formatPercent(0)).toBe("0%");
  expect(formatPercent(0.5)).toBe("50%");
  expect(formatPercent(1)).toBe("100%");
});

test("a step falls back to its key when the base locale is absent", () => {
  expect(stepName({ stepId: "step_a", key: "review", label: { en: "Review" } }, "en")).toBe("Review");
  expect(stepName({ stepId: "step_a", key: "review", label: { de: "Prüfung" } }, "en")).toBe("Prüfung");
  expect(stepName({ stepId: "step_a", key: "review", label: {} }, "en")).toBe("review");
});

test("the rule scales against the widest value in the set", () => {
  const scale = scaleTo([10, 40, 20]);
  expect(scale(40)).toBe(1);
  expect(scale(20)).toBe(0.5);
  expect(scale(10)).toBe(0.25);
});

test("an all-zero set yields zero width rather than a divide-by-zero", () => {
  const scale = scaleTo([0, 0]);
  expect(scale(0)).toBe(0);
  expect(Number.isNaN(scale(0))).toBe(false);
});

test("an empty set is safe to scale", () => {
  expect(scaleTo([])(0)).toBe(0);
});

test("the ranking orders longest median first, without mutating its input", () => {
  const rows = [
    { stepId: "a", medianMs: 10 },
    { stepId: "b", medianMs: 40 },
    { stepId: "c", medianMs: 20 },
  ];
  expect(rankByMedian(rows).map((r) => r.stepId)).toEqual(["b", "c", "a"]);
  expect(rows.map((r) => r.stepId)).toEqual(["a", "b", "c"]);
});

test("a typed client error keeps its type, and an unknown throw still yields a stated error", () => {
  const typed = new ReportingClientError({ type: "authorization", message: "denied" }, 403);
  expect(describeCaughtError(typed)).toEqual({ type: "authorization", message: "denied" });
  expect(describeCaughtError(new Error("boom"))).toEqual({ type: "internal", message: "boom" });
  expect(describeCaughtError("not an error")).toEqual({ type: "internal", message: "Unexpected error" });
});
