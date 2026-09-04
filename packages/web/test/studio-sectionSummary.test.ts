/**
 * What each section head in the configuration pane shows, and which sections
 * open by default (`panels/sectionSummary.ts`), tested as pure functions — no
 * DOM, no rendering.
 *
 * The guard case is the one that pins the split `studio-app` states: an issue
 * `resolveLoc` resolved to a path counts on the Paths head and on the
 * masthead, and on nothing else. The masthead's own total comes from
 * `stepIssueCount`, so the case asserts against that function rather than
 * against a second copy of its rule.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { stepIssueCount } from "../src/areas/studio/draft/panel-rail.js";
import { sectionsFor } from "../src/areas/studio/panels/sectionsFor.js";
import { defaultOpenSections, sectionSummaries, type SectionSummary } from "../src/areas/studio/panels/sectionSummary.js";

type DraftStep = DraftOf<Step>;

function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function issue(entityType: EditorIssue["entityType"], entityId: string): EditorIssue {
  return { entityType, entityId, message: "no", source: "cel", loc: "" };
}

function valueOf(summaries: SectionSummary[], section: string): number | string | undefined {
  return summaries.find((s) => s.section === section)?.value;
}

function issuesOf(summaries: SectionSummary[], section: string): number | undefined {
  return summaries.find((s) => s.section === section)?.issues;
}

const PARTICIPANT = sectionsFor("participant");

describe("sectionSummaries values", () => {
  it("reads a count per section, and nothing for an empty one", () => {
    const step = ds({
      id: "step_a",
      onEntry: [],
      paths: [
        { id: "path_1", to: "step_b" },
        { id: "path_2", to: "step_c" },
        { id: "path_3", to: "step_d" },
      ],
      timers: [{ id: "timer_1" }, { id: "timer_2" }],
    });
    const summaries = sectionSummaries(step, [], PARTICIPANT);
    expect(valueOf(summaries, "paths")).toBe(3);
    expect(valueOf(summaries, "timers")).toBe(2);
    expect(valueOf(summaries, "entry")).toBeUndefined();
  });

  it("totals onExit and onCancel on the Exit section, and onEntry alone on Entry", () => {
    const step = ds({
      id: "step_a",
      onEntry: [{ id: "act_1" }],
      onExit: [{ id: "act_2" }],
      onCancel: [{ id: "act_3" }],
    });
    const summaries = sectionSummaries(step, [], PARTICIPANT);
    expect(valueOf(summaries, "entry")).toBe(1);
    expect(valueOf(summaries, "exit")).toBe(2);
  });

  it("names the assignment strategy's own type", () => {
    const step = ds({ id: "step_a", assignment: { strategy: { type: "org.group-members", config: {} } } });
    expect(valueOf(sectionSummaries(step, [], PARTICIPANT), "assignment")).toBe("org.group-members");
  });

  it("counts the Form section's configured field entries, and no note", () => {
    const step = ds({
      id: "step_a",
      view: { fields: [{ ref: "field_1" }, { kind: "note", text: { en: "hi" } }, { ref: "field_2" }] },
    });
    expect(valueOf(sectionSummaries(step, [], PARTICIPANT), "form")).toBe(2);
  });

  it("names the child process a subprocess step calls", () => {
    const step = ds({ id: "step_a", type: "subprocess", subprocess: { processId: "proc_child" } });
    const summaries = sectionSummaries(step, [], sectionsFor("subprocess"));
    expect(valueOf(summaries, "subprocess")).toBe("proc_child");
  });

  it("summarizes only the sections it was handed", () => {
    const step = ds({ id: "step_a", terminal: true, paths: [], timers: [] });
    const summaries = sectionSummaries(step, [], sectionsFor("terminal"));
    expect(summaries.map((s) => s.section)).toEqual(["entry", "assignment", "form", "exit"]);
  });
});

describe("sectionSummaries issue counts", () => {
  const step = ds({
    id: "step_a",
    paths: [{ id: "path_1", to: "step_b", guard: { lang: "cel", src: "data.nope" } }],
    timers: [{ id: "timer_1" }],
    onEntry: [{ id: "act_entry" }],
    onExit: [{ id: "act_exit" }],
  });

  it("lands a path's guard issue on Paths and on the masthead alone", () => {
    const issues = [issue("path", "path_1")];
    const summaries = sectionSummaries(step, issues, PARTICIPANT);
    expect(issuesOf(summaries, "paths")).toBe(1);
    for (const section of ["entry", "assignment", "form", "timers", "exit"]) {
      expect(issuesOf(summaries, section)).toBe(0);
    }
    expect(stepIssueCount(issues, step)).toBe(1);
  });

  it("lands an issue resolving to the step itself on the masthead alone", () => {
    const issues = [issue("step", "step_a")];
    const summaries = sectionSummaries(step, issues, PARTICIPANT);
    expect(summaries.every((s) => s.issues === 0)).toBe(true);
    expect(stepIssueCount(issues, step)).toBe(1);
  });

  it("lands a timer's issue on Timers, and an action's on the list that holds it", () => {
    const summaries = sectionSummaries(
      step,
      [issue("timer", "timer_1"), issue("action", "act_entry"), issue("action", "act_exit")],
      PARTICIPANT,
    );
    expect(issuesOf(summaries, "timers")).toBe(1);
    expect(issuesOf(summaries, "entry")).toBe(1);
    expect(issuesOf(summaries, "exit")).toBe(1);
  });

  it("counts no issue belonging to another step", () => {
    const summaries = sectionSummaries(step, [issue("path", "path_elsewhere")], PARTICIPANT);
    expect(summaries.every((s) => s.issues === 0)).toBe(true);
  });
});

describe("defaultOpenSections", () => {
  it("opens a section carrying content and leaves an empty one closed", () => {
    const step = ds({ id: "step_a", paths: [{ id: "path_1", to: "step_b" }], timers: [{ id: "timer_1" }] });
    const open = defaultOpenSections(sectionSummaries(step, [], PARTICIPANT));
    expect(open.has("paths")).toBe(true);
    expect(open.has("timers")).toBe(true);
    expect(open.has("entry")).toBe(false);
    expect(open.has("form")).toBe(false);
  });

  it("opens an empty section carrying an issue", () => {
    const step = ds({ id: "step_a", timers: [{ id: "timer_1" }] });
    const open = defaultOpenSections(sectionSummaries(step, [issue("timer", "timer_1")], PARTICIPANT));
    expect(open.has("timers")).toBe(true);
  });

  it("opens nothing on a step carrying no configuration at all", () => {
    expect(defaultOpenSections(sectionSummaries(ds({ id: "step_a" }), [], PARTICIPANT)).size).toBe(0);
  });
});
