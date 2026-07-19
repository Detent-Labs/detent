import { test, expect } from "bun:test";
import { durationMs, addDuration } from "../src/engine/duration.js";

test("durationMs parses fixed units W/D/H/M/S", () => {
  expect(durationMs("PT30S")).toBe(30_000);
  expect(durationMs("PT1M")).toBe(60_000); // M after T = minutes
  expect(durationMs("PT2H")).toBe(7_200_000);
  expect(durationMs("P1D")).toBe(86_400_000);
  expect(durationMs("P7D")).toBe(604_800_000);
  expect(durationMs("P1W")).toBe(604_800_000);
  expect(durationMs("P1DT2H3M4S")).toBe((86400 + 2 * 3600 + 3 * 60 + 4) * 1000);
  expect(durationMs("PT1.5S")).toBe(1500);
});

test("durationMs rejects calendar units and garbage", () => {
  expect(() => durationMs("P1Y")).toThrow(); // year
  expect(() => durationMs("P1M")).toThrow(); // month (M before T)
  expect(() => durationMs("P")).toThrow();
  expect(() => durationMs("PT")).toThrow();
  expect(() => durationMs("garbage")).toThrow();
  expect(() => durationMs("1D")).toThrow(); // missing leading P
});

test("addDuration adds to the instant and emits UTC ISO", () => {
  expect(addDuration("2026-01-01T00:00:00.000Z", "P1D")).toBe("2026-01-02T00:00:00.000Z");
  expect(addDuration("2026-01-01T00:00:00.000Z", "PT30S")).toBe("2026-01-01T00:00:30.000Z");
  expect(addDuration("2026-01-01T23:59:30.000Z", "PT1M")).toBe("2026-01-02T00:00:30.000Z");
});
