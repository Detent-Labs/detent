import { describe, expect, it } from "bun:test";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { showsStructuralBanner } from "../src/areas/studio/draft/startGaps.js";
import { newStep } from "../src/areas/studio/draft/createStep.js";
import { t } from "../src/areas/studio/catalog.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

const d1 = (): Record<string, unknown> => ({ key: "", label: {}, baseLocale: "en", fields: [], workflow: { steps: [] } });
const run = (body: Record<string, unknown>) => runValidation(body as unknown as Draft, undefined, {}, {});

const STEP_ID = "step_00000000-0000-4000-8000-000000000001";
const endStep = { id: STEP_ID, key: "s", label: { en: "Start" }, type: "task", terminal: true, paths: [] };
const withEndStep = (over: Record<string, unknown> = {}) => ({
  ...d1(),
  ...over,
  workflow: { initialStep: STEP_ID, steps: [endStep] },
});

describe("the start gaps of a fresh draft", () => {
  it("reads the D1 body as a start state with no issue", () => {
    const v = run(d1());
    expect(v.noStepYet).toBe(true);
    expect(v.issues).toHaveLength(0);
    expect(showsStructuralBanner(v)).toBe(false);
  });

  it("keeps another Zod issue of a stepless draft and its banner", () => {
    const v = run({ ...d1(), fields: [{ id: "field_00000000-0000-4000-8000-000000000001", key: "a", label: { en: "A" } }] });
    expect(v.noStepYet).toBe(true);
    expect(v.issues.length).toBeGreaterThan(0);
    expect(v.issues.every((i) => i.loc !== "workflow.initialStep")).toBe(true);
    expect(showsStructuralBanner(v)).toBe(true);
  });

  it("reads an unnamed process with a step as one plain sentence", () => {
    const v = run(withEndStep());
    expect(v.noStepYet).toBeUndefined();
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0].plain).toBe(true);
    expect(v.issues[0].message).toBe("The process needs a name. Type it in the name field at the top of the page.");
    expect(v.issues[0].message).toBe(t("issues.processNeedsName"));
    expect(showsStructuralBanner(v)).toBe(false);
  });

  it("reads a named process with a step as clean", () => {
    const v = run(withEndStep({ key: "invoice", label: { en: "Invoice" } }));
    expect(v.noStepYet).toBeUndefined();
    expect(v.issues).toHaveLength(0);
    expect(showsStructuralBanner(v)).toBe(false);
  });

  it("brings the banner back with the step Add step mints", () => {
    const step = newStep("task", { en: "" });
    const v = run({ ...d1(), workflow: { initialStep: step.id, steps: [step] } });
    expect(v.noStepYet).toBeUndefined();
    expect(v.issues.find((i) => i.loc === "label")?.plain).toBe(true);
    expect(v.issues.some((i) => i.source === "zod" && !i.plain)).toBe(true);
    expect(showsStructuralBanner(v)).toBe(true);
  });
});
