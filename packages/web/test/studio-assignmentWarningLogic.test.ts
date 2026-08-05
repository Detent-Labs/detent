import { describe, it, expect } from "bun:test";
import { assignmentWarning } from "../src/areas/studio/panels/assignmentWarningLogic.js";

describe("assignmentWarning", () => {
  it("draws no warning on a terminal step", () => {
    expect(assignmentWarning(true, undefined)).toBeUndefined();
  });

  it("draws no warning on a non-terminal step with an assignment", () => {
    expect(assignmentWarning(false, { strategy: { type: "static", config: {} } })).toBeUndefined();
  });

  it("returns the warning text for a non-terminal step with no assignment", () => {
    expect(assignmentWarning(false, undefined)).toBe(
      "This step has no assignment. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.",
    );
  });

  it("treats an undefined terminal flag as non-terminal", () => {
    expect(assignmentWarning(undefined, undefined)).toBe(
      "This step has no assignment. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.",
    );
  });
});
