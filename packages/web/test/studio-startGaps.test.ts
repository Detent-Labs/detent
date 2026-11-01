import { describe, expect, it } from "bun:test";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { showsStructuralBanner, structuralBannerStands } from "../src/areas/studio/draft/startGaps.js";
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
    expect(v.issues.map((i) => i.loc)).toEqual(["fields[0].type"]);
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

  it("clears the name sentence once the process has a name", () => {
    const unnamed = run(withEndStep({ key: "invoice", label: { en: "" } }));
    expect(unnamed.issues.map((i) => i.sentence)).toEqual([t("issues.processNeedsName")]);
    expect(run(withEndStep({ key: "invoice", label: { en: "Invoice" } })).issues).toEqual([]);
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
    expect(v.issues).toHaveLength(3);
    const name = v.issues.find((i) => i.loc === "label");
    expect(name?.plain).toBe(true);
    expect(name?.message).toBe(t("issues.processNeedsName"));
    expect(v.issues.filter((i) => i.source === "zod" && !i.plain)).toHaveLength(2);
    expect(showsStructuralBanner(v)).toBe(true);
  });

  it("reads a stepless draft with a dangling initialStep as a start state", () => {
    const v = run({ ...d1(), workflow: { steps: [], initialStep: "step_00000000-0000-4000-8000-000000000009" } });
    expect(v.noStepYet).toBe(true);
    expect(v.issues.some((i) => i.loc === "workflow.initialStep")).toBe(false);
    expect(v.issues.every((i) => i.plain === true)).toBe(true);
    expect(showsStructuralBanner(v)).toBe(false);
  });

  it("returns the start state when the last step is removed", () => {
    const v = run({ ...d1(), workflow: { steps: [], initialStep: undefined } });
    expect(v.noStepYet).toBe(true);
    expect(v.issues).toHaveLength(0);
    expect(showsStructuralBanner(v)).toBe(false);
  });
});

describe("structuralBannerStands", () => {
  const open = { issues: [{ entityType: "step", entityId: "step_a", message: "bad", source: "zod", loc: "workflow.steps[0].paths" }] } as Parameters<typeof structuralBannerStands>[0];

  it("leaves the Checks tab, where it only repeats the list", () => {
    expect(structuralBannerStands(open, "checks", false)).toBe(false);
  });

  it("stands on every other tab", () => {
    for (const tab of ["map", "steps", "fields", "forms", "settings"] as const) expect(structuralBannerStands(open, tab, false)).toBe(true);
  });

  it("stands on the JSON surface over the Checks tab, where no list shows", () => {
    expect(structuralBannerStands(open, "checks", true)).toBe(true);
  });

  it("stands nowhere without a Zod issue", () => {
    expect(structuralBannerStands({ issues: [] }, "steps", false)).toBe(false);
  });
});
