/**
 * What one steps-rail row prints under its label, and what its issue badge
 * reads (`panels/stepRailRow.ts`), tested as pure functions — no DOM, no
 * rendering.
 *
 * Three step kinds, three summary shapes: a step someone works names who
 * works it and how many fields its form carries, a call to another process
 * names that process by label, and an end names its outcome.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ProcessSummary } from "../src/areas/studio/api/types.js";
import { railRowIssues, railRowSummary } from "../src/areas/studio/panels/stepRailRow.js";

type DraftStep = DraftOf<Step>;

function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function issue(entityId: string, source: EditorIssue["source"]): EditorIssue {
  return { entityType: "step", entityId, message: "no", source, loc: "" };
}

const PROCESSES = [
  {
    processId: "proc_credit",
    version: 3,
    definitionHash: "hash",
    key: "credit_check",
    label: { en: "Credit check", de: "Bonitätsprüfung" },
    baseLocale: "en",
  },
] as unknown as ProcessSummary[];

describe("railRowSummary", () => {
  it("names who works a task step and how many fields its form carries", () => {
    const step = ds({
      id: "step_a",
      type: "task",
      assignment: { strategy: { type: "org.group-members", config: { groupId: "grp_1" } } },
      view: { fields: [{ ref: "field_1" }, { kind: "note", text: { en: "hi" } }, { ref: "field_2" }] },
    });

    const summary = railRowSummary(step, PROCESSES, "en");

    expect(summary).toContain("2 form fields");
    expect(summary).toContain("Everyone in a group");
  });

  it("names no strategy on a task step carrying no assignment", () => {
    const step = ds({ id: "step_a", type: "task" });

    expect(railRowSummary(step, PROCESSES, "en")).toBe("Nobody in particular · 0 form fields");
  });

  it("names the process a subprocess step calls, by label and never by its id", () => {
    const step = ds({ id: "step_a", type: "subprocess", subprocess: { processId: "proc_credit" } });

    const summary = railRowSummary(step, PROCESSES, "en");

    expect(summary).toBe("Calls Credit check");
    expect(summary).not.toContain("proc_credit");
  });

  it("reads a called process's label in the content locale", () => {
    const step = ds({ id: "step_a", type: "subprocess", subprocess: { processId: "proc_credit" } });

    expect(railRowSummary(step, PROCESSES, "de")).toBe("Calls Bonitätsprüfung");
  });

  it("says so where a subprocess step names no process yet", () => {
    const step = ds({ id: "step_a", type: "subprocess" });

    expect(railRowSummary(step, PROCESSES, "en")).toBe("Calls no process yet");
  });

  it("names an end step's outcome", () => {
    const step = ds({ id: "step_a", type: "task", terminal: true, outcome: "approved" });

    expect(railRowSummary(step, PROCESSES, "en")).toBe("Ends as approved");
  });

  it("says so where an end step declares no outcome", () => {
    const step = ds({ id: "step_a", type: "task", terminal: true });

    expect(railRowSummary(step, PROCESSES, "en")).toBe("Ends with no outcome");
  });
});

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
