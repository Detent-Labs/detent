import { describe, expect, it } from "bun:test";
import { applyVisibleOverride, fieldUsage, fieldVisibleOverrides } from "../src/areas/studio/draft/field-usage.js";
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
