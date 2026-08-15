import { describe, expect, it } from "bun:test";
import { matrixRows, cellState, cellEntry, liveCellSummary } from "../src/areas/studio/panels/fieldMatrixLogic.js";
import { setFlag, gatedKeys } from "../src/areas/studio/draft/view-flags.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { DraftViewField } from "../src/areas/studio/draft/view-layout.js";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";

type DraftStep = DraftOf<Step>;

function df(entry: Record<string, unknown>): DraftField {
  return entry as DraftField;
}

function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function vf(entry: Record<string, unknown>): DraftViewField {
  return entry as DraftViewField;
}

const FIELDS: DraftField[] = [
  df({
    id: "field_group",
    key: "line_item",
    type: "group",
    fields: [df({ id: "field_qty", key: "quantity", type: "number" })],
  }),
  df({ id: "field_vendor", key: "vendor", type: "text" }),
];

describe("matrixRows", () => {
  it("puts a group's own row immediately before its children, in catalog order", () => {
    const rows = matrixRows(FIELDS);
    expect(rows.map((r) => r.id)).toEqual(["field_group", "field_qty", "field_vendor"]);
  });

  it("marks the group row and no other", () => {
    const rows = matrixRows(FIELDS);
    expect(rows.map((r) => r.isGroup)).toEqual([true, false, false]);
  });

  it("indents the group's child one level, and the top-level field zero", () => {
    const rows = matrixRows(FIELDS);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0]);
  });
});

describe("cellState", () => {
  it("reads hatched for a step with no view at all", () => {
    expect(cellState(ds({ id: "step_a" }), "field_vendor")).toBe("hatched");
  });

  it("reads blank for a view-bearing step with no matching entry", () => {
    const step = ds({ id: "step_a", view: { fields: [vf({ ref: "field_qty" })] } });
    expect(cellState(step, "field_vendor")).toBe("blank");
  });

  it("reads live for a matching entry", () => {
    const step = ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor" })] } });
    expect(cellState(step, "field_vendor")).toBe("live");
  });
});

describe("cellEntry", () => {
  it("resolves a live cell's entry and array index", () => {
    const entry = vf({ ref: "field_vendor", required: true });
    const step = ds({ id: "step_a", view: { fields: [vf({ ref: "field_qty" }), entry] } });
    expect(cellEntry(step, "field_vendor")).toEqual({ entry, index: 1 });
  });

  it("returns undefined for a blank or hatched cell", () => {
    expect(cellEntry(ds({ id: "step_a" }), "field_vendor")).toBeUndefined();
    expect(cellEntry(ds({ id: "step_a", view: { fields: [] } }), "field_vendor")).toBeUndefined();
  });
});

describe("liveCellSummary", () => {
  it("reads a departure from FLAG_DEFAULT as active, and a default value as not", () => {
    const entry = vf({ ref: "field_vendor", required: true });
    const summary = liveCellSummary(entry);
    expect(summary.required).toEqual({ departsFromDefault: true, isExpression: false });
    expect(summary.readonly).toEqual({ departsFromDefault: false, isExpression: false });
    // visible defaults to true; absent here, so it resolves to the default.
    expect(summary.visible).toEqual({ departsFromDefault: false, isExpression: false });
  });

  it("marks a CEL-holding flag as an expression, never as a departure", () => {
    const entry = vf({ ref: "field_vendor", visible: { lang: "cel", src: "true" } });
    const summary = liveCellSummary(entry);
    expect(summary.visible).toEqual({ departsFromDefault: false, isExpression: true });
  });
});

describe("the cell editor's writer", () => {
  it("writes through setFlag's delete-on-default behavior", () => {
    const entry = vf({ ref: "field_vendor", required: true });
    const next = setFlag(entry, "required", false);
    expect("required" in next).toBe(false);
  });

  it("gates required/readonly the same way the form editor's strip does", () => {
    const entry = vf({ ref: "field_vendor", visible: false });
    expect(gatedKeys(entry)).toEqual(["required", "readonly"]);
  });
});
