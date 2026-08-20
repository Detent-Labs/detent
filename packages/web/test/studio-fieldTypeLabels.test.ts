import { describe, expect, it } from "bun:test";
import { baseFieldType } from "workflow-engine/schema";
import { FIELD_TYPE_LABELS } from "../src/areas/studio/draft/field-type-labels.js";

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
  // record covers only the ten `BaseFieldType` values.
  it("carries no entry for the custom plugin envelope", () => {
    expect(Object.prototype.hasOwnProperty.call(FIELD_TYPE_LABELS, "__custom__")).toBe(false);
  });
});
