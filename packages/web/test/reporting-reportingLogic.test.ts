/**
 * The pure view-model modules. Components stay untested, per the repo's
 * existing convention (admin-migrationsLogic.test.ts).
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
  describeError,
} from "../src/areas/reporting/screens/reportingLogic.js";
import { ReportingClientError } from "../src/areas/reporting/api/client.js";

test("the default range covers the thirty days before a fixed reference instant", () => {
  // The bounds sit on local day edges, so the span is not exactly thirty days:
  // each end grows by part of a day. Asserting literal instants here would pin
  // the runner's timezone, so this asserts the property the requirement states,
  // that the range covers the thirty days before the instant.
  const now = new Date("2026-08-01T12:00:00.000Z");
  const range = defaultRange(now);
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;

  expect(Date.parse(range.from)).toBeLessThanOrEqual(now.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);
  expect(Date.parse(range.to)).toBeGreaterThanOrEqual(now.getTime());
  expect(span).toBeGreaterThanOrEqual(DEFAULT_RANGE_DAYS);
  expect(span).toBeLessThan(DEFAULT_RANGE_DAYS + 1);
});

test("a cleared or unparseable date yields an invalid range, not a throw", () => {
  // `<input type="date">` reports "" when the field is cleared. toISOString()
  // on the resulting Invalid Date threw, and nothing above catches it. An
  // empty bound flows into rangeIsValid, which the area's root already
  // renders as an invalid range.
  expect(fromDateInput("", "start")).toBe("");
  expect(fromDateInput("", "end")).toBe("");
  expect(fromDateInput("nonsense", "start")).toBe("");
  expect(rangeIsValid({ from: fromDateInput("", "start"), to: "2026-08-04T21:59:59.999Z" })).toBe(false);

  expect(toDateInput("nonsense")).toBe("");
  expect(toDateInput("")).toBe("");
});

test("the default range survives a round trip through the control", () => {
  const range = defaultRange(new Date("2026-08-01T12:00:00.000Z"));
  expect(fromDateInput(toDateInput(range.from), "start")).toBe(range.from);
  expect(fromDateInput(toDateInput(range.to), "end")).toBe(range.to);
});

test("the default range is always valid", () => {
  expect(rangeIsValid(defaultRange(new Date("2026-08-01T00:00:00.000Z")))).toBe(true);
});

test("a start after the end is rejected", () => {
  expect(rangeIsValid({ from: "2026-08-02T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" })).toBe(false);
  expect(rangeIsValid({ from: "nonsense", to: "2026-08-01T00:00:00.000Z" })).toBe(false);
});

test("a picked day survives the round trip through both conversions", () => {
  // Asserting the round trip rather than a literal instant is what makes this
  // hold in every timezone. The literals it replaced encoded UTC midnight, so
  // they passed in the container while the control was two hours out in
  // Zurich.
  for (const day of ["2026-07-02", "2026-01-15", "2026-03-29", "2026-10-25"]) {
    expect(toDateInput(fromDateInput(day, "start"))).toBe(day);
    expect(toDateInput(fromDateInput(day, "end"))).toBe(day);
  }
});

// The companion to the round trip above, which stays true under UTC even when
// the conversions are wrong. This one pins the offset, so it needs a known
// zone. Run it with TZ set in the command, never by assigning process.env.TZ
// here: Date may already have read the zone. It skips visibly otherwise,
// matching the test.skipIf(!DB) convention the DB suites use.
const ZURICH = process.env.TZ === "Europe/Zurich";

test.skipIf(!ZURICH)("a picked day spans that day in local time, not in UTC", () => {
  expect(fromDateInput("2026-07-02", "start")).toBe("2026-07-01T22:00:00.000Z");
  expect(fromDateInput("2026-07-02", "end")).toBe("2026-07-02T21:59:59.999Z");
});

test("durations use the largest fitting unit", () => {
  expect(formatDuration(450, "en")).toBe("450 ms");
  expect(formatDuration(4500, "en")).toBe("4.5 s");
  expect(formatDuration(90_000, "en")).toBe("1.5 min");
  expect(formatDuration(45 * 60_000, "en")).toBe("45 min");
  expect(formatDuration(5.5 * 3_600_000, "en")).toBe("5.5 h");
  expect(formatDuration(3 * 86_400_000, "en")).toBe("3 d");
  expect(formatDuration(30 * 86_400_000, "en")).toBe("30 d");
});

test("a German duration takes its unit from the catalog and its separator from the locale", () => {
  // `d` is `T` in German, and the decimal separator is a comma. Both would be
  // wrong under a locale-free formatter.
  expect(formatDuration(3 * 86_400_000, "de")).toBe("3 T");
  expect(formatDuration(5.5 * 3_600_000, "de")).toBe("5,5 Std");
  expect(formatDuration(90_000, "de")).toBe("1,5 Min");
});

test("a negative or non-finite duration renders as an em dash, not as a number", () => {
  expect(formatDuration(-1, "en")).toBe("—");
  expect(formatDuration(Number.NaN, "en")).toBe("—");
  expect(formatDuration(-1, "de")).toBe("—");
});

test("a breach rate renders as a whole percent", () => {
  expect(formatPercent(0, "en")).toBe("0%");
  expect(formatPercent(0.5, "en")).toBe("50%");
  expect(formatPercent(1, "en")).toBe("100%");
});

test("a German percent carries the space the locale puts before the sign", () => {
  expect(formatPercent(0.5, "de")).toBe("50 %");
});

test("every ClientError type a report can meet answers a catalog value", () => {
  for (const error of [
    { type: "authorization", message: "raw" },
    { type: "actor-resolution", message: "raw" },
    { type: "request-shape", message: "raw" },
    { type: "not-found", message: "raw" },
    { type: "conflict", message: "raw" },
    { type: "network", message: "raw" },
    { type: "internal", message: "raw" },
    { type: "guard-refused", message: "raw" },
  ] as const) {
    for (const locale of ["en", "de"] as const) {
      const text = describeError(error, locale);
      expect(text.length, `${error.type}/${locale}`).toBeGreaterThan(0);
      // Never the server's own string: it arrives in English and no catalog reaches it.
      expect(text, `${error.type}/${locale}`).not.toBe("raw");
    }
  }
});

test("the same error reads differently in each locale", () => {
  const error = { type: "not-found", message: "raw" } as const;
  expect(describeError(error, "en")).not.toBe(describeError(error, "de"));
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
