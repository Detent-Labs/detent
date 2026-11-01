import { describe, expect, it } from "bun:test";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { stepRemovalReach } from "../src/areas/studio/draft/stepRemoval.js";
import { formCounts } from "../src/areas/studio/panels/formCardRows.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";

/**
 * What the Remove this step dialog counts (`studio-step-page`: "The removal
 * dialog counts what the removal reaches"). Pure — no DOM, no rendering.
 */

const FIELDS = [
  { id: "field_1", key: "a", type: "string", label: { en: "A" } },
  { id: "field_2", key: "b", type: "string", label: { en: "B" } },
  { id: "field_3", key: "c", type: "string", label: { en: "C" } },
] as unknown as DraftField[];

const REVIEW = {
  id: "step_review",
  key: "review",
  view: { fields: [{ ref: "field_1", required: true }, { ref: "field_2" }, { kind: "note", text: { en: "Read me" } }] },
  // The step's own ways out, one of them a loop back to itself: none of them
  // leads here from another step.
  paths: [
    { id: "path_self", to: "step_review" },
    { id: "path_on", to: "step_done" },
  ],
};

const DRAFT = {
  baseLocale: "en",
  workflow: {
    initialStep: "step_intake",
    steps: [
      { id: "step_intake", key: "intake", paths: [{ id: "path_1", to: "step_review" }, { id: "path_2", to: "step_done" }] },
      REVIEW,
      { id: "step_rework", key: "rework", paths: [{ id: "path_3", to: "step_review" }] },
      { id: "step_done", key: "done", terminal: true },
    ],
  },
} as unknown as Draft;

describe("stepRemovalReach", () => {
  it("counts two ways out from two other steps, and ignores the step's own", () => {
    expect(stepRemovalReach(DRAFT, "step_review", FIELDS).incomingPaths).toBe(2);
  });

  it("counts the form's fields as formCounts does", () => {
    const reach = stepRemovalReach(DRAFT, "step_review", FIELDS);

    expect(reach.formFields).toBe(formCounts(REVIEW as unknown as DraftStep, FIELDS).fieldCount);
    expect(reach.formFields).toBe(2);
  });

  it("reads whether the step is the process's first step", () => {
    expect(stepRemovalReach(DRAFT, "step_intake", FIELDS).isInitial).toBe(true);
    expect(stepRemovalReach(DRAFT, "step_review", FIELDS).isInitial).toBe(false);
  });

  it("counts nothing for a step nothing leads to and with no form", () => {
    expect(stepRemovalReach(DRAFT, "step_intake", FIELDS)).toEqual({ incomingPaths: 0, formFields: 0, isInitial: true });
  });
});
