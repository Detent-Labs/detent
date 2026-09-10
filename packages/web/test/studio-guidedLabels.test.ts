/**
 * `areas/studio/draft/guided-labels.ts`: the plain-language layer over the
 * definition contract (`studio-guided-vocabulary`).
 *
 * Every word reads through the studio catalog on each call, so a deployment's
 * stored override reaches it — the property `field-type-labels.ts` already
 * holds and this layer inherits (tasks 1.1, 1.3, 1.10).
 */
import { afterEach, describe, expect, it } from "bun:test";
import { setUiStringOverrides } from "../src/i18n/overrides.js";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";
import {
  assignmentStrategyLabel,
  assignmentWord,
  isCuratedAssignmentStrategy,
  newStepNote,
  newStepPhrase,
  stepKindPhrase,
  type AssignmentStrategyName,
} from "../src/areas/studio/draft/guided-labels.js";
import type { StepKind } from "../src/areas/studio/draft/createStep.js";

afterEach(() => setUiStringOverrides({}));

/** The four the engine registers: `static` in `src/engine/registry.ts`, and
 * the three `org.` types in `src/engine/assignment-strategies.ts`. */
const SHIPPED: AssignmentStrategyName[] = [
  "static",
  "org.manager-of-starter",
  "org.group-members",
  "org.actor-from-field",
];

describe("assignmentStrategyLabel", () => {
  it("answers a non-empty name and note for every shipped strategy", () => {
    for (const type of SHIPPED) {
      const entry = assignmentStrategyLabel(type);
      expect(entry.name.length, type).toBeGreaterThan(0);
      expect(entry.note.length, type).toBeGreaterThan(0);
    }
  });

  it("reads each word from the studio catalog, not from a literal", () => {
    for (const type of SHIPPED) {
      expect(assignmentStrategyLabel(type).name).toBe(studioCatalog.en[`assignmentStrategy.${type}.name`]);
      expect(assignmentStrategyLabel(type).note).toBe(studioCatalog.en[`assignmentStrategy.${type}.note`]);
    }
  });

  it("names the starter's manager and says the directory resolves that person", () => {
    const entry = assignmentStrategyLabel("org.manager-of-starter");
    expect(entry.name).toBe("The starter's manager");
    expect(entry.note).toContain("directory");
  });

  it("lets a deployment override reach the name", () => {
    setUiStringOverrides({
      studio: { en: { "assignmentStrategy.org.manager-of-starter.name": "Whoever signs off" } },
    });
    expect(assignmentStrategyLabel("org.manager-of-starter").name).toBe("Whoever signs off");
    expect(assignmentWord({ type: "org.manager-of-starter" }).text).toBe("Whoever signs off");
  });
});

describe("assignmentWord", () => {
  it("names a curated strategy plainly, with its note, and never in mono", () => {
    const word = assignmentWord({ type: "org.group-members" });
    expect(word.text).toBe(studioCatalog.en["assignmentStrategy.org.group-members.name"]);
    expect(word.note).toBe(studioCatalog.en["assignmentStrategy.org.group-members.note"]);
    expect(word.mono).toBe(false);
  });

  it("falls a registered strategy the curated table misses back to its registry type, in mono", () => {
    expect(isCuratedAssignmentStrategy("org.rota")).toBe(false);
    const word = assignmentWord({ type: "org.rota" });
    expect(word.text).toBe("org.rota");
    expect(word.mono).toBe(true);
    expect(word.note).toBeUndefined();
  });

  it("gives a step carrying no assignment its own string, naming no strategy", () => {
    const word = assignmentWord(undefined);
    expect(word.text).toBe(studioCatalog.en["assignment.none"]);
    expect(word.mono).toBe(false);
    expect(word.note).toBeUndefined();
    // A half-authored envelope carrying no type reads the same way: an absent
    // assignment is not a strategy, so nothing resolves through the registry.
    expect(assignmentWord({}).text).toBe(studioCatalog.en["assignment.none"]);
    expect(assignmentWord({ type: "" }).text).toBe(studioCatalog.en["assignment.none"]);
  });
});

describe("the step-kind phrases", () => {
  it("words the three the performed-by control offers", () => {
    expect(stepKindPhrase("participant")).toBe("A step someone works");
    expect(stepKindPhrase("subprocess")).toBe("A call to another process");
    expect(stepKindPhrase("terminal")).toBe("An end");
  });

  it("gives the palette's own three kinds the same three phrases", () => {
    expect(newStepPhrase("task")).toBe(stepKindPhrase("participant"));
    expect(newStepPhrase("subprocess")).toBe(stepKindPhrase("subprocess"));
    expect(newStepPhrase("end")).toBe(stepKindPhrase("terminal"));
  });

  it("reads each phrase from the catalog, so an override reaches it", () => {
    setUiStringOverrides({ studio: { en: { "stepKind.terminal": "The last step" } } });
    expect(stepKindPhrase("terminal")).toBe("The last step");
    expect(newStepPhrase("end")).toBe("The last step");
  });
});

describe("newStepNote", () => {
  it("answers a non-empty note for each of the palette's three kinds", () => {
    const kinds: StepKind[] = ["task", "subprocess", "end"];
    for (const kind of kinds) {
      expect(newStepNote(kind).length, kind).toBeGreaterThan(0);
    }
  });

  it("gives the three kinds three different notes", () => {
    const notes = new Set((["task", "subprocess", "end"] as StepKind[]).map(newStepNote));
    expect(notes.size).toBe(3);
  });
});

describe("the studio catalog after the reword", () => {
  const values = Object.values(studioCatalog.en);

  it("prints neither `terminal` nor `performed by` on any authoring surface", () => {
    expect(values.filter((v) => /\bterminal\b/i.test(v))).toEqual([]);
    expect(values.filter((v) => /performed by/i.test(v))).toEqual([]);
  });

  it("prints no bare `assignment strategy` label", () => {
    expect(values.filter((v) => /assignment strategy/i.test(v))).toEqual([]);
  });
});
