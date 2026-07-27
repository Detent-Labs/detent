import { describe, expect, it } from "bun:test";
import { editableFieldIds, filterToEditable } from "../src/submit.js";
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
});

describe("filterToEditable", () => {
  it("keeps only editable-field entries from submitted data", () => {
    const fields = [field("f1"), field("f2", { readonly: true })];
    const result = filterToEditable({ f1: "a", f2: "b", f3: "c" }, fields);
    expect(result).toEqual({ f1: "a" });
  });
});
