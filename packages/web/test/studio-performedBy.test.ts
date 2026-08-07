import { describe, expect, it } from "bun:test";
import { performedByFor, performedByPatch } from "../src/areas/studio/draft/performedBy.js";

describe("performedByFor", () => {
  it("a task, non-terminal step reads as participant", () => {
    expect(performedByFor("task", undefined)).toBe("participant");
  });

  it("a subprocess, non-terminal step reads as subprocess", () => {
    expect(performedByFor("subprocess", undefined)).toBe("subprocess");
  });

  it("a terminal step reads as terminal regardless of type", () => {
    expect(performedByFor("task", true)).toBe("terminal");
    expect(performedByFor("subprocess", true)).toBe("terminal");
  });
});

describe("performedByPatch", () => {
  it("participant sets type task, clears terminal", () => {
    expect(performedByPatch("participant")).toEqual({ type: "task", terminal: undefined });
  });

  it("subprocess sets type subprocess, clears terminal", () => {
    expect(performedByPatch("subprocess")).toEqual({ type: "subprocess", terminal: undefined });
  });

  it("terminal pins type back to task and sets terminal true", () => {
    expect(performedByPatch("terminal")).toEqual({ type: "task", terminal: true });
  });
});
