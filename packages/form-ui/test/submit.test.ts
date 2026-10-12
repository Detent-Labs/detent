import { describe, expect, it } from "bun:test";
import { editableFieldIds, filterToEditable, formIsReadonly } from "../src/submit.js";
import type { ResolvedViewField } from "../src/types.js";

const field = (id: string, overrides: Partial<ResolvedViewField> = {}): ResolvedViewField => ({
  field: { id, key: id, label: { en: id }, type: "string" },
  value: undefined,
  required: false,
  readonly: false,
  ...overrides,
});

describe("editableFieldIds", () => {
  it("excludes readonly and group-container fields, includes ordinary visible fields", () => {
    const fields = [
      field("f1"),
      field("f2", { readonly: true }),
      field("f_group", { field: { id: "f_group", key: "grp", label: { en: "Group" }, type: "group" } }),
    ];
    expect(editableFieldIds(fields)).toEqual(new Set(["f1"]));
  });

  it("contributes no key for a note, which carries no field of its own", () => {
    const fields = [field("f1"), { kind: "note" as const, text: { en: "A note" } }];
    expect(editableFieldIds(fields)).toEqual(new Set(["f1"]));
  });
});

describe("filterToEditable", () => {
  it("keeps only editable-field entries from submitted data", () => {
    const fields = [field("f1"), field("f2", { readonly: true })];
    const result = filterToEditable({ f1: "a", f2: "b", f3: "c" }, fields);
    expect(result).toEqual({ f1: "a" });
  });

  it("carries field keys alone past a note", () => {
    const fields = [field("f1"), { kind: "note" as const, text: { en: "A note" } }];
    const result = filterToEditable({ f1: "a", f3: "c" }, fields);
    expect(result).toEqual({ f1: "a" });
  });

  it("keeps a null value, which the engine reads as a cleared field", () => {
    const fields = [field("f1"), field("f2")];
    const result = filterToEditable({ f1: null, f2: "b" }, fields);
    expect(result).toEqual({ f1: null, f2: "b" });
    expect("f1" in result).toBe(true);
    expect(JSON.stringify(result)).toBe('{"f1":null,"f2":"b"}');
  });
});

describe("formIsReadonly", () => {
  it("is true for a running view with no available path", () => {
    expect(formIsReadonly({ status: "running", availablePaths: [] })).toBe(true);
  });

  it("is true for a finished case, whatever its paths", () => {
    for (const status of ["completed", "cancelled", "faulted"]) {
      expect(formIsReadonly({ status, availablePaths: [{ id: "p1" }] })).toBe(true);
      expect(formIsReadonly({ status, availablePaths: [] })).toBe(true);
    }
  });

  it("is false for a running view with one available path", () => {
    expect(formIsReadonly({ status: "running", availablePaths: [{ id: "p1" }] })).toBe(false);
  });
});
