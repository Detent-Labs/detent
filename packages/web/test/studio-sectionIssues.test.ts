/**
 * Which section each open issue stands beside on the step page
 * (`panels/sectionIssues.ts`), tested as pure functions — no DOM, no
 * rendering.
 *
 * The load-bearing case is the one `studio-step-page` states outright: an
 * issue stands at exactly one section. The masthead reads `mastheadIssues`: those the
 * step owns that no section claims.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { sectionsFor } from "../src/areas/studio/panels/sectionsFor.js";
import { issuesBySection, mastheadIssues, namesStepKey, sectionOfIssue, sectionOfOutputTarget } from "../src/areas/studio/panels/sectionIssues.js";

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
  it("lands a path's guard issue at Ways out", () => {
    expect(sectionOfIssue(step, issue("path", "path_1"), PARTICIPANT)).toBe("paths");
  });

  it("lands a timer's issue at Time limit, and its fired action's there too", () => {
    expect(sectionOfIssue(step, issue("timer", "timer_1"), PARTICIPANT)).toBe("timers");
    expect(sectionOfIssue(step, issue("action", "act_fire"), PARTICIPANT)).toBe("timers");
  });

  it("lands an action at the list that holds it", () => {
    expect(sectionOfIssue(step, issue("action", "act_entry"), PARTICIPANT)).toBe("lifecycle");
    expect(sectionOfIssue(step, issue("action", "act_exit"), PARTICIPANT)).toBe("lifecycle");
    expect(sectionOfIssue(step, issue("action", "act_cancel"), PARTICIPANT)).toBe("lifecycle");
    expect(sectionOfIssue(step, issue("action", "act_path"), PARTICIPANT)).toBe("paths");
  });

  it("names no section for an issue belonging to another step", () => {
    expect(sectionOfIssue(step, issue("path", "path_elsewhere"), PARTICIPANT)).toBeUndefined();
  });

  it("lands an onExit or onCancel action issue on an end step at no section", () => {
    // An end step's When entered section draws the entry list alone, so a
    // left list's action row prints nowhere there.
    const ends = ds({ id: "step_a", terminal: true, onEntry: [{ id: "act_entry" }], onExit: [{ id: "act_exit" }], onCancel: [{ id: "act_cancel" }] });
    const terminal = sectionsFor("terminal");

    expect(sectionOfIssue(ends, issue("action", "act_exit"), terminal)).toBeUndefined();
    expect(sectionOfIssue(ends, issue("action", "act_cancel"), terminal)).toBeUndefined();
    expect(sectionOfIssue(ends, issue("action", "act_entry"), terminal)).toBe("lifecycle");
  });
});

describe("sectionOfIssue routes a step-level issue by its loc", () => {
  it("stands an assignment issue at Who acts", () => {
    const at = issue("step", "step_a", "workflow.steps[0].assignment.strategy.config.groupId");

    expect(sectionOfIssue(step, at, PARTICIPANT)).toBe("assignment");
  });

  it("stands a view issue at Form", () => {
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

  it("stands an onEntry, onExit and onCancel issue at When entered or left", () => {
    for (const list of ["onEntry", "onExit", "onCancel"]) {
      const at = issue("step", "step_a", `workflow.steps[0].${list}[0].type`);

      expect(`${list}: ${sectionOfIssue(step, at, PARTICIPANT)}`).toBe(`${list}: lifecycle`);
    }
  });

  it("stands a cancellable issue and a collaboration issue at More", () => {
    expect(sectionOfIssue(step, issue("step", "step_a", "workflow.steps[0].cancellable"), PARTICIPANT)).toBe("more");
    expect(sectionOfIssue(step, issue("step", "step_a", "workflow.steps[0].collaboration.comments"), PARTICIPANT)).toBe("more");
  });

  it("stands a key issue at More", () => {
    expect(sectionOfIssue(step, issue("step", "step_a", "workflow.steps[0].key"), PARTICIPANT)).toBe("more");
  });

  it("names no section for a step-level issue whose loc names none", () => {
    for (const property of ["label", "description", "type"]) {
      expect(sectionOfIssue(step, issue("step", "step_a", `workflow.steps[0].${property}`), PARTICIPANT)).toBeUndefined();
    }
  });

  it("names no section a step's own kind does not stand", () => {
    // An end step carries no Time limit section, so a `timers` issue on one
    // lands nowhere rather than at a heading the page does not draw.
    const ends = ds({ id: "step_a", terminal: true });
    const at = issue("step", "step_a", "workflow.steps[0].timers[0].duration");

    expect(sectionOfIssue(ends, at, sectionsFor("terminal"))).toBeUndefined();
  });
});

describe("the action an output-target message complains about", () => {
  const message = "action output targets unknown field: field_x";
  const output = { field_x: { lang: "cel", src: "result.a" } };
  const located = (held: Record<string, unknown>) => ds({ id: "step_a", ...held });

  it("reads the section from the action whose output holds the field, across the five positions", () => {
    expect(sectionOfOutputTarget(located({ onEntry: [{ output }] }), message)).toBe("lifecycle");
    expect(sectionOfOutputTarget(located({ onExit: [{ output }] }), message)).toBe("lifecycle");
    expect(sectionOfOutputTarget(located({ onCancel: [{ output }] }), message)).toBe("lifecycle");
    expect(sectionOfOutputTarget(located({ paths: [{ onPath: [{ output }] }] }), message)).toBe("paths");
    expect(sectionOfOutputTarget(located({ timers: [{ onFire: { actions: [{ output }] } }] }), message)).toBe("timers");
  });

  it("answers no section for another message", () => {
    expect(sectionOfOutputTarget(located({ onEntry: [{ output }] }), "no")).toBeUndefined();
  });

  it("routes the issue there, though its location names the step alone, so the header counts it", () => {
    const body = located({ type: "task", paths: [{ id: "path_1", onPath: [{ output }] }] });
    const at: EditorIssue = { entityType: "step", entityId: "step_a", message, source: "zod", loc: "workflow.steps[0]" };

    expect(sectionOfIssue(body, at, PARTICIPANT)).toBe("paths");
    expect(issuesBySection(body, [at], PARTICIPANT).get("paths")).toEqual([at]);
  });
});

describe("the masthead's issues", () => {
  const at = (loc: string) => issue("step", "step_a", loc);

  it("keeps a name check, a description check and the rest apart", () => {
    const name = at("workflow.steps[0].label.en");
    const description = at("workflow.steps[0].description");
    const kind = at("workflow.steps[0].type");
    const held = mastheadIssues(step, [name, description, kind], PARTICIPANT);

    expect(held).toEqual({ name: [name], description: [description], end: [kind] });
  });

  it("leaves out what a section owns and what another step names", () => {
    const issues = [at("workflow.steps[0].key"), at("workflow.steps[0].assignment"), issue("step", "step_b", "workflow.steps[1].label")];

    expect(mastheadIssues(step, issues, PARTICIPANT)).toEqual({ name: [], description: [], end: [] });
  });

  it("reads the step's own key off the location", () => {
    expect(namesStepKey("workflow.steps[0].key")).toBe(true);
    expect(namesStepKey("workflow.steps[0].paths[0].key")).toBe(false);
    expect(namesStepKey("key")).toBe(false);
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
    expect(bySection.get("lifecycle")).toBeUndefined();
  });

  it("holds every issue the step owns across its sections", () => {
    const issues = [issue("path", "path_1"), issue("action", "act_entry")];

    expect([...issuesBySection(step, issues, PARTICIPANT).values()].flat()).toHaveLength(2);
  });

  it("counts no issue belonging to another step", () => {
    expect(issuesBySection(step, [issue("path", "path_elsewhere")], PARTICIPANT).size).toBe(0);
  });
});
