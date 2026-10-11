import { describe, expect, it } from "bun:test";
import { DIRECTORY_FOCUS_INTERVAL_MS, focusRefetchDue } from "../src/areas/admin/refreshLogic.js";

describe("focusRefetchDue", () => {
  const lastAt = 1_000_000;

  it("is false when no time has passed", () => {
    expect(focusRefetchDue(lastAt, lastAt, 30000)).toBe(false);
  });

  it("is false one millisecond short of the minimum", () => {
    expect(focusRefetchDue(lastAt, lastAt + 29999, 30000)).toBe(false);
  });

  it("is true exactly at the minimum", () => {
    expect(focusRefetchDue(lastAt, lastAt + 30000, 30000)).toBe(true);
  });

  it("is true past the minimum", () => {
    expect(focusRefetchDue(lastAt, lastAt + 45000, 30000)).toBe(true);
  });

  it("is always true with a minimum of 0", () => {
    expect(focusRefetchDue(lastAt, lastAt, 0)).toBe(true);
    expect(focusRefetchDue(lastAt, lastAt + 1, 0)).toBe(true);
  });
});

describe("DIRECTORY_FOCUS_INTERVAL_MS", () => {
  it("is 30 seconds", () => {
    expect(DIRECTORY_FOCUS_INTERVAL_MS).toBe(30000);
  });
});
