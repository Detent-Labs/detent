/**
 * Which sections the step page stands for a performed-by value, in reading
 * order, and the catalog key each header reads (`panels/sectionsFor.ts`),
 * tested as pure functions — no DOM, no rendering.
 */
import { describe, expect, it } from "bun:test";
import { step } from "workflow-engine/schema";
import type { PerformedBy } from "../src/areas/studio/draft/performedBy.js";
import { sectionLabel, sectionsFor, type SectionName } from "../src/areas/studio/panels/sectionsFor.js";

/**
 * Where each key of the engine's `step` schema is edited on the step page
 * (`panels/StepPage.tsx`): in one of its sections, or in the masthead. The
 * three action lists stand in When entered or left, and `cancellable` and
 * `collaboration` in More.
 */
const STEP_KEY_SECTION: { readonly [key: string]: SectionName | "masthead" } = {
  id: "masthead",
  key: "masthead",
  label: "masthead",
  description: "masthead",
  type: "masthead",
  terminal: "masthead",
  cancellable: "more",
  outcome: "howItEnds",
  subprocess: "subprocess",
  view: "form",
  assignment: "assignment",
  collaboration: "more",
  onEntry: "lifecycle",
  onExit: "lifecycle",
  onCancel: "lifecycle",
  timers: "timers",
  paths: "paths",
};

describe("sectionsFor", () => {
  it("stands six sections for a step someone works, in reading order", () => {
    expect(sectionsFor("participant")).toEqual(["assignment", "form", "paths", "timers", "lifecycle", "more"]);
  });

  it("leads a subprocess step with the process it calls, and drops Who acts and Form", () => {
    expect(sectionsFor("subprocess")).toEqual(["subprocess", "paths", "timers", "lifecycle", "more"]);
  });

  it("gives an end step How the case ends in place of Ways out, and no Time limit", () => {
    expect(sectionsFor("terminal")).toEqual(["assignment", "form", "howItEnds", "lifecycle", "more"]);
  });

  it("stands six sections at most for any kind", () => {
    for (const kind of ["participant", "subprocess", "terminal"] as const) {
      expect(sectionsFor(kind).length).toBeLessThanOrEqual(6);
    }
  });

  it("hands back a fresh array, so a caller cannot reach the module's own list", () => {
    const first = sectionsFor("participant");
    first.length = 0;

    expect(sectionsFor("participant")).toHaveLength(6);
  });
});

describe("sectionLabel", () => {
  it("reads When entered or left on a task step and a subprocess step", () => {
    expect(sectionLabel("lifecycle", "participant")).toBe("stepSections.lifecycle");
    expect(sectionLabel("lifecycle", "subprocess")).toBe("stepSections.lifecycle");
  });

  it("reads When entered on an end step, which is never left", () => {
    expect(sectionLabel("lifecycle", "terminal")).toBe("stepSections.lifecycleEntryOnly");
  });

  it("keeps every other section's own key, whatever the kind", () => {
    const keys: [SectionName, string][] = [
      ["assignment", "stepSections.assignment"],
      ["form", "stepSections.form"],
      ["subprocess", "stepSections.subprocess"],
      ["paths", "stepSections.paths"],
      ["howItEnds", "stepSections.howItEnds"],
      ["timers", "stepSections.timers"],
      ["more", "stepSections.more"],
    ];
    for (const kind of ["participant", "subprocess", "terminal"] as const) {
      for (const [section, key] of keys) expect(`${kind} ${section}: ${sectionLabel(section, kind)}`).toBe(`${kind} ${section}: ${key}`);
    }
  });
});

describe("sectionsFor: the engine's step keys", () => {
  it("maps every key of the step schema to a section or the masthead", () => {
    const unmapped = Object.keys(step.shape).filter((key) => STEP_KEY_SECTION[key] === undefined);

    expect(unmapped).toEqual([]);
  });

  it("maps no key to a section that no step kind stands", () => {
    const kinds: PerformedBy[] = ["participant", "subprocess", "terminal"];
    const stood = new Set<string>(kinds.flatMap((kind) => sectionsFor(kind)));
    const unstood = Object.entries(STEP_KEY_SECTION)
      .filter(([, section]) => section !== "masthead" && !stood.has(section))
      .map(([key]) => key);

    expect(unstood).toEqual([]);
  });
});
