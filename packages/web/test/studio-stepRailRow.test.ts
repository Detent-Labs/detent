/**
 * What a steps-rail row's issue badge reads (`panels/stepRailRow.ts`),
 * tested as a pure function — no DOM, no rendering.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { railRowIssues } from "../src/areas/studio/panels/stepRailRow.js";

type DraftStep = DraftOf<Step>;

function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function issue(entityId: string, source: EditorIssue["source"]): EditorIssue {
  return { entityType: "step", entityId, message: "no", source, loc: "" };
}

describe("railRowIssues", () => {
  const step = ds({
    id: "step_a",
    paths: [{ id: "path_1", to: "step_b" }],
    onEntry: [{ id: "act_entry" }],
  });

  it("counts nothing on a step carrying no issue", () => {
    expect(railRowIssues([], step)).toEqual({ count: 0, blocker: false });
  });

  it("counts the step's own issues and those of everything under it", () => {
    const issues = [issue("step_a", "zod"), issue("path_1", "cel"), issue("act_entry", "registry")];

    expect(railRowIssues(issues, step).count).toBe(3);
  });

  it("takes the blocker reading where one counted issue refuses a publish", () => {
    expect(railRowIssues([issue("path_1", "cel")], step).blocker).toBe(true);
  });

  it("stays advisory where every counted issue is a view finding", () => {
    const issues = [issue("step_a", "view"), issue("path_1", "view")];

    expect(railRowIssues(issues, step)).toEqual({ count: 2, blocker: false });
  });

  it("counts no issue belonging to another step", () => {
    expect(railRowIssues([issue("step_elsewhere", "zod")], step).count).toBe(0);
  });
});
