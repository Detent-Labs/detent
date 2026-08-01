import { describe, expect, it } from "bun:test";
import { isOverdue } from "../src/areas/admin/screens/timersLogic.js";

describe("isOverdue", () => {
  const now = new Date("2026-01-01T12:00:00.000Z").getTime();

  it("is true for a fire time in the past", () => {
    expect(isOverdue("2026-01-01T11:00:00.000Z", now)).toBe(true);
  });

  it("is true for a fire time exactly now", () => {
    expect(isOverdue("2026-01-01T12:00:00.000Z", now)).toBe(true);
  });

  it("is false for a fire time in the future", () => {
    expect(isOverdue("2026-01-01T13:00:00.000Z", now)).toBe(false);
  });
});
