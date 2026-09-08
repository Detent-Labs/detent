/**
 * Which section each open issue stands beside on the step page
 * (`panels/sectionIssues.ts`), tested as pure functions — no DOM, no
 * rendering.
 *
 * The load-bearing case is the one `studio-step-page` states outright: an
 * issue stands at exactly one section. The masthead's own total comes from
 * `stepIssueCount`, so the cases assert against that function rather than
 * against a second copy of its rule.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { stepIssueCount } from "../src/areas/studio/draft/panel-rail.js";
import { sectionsFor } from "../src/areas/studio/panels/sectionsFor.js";
import { issuesBySection, sectionOfIssue } from "../src/areas/studio/panels/sectionIssues.js";

type DraftStep = DraftOf<Step>;

function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function issue(entityType: EditorIssue["entityType"], entityId: string, loc = ""): EditorIssue {
  return { entityType, entityId, message: "no", source: "cel", loc };
}

const PARTICIPANT = sectionsFor("participant");

const step = ds({
  id: "step_a",
  paths: [{ id: "path_1", to: "step_b", guard: { lang: "cel", src: "data.nope" }, onPath: [{ id: "act_path" }] }],
  timers: [{ id: "timer_1", onFire: { actions: [{ id: "act_fire" }] } }],
  onEntry: [{ id: "act_entry" }],
  onExit: [{ id: "act_exit" }],
  onCancel: [{ id: "act_cancel" }],
});

describe("sectionOfIssue routes by the entity an issue resolved to", () => {
  it("lands a path's guard issue at Path to", () => {
    expect(sectionOfIssue(step, issue("path", "path_1"), PARTICIPANT)).toBe("paths");
  });

  it("lands a timer's issue at Time limit, and its fired action's there too", () => {
    expect(sectionOfIssue(step, issue("timer", "timer_1"), PARTICIPANT)).toBe("timers");
    expect(sectionOfIssue(step, issue("action", "act_fire"), PARTICIPANT)).toBe("timers");
  });

  it("lands an action at the list that holds it", () => {
    expect(sectionOfIssue(step, issue("action", "act_entry"), PARTICIPANT)).toBe("entry");
    expect(sectionOfIssue(step, issue("action", "act_exit"), PARTICIPANT)).toBe("exit");
    expect(sectionOfIssue(step, issue("action", "act_cancel"), PARTICIPANT)).toBe("exit");
    expect(sectionOfIssue(step, issue("action", "act_path"), PARTICIPANT)).toBe("paths");
  });

  it("names no section for an issue belonging to another step", () => {
    expect(sectionOfIssue(step, issue("path", "path_elsewhere"), PARTICIPANT)).toBeUndefined();
  });
});

describe("sectionOfIssue routes a step-level issue by its loc", () => {
  it("stands an assignment issue at Assignment", () => {
    const at = issue("step", "step_a", "workflow.steps[0].assignment.strategy.config.groupId");

    expect(sectionOfIssue(step, at, PARTICIPANT)).toBe("assignment");
  });

  it("stands a view issue at Step form fields", () => {
    const at = issue("step", "step_a", "workflow.steps[0].view.fields[1].required");

    expect(sectionOfIssue(step, at, PARTICIPANT)).toBe("form");
  });

  it("stands a subprocess issue at Which process it calls", () => {
    const called = ds({ id: "step_a", type: "subprocess", subprocess: { processId: "proc_child" } });
    const at = issue("step", "step_a", "workflow.steps[0].subprocess.processId");

    expect(sectionOfIssue(called, at, sectionsFor("subprocess"))).toBe("subprocess");
  });

  it("stands an outcome issue at How the case ends", () => {
    const ends = ds({ id: "step_a", terminal: true });
    const at = issue("step", "step_a", "workflow.steps[0].outcome");

    expect(sectionOfIssue(ends, at, sectionsFor("terminal"))).toBe("howItEnds");
  });

  it("names no section for a step-level issue whose loc names none", () => {
    const at = issue("step", "step_a", "workflow.steps[0].key");

    expect(sectionOfIssue(step, at, PARTICIPANT)).toBeUndefined();
  });

  it("names no section a step's own kind does not stand", () => {
    // An end step carries no On exit section, so an `onExit` issue on one
    // lands nowhere rather than at a heading the page does not draw.
    const ends = ds({ id: "step_a", terminal: true });
    const at = issue("step", "step_a", "workflow.steps[0].onExit[0].type");

    expect(sectionOfIssue(ends, at, sectionsFor("terminal"))).toBeUndefined();
  });
});

describe("issuesBySection", () => {
  it("lands each issue at exactly one section, and never at two", () => {
    const issues = [
      issue("path", "path_1"),
      issue("timer", "timer_1"),
      issue("action", "act_entry"),
      issue("action", "act_exit"),
      issue("step", "step_a", "workflow.steps[0].assignment.strategy"),
    ];
    const bySection = issuesBySection(step, issues, PARTICIPANT);
    const landed = [...bySection.values()].flat();

    expect(landed).toHaveLength(issues.length);
    for (const one of issues) expect(landed.filter((i) => i === one)).toHaveLength(1);
  });

  it("keeps a section with no issue out of the map", () => {
    const bySection = issuesBySection(step, [issue("path", "path_1")], PARTICIPANT);

    expect(bySection.get("paths")).toHaveLength(1);
    expect(bySection.get("form")).toBeUndefined();
    expect(bySection.get("entry")).toBeUndefined();
  });

  it("leaves the step's own total untouched, so the masthead still counts what a section prints", () => {
    const issues = [issue("path", "path_1"), issue("action", "act_entry")];

    expect([...issuesBySection(step, issues, PARTICIPANT).values()].flat()).toHaveLength(2);
    expect(stepIssueCount(issues, step)).toBe(2);
  });

  it("counts no issue belonging to another step", () => {
    expect(issuesBySection(step, [issue("path", "path_elsewhere")], PARTICIPANT).size).toBe(0);
  });
});
