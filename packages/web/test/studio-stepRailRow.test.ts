/**
 * What a steps-rail row's issue badge reads (`panels/stepRailRow.ts`),
 * tested as a pure function — no DOM, no rendering.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import {
  focusAfterStepRemove,
  focusAfterWalk,
  railRowIssues,
  scrollCurrentRowIntoView,
  STEPS_RAIL_ADD_FIRST_ID,
  STEPS_RAIL_CURRENT_ID,
  STEPS_RAIL_SCROLL,
  STEP_WALK_NEXT_ID,
  STEP_WALK_PREVIOUS_ID,
} from "../src/areas/studio/panels/stepRailRow.js";

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

describe("focusAfterStepRemove", () => {
  it("names the current row while any step stays", () => {
    expect(focusAfterStepRemove(3)).toBe(STEPS_RAIL_CURRENT_ID);
    expect(focusAfterStepRemove(1)).toBe(STEPS_RAIL_CURRENT_ID);
  });

  it("names the first add control once the rail holds no row", () => {
    expect(focusAfterStepRemove(0)).toBe(STEPS_RAIL_ADD_FIRST_ID);
  });

  it("names two different ids, so a press never lands on the wrong control", () => {
    expect(STEPS_RAIL_CURRENT_ID).not.toBe(STEPS_RAIL_ADD_FIRST_ID);
  });
});

describe("focusAfterWalk", () => {
  it("keeps Next while the walk goes on forward from a middle step", () => {
    expect(focusAfterWalk("next", true)).toBe(STEP_WALK_NEXT_ID);
  });

  it("keeps Previous while the walk goes on backward from a middle step", () => {
    expect(focusAfterWalk("previous", true)).toBe(STEP_WALK_PREVIOUS_ID);
  });

  it("falls back to Previous when Next reaches the last step", () => {
    expect(focusAfterWalk("next", false)).toBe(STEP_WALK_PREVIOUS_ID);
  });

  it("falls back to Next when Previous reaches the first step", () => {
    expect(focusAfterWalk("previous", false)).toBe(STEP_WALK_NEXT_ID);
  });

  it("names the other control in a one-step walk, where no press can happen and no direction goes on", () => {
    expect(focusAfterWalk("next", false)).not.toBe(STEP_WALK_NEXT_ID);
    expect(focusAfterWalk("previous", false)).not.toBe(STEP_WALK_PREVIOUS_ID);
  });

  it("names two different ids", () => {
    expect(STEP_WALK_PREVIOUS_ID).not.toBe(STEP_WALK_NEXT_ID);
  });
});

describe("scrollCurrentRowIntoView", () => {
  it("scrolls the current row by the least distance", () => {
    const calls: unknown[] = [];
    const row = { scrollIntoView: (options: unknown) => calls.push(options) };
    const asked: string[] = [];
    const doc = { getElementById: (id: string) => (asked.push(id), row as unknown as HTMLElement) };

    expect(scrollCurrentRowIntoView(doc)).toBe(true);
    expect(asked).toEqual([STEPS_RAIL_CURRENT_ID]);
    expect(calls).toEqual([{ block: "nearest" }]);
    expect(STEPS_RAIL_SCROLL).toEqual({ block: "nearest" });
  });

  it("does nothing where no row is current", () => {
    expect(scrollCurrentRowIntoView({ getElementById: () => null })).toBe(false);
  });
});

describe("the steps rail's scroll effect", () => {
  it("runs again whenever the current step changes", () => {
    const source = readFileSync(new URL("../src/areas/studio/panels/StepsRail.tsx", import.meta.url), "utf8");
    const effect = /useEffect\(\(\) => \{\s*scrollCurrentRowIntoView\(document\);\s*\}, \[([^\]]*)\]\);/.exec(source);

    expect(effect).not.toBeNull();
    expect(effect![1]!.trim()).toBe("currentStepId");
  });
});

describe("the step texts the walk and the narrowing label read", () => {
  const source = readFileSync(new URL("../src/areas/studio/screens/EditScreen.tsx", import.meta.url), "utf8");

  it("come from one stepTextMap, with no key in the label", () => {
    expect(source).toContain("const stepTexts = stepTextMap(steps, contentLocale, baseLocale);");
    expect(source).toContain("label: stepTexts.get(neighbour.id)");
    expect(source).toContain("label: stepTexts.get(checksNarrowStep.id)");
    expect(source).not.toContain("checksNarrowStep.key");
  });
});
