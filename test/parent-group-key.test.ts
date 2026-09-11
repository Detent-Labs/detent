/**
 * `parentGroupKeyById`'s own contract: a top-level field id gets no entry, a
 * one-deep member maps to its group's key, and a two-deep member maps to its
 * OWN group's key, not the outermost one. `compile.ts::checkViewGroupReferences`
 * reads it. The studio keeps its own draft-shaped walk,
 * `draftParentGroupKeyById`, because this helper is typed against the
 * fully-required `FieldDef[]`; `studio-view-tree.test.ts` covers that walk.
 */
import { describe, it, expect } from "bun:test";
import { parentGroupKeyById, type FieldDef, type FieldId } from "../src/schema/definition.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fld = (over: any): FieldDef => ({ label: { en: "X" }, type: "string", ...over }) as FieldDef;

describe("parentGroupKeyById", () => {
  it("gives a flat catalog no entries", () => {
    const fields = [fld({ id: "field_a", key: "a" }), fld({ id: "field_b", key: "b" })];

    const map = parentGroupKeyById(fields);

    expect(map.size).toBe(0);
    expect(map.has("field_a" as FieldId)).toBe(false);
    expect(map.has("field_b" as FieldId)).toBe(false);
  });

  it("maps a one-deep group's members to the group's key", () => {
    const fields = [
      fld({
        id: "field_g",
        key: "grp",
        type: "group",
        fields: [fld({ id: "field_a", key: "a" }), fld({ id: "field_b", key: "b" })],
      }),
      fld({ id: "field_top", key: "top" }),
    ];

    const map = parentGroupKeyById(fields);

    expect(map.get("field_a" as FieldId)).toBe("grp");
    expect(map.get("field_b" as FieldId)).toBe("grp");
    expect(map.has("field_g" as FieldId)).toBe(false);
    expect(map.has("field_top" as FieldId)).toBe(false);
  });

  it("maps a two-deep nesting to each field's own immediate parent", () => {
    const fields = [
      fld({
        id: "field_outer",
        key: "outer",
        type: "group",
        fields: [
          fld({
            id: "field_inner",
            key: "inner",
            type: "group",
            fields: [fld({ id: "field_leaf", key: "leaf" })],
          }),
        ],
      }),
    ];

    const map = parentGroupKeyById(fields);

    // The inner group is itself a child of the outer group.
    expect(map.get("field_inner" as FieldId)).toBe("outer");
    // The leaf's parent is the inner group, not the outer one.
    expect(map.get("field_leaf" as FieldId)).toBe("inner");
    expect(map.has("field_outer" as FieldId)).toBe(false);
  });
});
