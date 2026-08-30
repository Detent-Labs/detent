import { describe, expect, it } from "bun:test";
import { baseFieldType, fieldControl, fieldFormat } from "workflow-engine/schema";
import { FIELD_CONTROL_LABELS, FIELD_FORMAT_LABELS, FIELD_TYPE_LABELS } from "../src/areas/studio/draft/field-type-labels.js";

describe("FIELD_TYPE_LABELS", () => {
  it("maps every baseFieldType value exactly once", () => {
    const keys = Object.keys(FIELD_TYPE_LABELS).sort();
    expect(keys).toEqual([...baseFieldType.options].sort());
  });

  it("gives every entry a non-empty name and note", () => {
    for (const type of baseFieldType.options) {
      const entry = FIELD_TYPE_LABELS[type];
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(0);
    }
  });

  // The custom plugin envelope keeps its own catalog-driven label
  // (`fieldCatalog.customTypeOption`) rather than an entry here — this
  // record covers only the six `BaseFieldType` values.
  it("carries no entry for the custom plugin envelope", () => {
    expect(Object.prototype.hasOwnProperty.call(FIELD_TYPE_LABELS, "__custom__")).toBe(false);
  });

  it("names no type the contract no longer carries", () => {
    for (const gone of ["select", "multiselect", "date", "datetime", "reference"]) {
      expect(Object.prototype.hasOwnProperty.call(FIELD_TYPE_LABELS, gone)).toBe(false);
    }
  });
});

describe("FIELD_FORMAT_LABELS and FIELD_CONTROL_LABELS", () => {
  it("map every fieldFormat member exactly once, with a non-empty name and note", () => {
    expect(Object.keys(FIELD_FORMAT_LABELS).sort()).toEqual([...fieldFormat.options].sort());
    for (const f of fieldFormat.options) {
      expect(FIELD_FORMAT_LABELS[f].name.length).toBeGreaterThan(0);
      expect(FIELD_FORMAT_LABELS[f].note.length).toBeGreaterThan(0);
    }
  });

  it("map every fieldControl member exactly once, with a non-empty name and note", () => {
    expect(Object.keys(FIELD_CONTROL_LABELS).sort()).toEqual([...fieldControl.options].sort());
    for (const c of fieldControl.options) {
      expect(FIELD_CONTROL_LABELS[c].name.length).toBeGreaterThan(0);
      expect(FIELD_CONTROL_LABELS[c].note.length).toBeGreaterThan(0);
    }
  });
});
