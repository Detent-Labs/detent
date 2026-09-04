import { describe, expect, it } from "bun:test";
import {
  applyVisibleOverride,
  applyTechnicalMarker,
  countTechnicalClearKeys,
  fieldUsage,
  fieldVisibleOverrides,
  fieldRequiredOverrides,
  applyRequiredOverride,
  needsTechnicalToggleConfirm,
} from "../src/areas/studio/draft/field-usage.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** A draft with two steps referencing `field_vendor`, one referencing
 * nothing, and a group field whose child a third step's view references —
 * every shape `fieldUsage` and `fieldVisibleOverrides` need to walk. */
const draft = (): Draft =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [
      { id: "field_vendor", key: "vendor", label: { en: "Vendor" }, type: "string" },
      {
        id: "field_group",
        key: "line_item",
        label: { en: "Line item" },
        type: "group",
        fields: [{ id: "field_qty", key: "qty", label: { en: "Qty" }, type: "number" }],
      },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_vendor", required: true }] },
        },
        {
          id: "step_b",
          key: "b",
          label: { en: "B" },
          type: "task",
          view: { fields: [{ ref: "field_vendor", readonly: true }] },
        },
        {
          id: "step_c",
          key: "c",
          label: { en: "C" },
          type: "task",
          terminal: true,
          view: { fields: [{ ref: "field_qty" }] },
        },
      ],
    },
  }) as unknown as Draft;

describe("fieldUsage", () => {
  it("names every step referencing the field, and the modes each sets", () => {
    const rows = fieldUsage(draft(), "field_vendor", "en", "en");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ stepId: "step_a", stepLabel: "A", modes: ["required"] });
    expect(rows[1]).toEqual({ stepId: "step_b", stepLabel: "B", modes: ["readonly"] });
  });

  it("returns nothing for a field no step's view references", () => {
    expect(fieldUsage(draft(), "field_group", "en", "en")).toEqual([]);
  });

  it("finds a group field's child through the same walk", () => {
    const rows = fieldUsage(draft(), "field_qty", "en", "en");
    expect(rows).toEqual([{ stepId: "step_c", stepLabel: "C", modes: [] }]);
  });
});

describe("fieldVisibleOverrides", () => {
  it("reports none for a field no step references", () => {
    expect(fieldVisibleOverrides(draft(), "field_group")).toEqual({ kind: "none" });
  });

  it("reports uniform for a field referenced by exactly one step", () => {
    expect(fieldVisibleOverrides(draft(), "field_qty")).toEqual({
      kind: "uniform",
      stepIds: ["step_c"],
      value: undefined,
    });
  });

  it("reports uniform when every referencing view carries the same expression", () => {
    const d = draft();
    (d.workflow!.steps![0]!.view!.fields![0] as Record<string, unknown>).visible = { lang: "cel", src: "data.x" };
    (d.workflow!.steps![1]!.view!.fields![0] as Record<string, unknown>).visible = { lang: "cel", src: "data.x" };
    expect(fieldVisibleOverrides(d, "field_vendor")).toEqual({
      kind: "uniform",
      stepIds: ["step_a", "step_b"],
      value: { lang: "cel", src: "data.x" },
    });
  });

  it("reports divergent when the expression sources differ", () => {
    const d = draft();
    (d.workflow!.steps![0]!.view!.fields![0] as Record<string, unknown>).visible = { lang: "cel", src: "data.x" };
    (d.workflow!.steps![1]!.view!.fields![0] as Record<string, unknown>).visible = { lang: "cel", src: "data.y" };
    expect(fieldVisibleOverrides(d, "field_vendor")).toEqual({
      kind: "divergent",
      stepIds: ["step_a", "step_b"],
      literalStepIds: [],
    });
  });

  it("reports divergent, naming the step, when one view carries a literal beside an expression", () => {
    const d = draft();
    (d.workflow!.steps![0]!.view!.fields![0] as Record<string, unknown>).visible = false;
    (d.workflow!.steps![1]!.view!.fields![0] as Record<string, unknown>).visible = { lang: "cel", src: "data.x" };
    expect(fieldVisibleOverrides(d, "field_vendor")).toEqual({
      kind: "divergent",
      stepIds: ["step_a", "step_b"],
      literalStepIds: ["step_a"],
    });
  });
});

describe("applyVisibleOverride", () => {
  it("writes the same expression to every referencing view, leaving a non-referencing step untouched", () => {
    const d = draft();
    applyVisibleOverride(d, "field_vendor", { lang: "cel", src: "data.x" });
    expect(d.workflow!.steps![0]!.view!.fields![0]!.visible).toEqual({ lang: "cel", src: "data.x" });
    expect(d.workflow!.steps![1]!.view!.fields![0]!.visible).toEqual({ lang: "cel", src: "data.x" });
    expect(d.workflow!.steps![2]!.view!.fields![0]!.visible).toBeUndefined();
  });

  it("replaces a step's literal visible with the written expression", () => {
    const d = draft();
    (d.workflow!.steps![0]!.view!.fields![0] as Record<string, unknown>).visible = false;
    applyVisibleOverride(d, "field_vendor", { lang: "cel", src: "data.x" });
    expect(d.workflow!.steps![0]!.view!.fields![0]!.visible).toEqual({ lang: "cel", src: "data.x" });
  });

  it("clears the key rather than writing undefined", () => {
    const d = draft();
    applyVisibleOverride(d, "field_vendor", { lang: "cel", src: "data.x" });
    applyVisibleOverride(d, "field_vendor", undefined);
    expect("visible" in d.workflow!.steps![0]!.view!.fields![0]!).toBe(false);
    expect("visible" in d.workflow!.steps![1]!.view!.fields![0]!).toBe(false);
  });
});

describe("countTechnicalClearKeys", () => {
  it("counts required and readonly keys across every step referencing the field", () => {
    // field_vendor: step_a carries required, step_b carries readonly -> 2.
    expect(countTechnicalClearKeys(draft(), "field_vendor")).toBe(2);
  });

  it("counts zero for a field no view entry carries required or readonly for", () => {
    expect(countTechnicalClearKeys(draft(), "field_qty")).toBe(0);
  });

  it("counts zero for a field no step references", () => {
    expect(countTechnicalClearKeys(draft(), "field_group")).toBe(0);
  });
});

describe("applyTechnicalMarker", () => {
  it("checking Technical writes the key on the top-level field found by id", () => {
    const d = draft();
    applyTechnicalMarker(d, "field_vendor", true);
    expect((d.fields![0] as Record<string, unknown>).technical).toBe(true);
  });

  it("checking Technical writes the key on a group's nested child", () => {
    const d = draft();
    applyTechnicalMarker(d, "field_qty", true);
    const group = d.fields![1] as unknown as { fields: Record<string, unknown>[] };
    expect(group.fields[0]!.technical).toBe(true);
  });

  it("checking Technical clears every required/readonly key across every step", () => {
    const d = draft();
    applyTechnicalMarker(d, "field_vendor", true);
    expect("required" in d.workflow!.steps![0]!.view!.fields![0]!).toBe(false);
    expect("readonly" in d.workflow!.steps![1]!.view!.fields![0]!).toBe(false);
  });

  it("unchecking Technical deletes the key and writes back no required or readonly key", () => {
    const d = draft();
    applyTechnicalMarker(d, "field_vendor", true);
    applyTechnicalMarker(d, "field_vendor", false);
    expect("technical" in (d.fields![0] as Record<string, unknown>)).toBe(false);
    expect("required" in d.workflow!.steps![0]!.view!.fields![0]!).toBe(false);
    expect("readonly" in d.workflow!.steps![1]!.view!.fields![0]!).toBe(false);
  });

  it("checking Technical on a field with no stale key leaves nothing to clear, and no-ops safely on an unmatched id", () => {
    const d = draft();
    applyTechnicalMarker(d, "field_qty", true);
    expect(countTechnicalClearKeys(d, "field_qty")).toBe(0);
    expect(() => applyTechnicalMarker(d, "field_does_not_exist", true)).not.toThrow();
  });
});

describe("needsTechnicalToggleConfirm", () => {
  it("needs confirmation when checking a field with stale required/readonly keys (task 3.7)", () => {
    expect(needsTechnicalToggleConfirm(true, countTechnicalClearKeys(draft(), "field_vendor"))).toBe(true);
  });

  it("needs no confirmation when checking a field with nothing to clear (task 3.8)", () => {
    expect(needsTechnicalToggleConfirm(true, countTechnicalClearKeys(draft(), "field_qty"))).toBe(false);
  });

  it("needs no confirmation when unchecking, whatever the count", () => {
    expect(needsTechnicalToggleConfirm(false, countTechnicalClearKeys(draft(), "field_vendor"))).toBe(false);
  });
});

/** The "Ask for this" row's read, write and disagreement (task 6.7). The
 * fixture already carries the disagreement: `step_a` asks for the vendor and
 * `step_b` carries no `required` key at all. */
describe("fieldRequiredOverrides", () => {
  it("answers none for a field no step view references", () => {
    expect(fieldRequiredOverrides(draft(), "field_group")).toEqual({ kind: "none" });
  });

  it("answers uniform false where the one referencing view carries no required key", () => {
    expect(fieldRequiredOverrides(draft(), "field_qty")).toEqual({ kind: "uniform", stepIds: ["step_c"], value: false });
  });

  it("names the differing step where two views disagree", () => {
    expect(fieldRequiredOverrides(draft(), "field_vendor")).toEqual({
      kind: "divergent",
      stepIds: ["step_a", "step_b"],
      differingStepIds: ["step_b"],
    });
  });

  it("counts an expression as a disagreement, since the row writes a boolean alone", () => {
    const d = draft();
    // The draft's view entry is a union with the note shape, which declares
    // no `required` key; the cast reaches the field entry the fixture builds.
    (d.workflow!.steps![1]!.view!.fields![0] as { required?: unknown }).required = { lang: "cel", src: "data.vendor != ''" };
    const state = fieldRequiredOverrides(d, "field_vendor");
    expect(state.kind).toBe("divergent");
    expect(state.kind === "divergent" && state.differingStepIds).toEqual(["step_b"]);
  });
});

describe("applyRequiredOverride", () => {
  it("writes required: true on every referencing view", () => {
    const d = draft();
    applyRequiredOverride(d, "field_vendor", true);
    expect(fieldRequiredOverrides(d, "field_vendor")).toEqual({
      kind: "uniform",
      stepIds: ["step_a", "step_b"],
      value: true,
    });
  });

  it("drops the key rather than writing a literal false", () => {
    const d = draft();
    applyRequiredOverride(d, "field_vendor", false);
    for (const step of d.workflow!.steps!) {
      for (const entry of step.view?.fields ?? []) {
        expect("required" in entry).toBe(false);
      }
    }
  });

  it("leaves a view entry naming another field alone", () => {
    const d = draft();
    applyRequiredOverride(d, "field_vendor", true);
    expect("required" in d.workflow!.steps![2]!.view!.fields![0]!).toBe(false);
  });
});
