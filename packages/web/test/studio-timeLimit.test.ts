/**
 * `areas/studio/draft/time-limit.ts`: a `Timer.duration` read as a number and
 * a unit, and written back as the ISO-8601 duration the definition contract
 * requires (`studio-guided-vocabulary`, tasks 1.6, 1.7, 1.11).
 */
import { describe, expect, it } from "bun:test";
import { MAX_TIMER_DURATION_MS, parseIsoDuration } from "workflow-engine/schema";
import {
  maxTimeLimitCount,
  timeLimitDuration,
  timeLimitInRange,
  timeLimitParts,
} from "../src/areas/studio/draft/time-limit.js";

describe("timeLimitParts", () => {
  it("reads PT72H as three days, the largest unit that states it exactly", () => {
    expect(timeLimitParts("PT72H")).toEqual({ count: 3, unit: "days" });
  });

  it("reads each unit back at its own scale", () => {
    expect(timeLimitParts("PT4H")).toEqual({ count: 4, unit: "hours" });
    expect(timeLimitParts("P3D")).toEqual({ count: 3, unit: "days" });
    expect(timeLimitParts("P2W")).toEqual({ count: 2, unit: "weeks" });
    // Seven days is a whole week, so the largest-unit rule states it as one.
    expect(timeLimitParts("P7D")).toEqual({ count: 1, unit: "weeks" });
  });

  it("states nothing for a duration the pair cannot hold", () => {
    expect(timeLimitParts("P1DT4H30M")).toBeUndefined();
    expect(timeLimitParts("PT90M")).toBeUndefined();
    expect(timeLimitParts("PT30S")).toBeUndefined();
  });

  it("states nothing for an absent, ungrammatical or zero-length duration", () => {
    expect(timeLimitParts(undefined)).toBeUndefined();
    expect(timeLimitParts("")).toBeUndefined();
    expect(timeLimitParts("P1M")).toBeUndefined();
    expect(timeLimitParts("PT0S")).toBeUndefined();
  });
});

describe("timeLimitDuration", () => {
  it("writes a duration the engine's own grammar parses", () => {
    expect(timeLimitDuration({ count: 3, unit: "days" })).toBe("P3D");
    expect(timeLimitDuration({ count: 6, unit: "hours" })).toBe("PT6H");
    expect(timeLimitDuration({ count: 2, unit: "weeks" })).toBe("P2W");
    for (const iso of ["P3D", "PT6H", "P2W"]) {
      expect(parseIsoDuration(iso), iso).not.toBeNull();
    }
  });

  it("round-trips three days back to three days", () => {
    const parts = timeLimitParts("PT72H")!;
    expect(timeLimitDuration(parts)).toBe("P3D");
    expect(timeLimitParts(timeLimitDuration(parts))).toEqual(parts);
  });
});

describe("the control's own bound", () => {
  it("stays inside the window the publish check enforces", () => {
    for (const unit of ["hours", "days", "weeks"] as const) {
      const max = maxTimeLimitCount(unit);
      expect(timeLimitInRange({ count: max, unit }), unit).toBe(true);
      const ms = parseIsoDuration(timeLimitDuration({ count: max, unit }))!;
      expect(ms, unit).toBeLessThanOrEqual(MAX_TIMER_DURATION_MS);
    }
  });

  it("refuses a number the window cannot hold", () => {
    const max = maxTimeLimitCount("weeks");
    expect(timeLimitInRange({ count: max + 1, unit: "weeks" })).toBe(false);
    // What the refused number would have written, had the control let it
    // through: the publish check rejects exactly this.
    expect(parseIsoDuration(timeLimitDuration({ count: max + 1, unit: "weeks" }))!).toBeGreaterThan(
      MAX_TIMER_DURATION_MS,
    );
  });

  it("refuses a number that writes no duration at all", () => {
    expect(timeLimitInRange({ count: 0, unit: "days" })).toBe(false);
    expect(timeLimitInRange({ count: -3, unit: "days" })).toBe(false);
    expect(timeLimitInRange({ count: 1.5, unit: "days" })).toBe(false);
    expect(timeLimitInRange({ count: Number.NaN, unit: "days" })).toBe(false);
  });
});
