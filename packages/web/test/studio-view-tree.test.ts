import { describe, expect, it } from "bun:test";
import type { FieldId } from "workflow-engine/schema";
import type { DraftField } from "../src/areas/studio/draft/fields";
import { isDraftViewField, type DraftViewEntry } from "../src/areas/studio/draft/view-layout";
import {
  draftParentGroupKeyById,
  insertGroupedField,
  nudgeViewField,
  removeViewEntry,
  viewTree,
} from "../src/areas/studio/draft/view-tree";

/** The form editor's canvas interaction, the nested half: which entries the
 * canvas draws inside a group's own card, and the array operations scoped by
 * that nesting. `studio-view-layout.test.ts` covers the flat operations this
 * module builds on; this suite follows its shape. */

const id = (s: string) => s as FieldId;

/** A minimal `type: "group"` catalog field: the type-and-key pair
 * `view-tree.ts`'s own `isGroupCard` reads, plus whatever the fixture nests
 * under it. An empty `key` is a deliberate fixture, not an omission --
 * checkbox 4.4's case. */
const group = (fieldId: string, key: string, fields: DraftField[] = []): DraftField => ({
  id: id(fieldId),
  key,
  label: { en: key },
  type: "group",
  fields,
});

const leaf = (fieldId: string, key: string): DraftField => ({
  id: id(fieldId),
  key,
  label: { en: key },
  type: "string",
});

const ref = (fieldId: string, groupKey?: string): DraftViewEntry =>
  groupKey === undefined ? { ref: id(fieldId) } : { ref: id(fieldId), group: groupKey };

const note = (text: string, groupKey?: string): DraftViewEntry =>
  groupKey === undefined ? { kind: "note", text: { en: text } } : { kind: "note", text: { en: text }, group: groupKey };

/** Field entries read back by their own ref; a note reads back as its text,
 * since it names no catalog field. */
const refs = (list: DraftViewEntry[]): string[] =>
  list.map((r) => (isDraftViewField(r) ? String(r.ref) : `note:${(r as { text?: { en?: string } }).text?.en}`));

describe("viewTree derives the canvas's nested read of a step's view", () => {
  it("keeps array order for interleaved roots, attaching a group's scattered members to its own card", () => {
    const catalog = [group("group_g", "g", [leaf("field_x", "x"), leaf("field_y", "y")])];
    const rows = [
      ref("group_g"), // 0: the group's own card
      ref("root1"), // 1: an unrelated root sitting between the card and a member
      ref("field_x", "g"), // 2: member
      ref("root2"), // 3: another interleaving root
      ref("field_y", "g"), // 4: member
    ];
    const roots = viewTree(rows, catalog);
    expect(roots.map((n) => n.index)).toEqual([0, 1, 3]);
    expect(roots[0]!.members?.map((n) => n.index)).toEqual([2, 4]);
  });

  it("nests a group inside another group, each with its own members", () => {
    const catalog = [group("group_outer", "outer", [group("group_inner", "inner", [leaf("field_z", "z")])])];
    const rows = [ref("group_outer"), ref("group_inner", "outer"), ref("field_z", "inner")];
    const roots = viewTree(rows, catalog);
    expect(roots.map((n) => n.index)).toEqual([0]);
    const outer = roots[0]!;
    expect(outer.members?.map((n) => n.index)).toEqual([1]);
    const inner = outer.members![0]!;
    expect(inner.members?.map((n) => n.index)).toEqual([2]);
  });

  it("gives a group with no members an empty members array, not a leaf", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("group_g")];
    const roots = viewTree(rows, catalog);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.members).toEqual([]);
  });

  it("draws an entry at the root when its group names a card the view does not carry", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("field_x", "g")]; // no row references group_g
    const roots = viewTree(rows, catalog);
    expect(roots.map((n) => n.index)).toEqual([0]);
    expect(roots[0]!.members).toBeUndefined();
  });

  it("draws an entry at the root when its group names no group field at all", () => {
    const rows = [ref("field_x", "nonexistent")];
    const roots = viewTree(rows, []);
    expect(roots.map((n) => n.index)).toEqual([0]);
  });

  it("draws a field under a key-less group at the root, and draws no card for the key-less group", () => {
    const catalog = [group("group_g", "", [leaf("field_x", "x")])];
    // The member's own entry carries no `group`: an empty catalog key can
    // never be a view entry's `group` (authoring-invariants.md: "An empty
    // `group` reads as no group").
    const rows = [ref("group_g"), ref("field_x")];
    const roots = viewTree(rows, catalog);
    expect(roots.map((n) => n.index)).toEqual([0, 1]);
    // group_g's own card draws no fieldset: its key is empty, so it is not
    // a group node at all, `members` included.
    expect(roots[0]!.members).toBeUndefined();
  });

  it("takes a note's position from the same array as any field entry", () => {
    const rows = [ref("a"), note("hi"), ref("b")];
    const roots = viewTree(rows, []);
    expect(roots.map((n) => n.index)).toEqual([0, 1, 2]);
  });

  it("draws a note inside the group its own `group` names, beside the field members", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("group_g"), note("hi", "g")];
    const roots = viewTree(rows, catalog);
    expect(roots.map((n) => n.index)).toEqual([0]);
    expect(roots[0]!.members?.map((n) => n.index)).toEqual([1]);
  });
});

describe("nudgeViewField moves an entry among its own siblings, scoped by its group", () => {
  it("moves up exactly as dragging one position up would, with no groups involved", () => {
    const rows = [ref("a"), ref("b"), ref("c")];
    expect(refs(nudgeViewField(rows, 2, -1, []))).toEqual(["a", "c", "b"]);
  });

  it("moves down exactly as dragging one position down would, with no groups involved", () => {
    const rows = [ref("a"), ref("b"), ref("c")];
    expect(refs(nudgeViewField(rows, 0, 1, []))).toEqual(["b", "a", "c"]);
  });

  it("is a no-op at either end, with no groups involved", () => {
    const rows = [ref("a"), ref("b")];
    expect(nudgeViewField(rows, 0, -1, [])).toBe(rows);
    expect(nudgeViewField(rows, 1, 1, [])).toBe(rows);
  });

  it("a member's move-up is unavailable on its group's first entry", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("group_g"), ref("x", "g"), ref("y", "g")];
    expect(nudgeViewField(rows, 1, -1, catalog)).toBe(rows);
  });

  it("a member's move-down is unavailable on its group's last entry", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("group_g"), ref("x", "g"), ref("y", "g")];
    expect(nudgeViewField(rows, 2, 1, catalog)).toBe(rows);
  });

  it("a member's move swaps it with its own sibling, leaving entries outside the group untouched", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("root1"), ref("group_g"), ref("x", "g"), ref("y", "g"), ref("root2")];
    const next = nudgeViewField(rows, 3, -1, catalog);
    expect(refs(next)).toEqual(["root1", "group_g", "y", "x", "root2"]);
  });

  it("a root entry's move-down steps over a whole group, every member included", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("root1"), ref("group_g"), ref("x", "g"), ref("y", "g"), ref("z", "g"), ref("root2")];
    const next = nudgeViewField(rows, 0, 1, catalog);
    expect(refs(next)).toEqual(["group_g", "x", "y", "z", "root1", "root2"]);
  });

  it("a root entry's move-up steps back over a whole group, landing above its first member", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("root1"), ref("group_g"), ref("x", "g"), ref("y", "g"), ref("root2")];
    const next = nudgeViewField(rows, 4, -1, catalog);
    expect(refs(next)).toEqual(["root1", "root2", "group_g", "x", "y"]);
  });

  it("a member's swap keeps the pair adjacent even when an unrelated entry sits between them in the array", () => {
    const catalog = [group("group_g", "g")];
    // "between" is not a member of group_g: it just happens to sit
    // physically between x and y in `rows`.
    const rows = [ref("group_g"), ref("x", "g"), ref("between"), ref("y", "g")];
    const next = nudgeViewField(rows, 3, -1, catalog);
    expect(refs(next)).toEqual(["group_g", "y", "x", "between"]);
  });

  it("a root's step-over skips exactly one sibling, not an unrelated entry physically interleaved inside that sibling's members", () => {
    const catalog = [group("group_g", "g")];
    // rootB is its own root sibling of rootA, not part of group_g, but it
    // physically sits between group_g's two members (x and y). A raw
    // footprint-max-index slot would sweep rootB along too, turning a
    // one-sibling step into two; the sibling-boundary slot must not.
    const rows = [ref("rootA"), ref("group_g"), ref("x", "g"), ref("rootB"), ref("y", "g"), ref("rootC")];
    const next = nudgeViewField(rows, 0, 1, catalog);
    // Root order after the move: group_g, rootA, rootB, rootC -- rootA
    // stepped past group_g alone. x and y stay group_g's members either way,
    // wherever they physically land.
    expect(refs(next)).toEqual(["group_g", "x", "rootA", "rootB", "y", "rootC"]);
    const roots = viewTree(next, catalog);
    expect(refs(roots.map((n) => n.entry))).toEqual(["group_g", "rootA", "rootB", "rootC"]);
    expect(refs(roots[0]!.members!.map((n) => n.entry))).toEqual(["x", "y"]);
  });
});

describe("removeViewEntry cascades from a group's own card to its members", () => {
  it("removes a group card and every entry naming its key, field and note members alike", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("root1"), ref("group_g"), ref("x", "g"), note("hi", "g"), ref("root2")];
    expect(refs(removeViewEntry(rows, 1, catalog))).toEqual(["root1", "root2"]);
  });

  it("leaves the group card standing when only one member is removed", () => {
    const catalog = [group("group_g", "g")];
    const rows = [ref("group_g"), ref("x", "g"), ref("y", "g")];
    expect(refs(removeViewEntry(rows, 1, catalog))).toEqual(["group_g", "y"]);
  });

  it("removes only itself for a plain field", () => {
    const rows = [ref("a"), ref("b")];
    expect(refs(removeViewEntry(rows, 0, []))).toEqual(["b"]);
  });

  it("removing an OUTER group cascades through a nested group's own card and its own members", () => {
    const catalog = [group("group_outer", "outer", [group("group_inner", "inner", [leaf("field_z", "z")])])];
    const rows = [
      ref("root1"),
      ref("group_outer"),
      ref("group_inner", "outer"),
      ref("field_z", "inner"),
      ref("root2"),
    ];
    // A single-level filter on `.group !== "outer"` would leave field_z
    // behind (its own `.group` is "inner", not "outer") -- exactly the
    // "names a group the view no longer carries" state this cascade exists
    // to prevent.
    expect(refs(removeViewEntry(rows, 1, catalog))).toEqual(["root1", "root2"]);
  });

  it("cascades nothing for a key-less group's own entry: it draws no card, so it is a plain leaf", () => {
    const catalog = [group("group_g", "")];
    const rows = [ref("group_g"), ref("x")];
    expect(refs(removeViewEntry(rows, 0, catalog))).toEqual(["x"]);
  });

  it("is a no-op out of range", () => {
    const rows = [ref("a")];
    expect(removeViewEntry(rows, 5, [])).toBe(rows);
  });
});

describe("insertGroupedField places a catalog field honoring its catalog parent", () => {
  it("places a top-level field at the slot, carrying no group", () => {
    const catalog = [leaf("field_a", "a")];
    expect(insertGroupedField([], id("field_a"), 0, catalog)).toEqual([{ ref: id("field_a") }]);
  });

  it("sets the field's group and places it among the members when the group's card is already on the view", () => {
    const catalog = [group("group_g", "g", [leaf("field_x", "x")])];
    const rows = [ref("group_g")];
    const next = insertGroupedField(rows, id("field_x"), 1, catalog);
    expect(next).toEqual([{ ref: id("group_g") }, { ref: id("field_x"), group: "g" }]);
  });

  it("places the group's own card too when it is absent from the view, in one change", () => {
    const catalog = [group("group_g", "g", [leaf("field_x", "x")])];
    const rows = [ref("root1")];
    const next = insertGroupedField(rows, id("field_x"), 1, catalog);
    expect(next).toEqual([{ ref: id("root1") }, { ref: id("group_g") }, { ref: id("field_x"), group: "g" }]);
  });

  it("places a field under a key-less group at the top level, carrying no group", () => {
    const catalog = [group("group_g", "", [leaf("field_x", "x")])];
    expect(insertGroupedField([], id("field_x"), 0, catalog)).toEqual([{ ref: id("field_x") }]);
  });

  it("refuses to add a field the view already references", () => {
    const catalog = [leaf("field_a", "a")];
    const rows = [ref("field_a")];
    expect(insertGroupedField(rows, id("field_a"), 0, catalog)).toBe(rows);
  });

  it("a drop on a member's own edge lands at that slot among the members", () => {
    const catalog = [group("group_g", "g", [leaf("field_x", "x"), leaf("field_y", "y")])];
    // Drop landing on member x's trailing edge (slot 2): field_y must land
    // right there, between x and whatever follows, not after the group's
    // last member.
    const rows = [ref("group_g"), ref("x", "g"), ref("tail")];
    const next = insertGroupedField(rows, id("field_y"), 2, catalog);
    expect(refs(next)).toEqual(["group_g", "x", "field_y", "tail"]);
  });

  it("every other drop lands after the group's last member, ignoring the raw slot named", () => {
    const catalog = [group("group_g", "g", [leaf("field_x", "x"), leaf("field_y", "y")])];
    // Slot 0 names the very front of the array -- nowhere near any member's
    // own edge -- so field_y must still land after x, the group's only
    // (and therefore last) member.
    const rows = [ref("group_g"), ref("x", "g")];
    const next = insertGroupedField(rows, id("field_y"), 0, catalog);
    expect(refs(next)).toEqual(["group_g", "x", "field_y"]);
  });

  it("places a field two levels deep, inserting its whole missing ancestor chain outermost first", () => {
    const catalog = [group("group_outer", "outer", [group("group_inner", "inner", [leaf("field_z", "z")])])];
    const rows = [ref("root1")];
    const next = insertGroupedField(rows, id("field_z"), 1, catalog);
    expect(next).toEqual([
      { ref: id("root1") },
      { ref: id("group_outer") },
      { ref: id("group_inner"), group: "outer" },
      { ref: id("field_z"), group: "inner" },
    ]);
  });

  it("places only the missing part of a deeper chain when an outer ancestor is already on the view", () => {
    const catalog = [group("group_outer", "outer", [group("group_inner", "inner", [leaf("field_z", "z")])])];
    const rows = [ref("group_outer")];
    const next = insertGroupedField(rows, id("field_z"), 1, catalog);
    expect(next).toEqual([
      { ref: id("group_outer") },
      { ref: id("group_inner"), group: "outer" },
      { ref: id("field_z"), group: "inner" },
    ]);
  });
});

describe("draftParentGroupKeyById maps a field id to its parent group's key, draft-shaped", () => {
  it("maps a group's direct child to the group's own key", () => {
    const catalog = [group("group_g", "g", [leaf("field_x", "x")])];
    expect(draftParentGroupKeyById(catalog).get(id("field_x"))).toBe("g");
  });

  it("holds no entry for a top-level field", () => {
    const catalog = [leaf("field_a", "a")];
    expect(draftParentGroupKeyById(catalog).has(id("field_a"))).toBe(false);
  });

  it("maps a nested group's own child to the OUTER group's key, not its own", () => {
    const catalog = [group("group_outer", "outer", [group("group_inner", "inner", [leaf("field_z", "z")])])];
    const map = draftParentGroupKeyById(catalog);
    expect(map.get(id("group_inner"))).toBe("outer");
    expect(map.get(id("field_z"))).toBe("inner");
  });

  it("skips a field whose id is still undefined mid-edit", () => {
    const catalog: DraftField[] = [group("group_g", "g", [{ key: "x", label: { en: "x" }, type: "string" }])];
    expect([...draftParentGroupKeyById(catalog).keys()]).toEqual([]);
  });

  it("maps nothing under a group whose key is still empty", () => {
    const catalog = [group("group_g", "", [leaf("field_x", "x")])];
    expect(draftParentGroupKeyById(catalog).has(id("field_x"))).toBe(false);
  });

  it("does not treat a non-group parent carrying leftover fields as a group", () => {
    // changeKind rewrote group_g's type to "string" but left its `fields` in
    // place (EntityTabs.tsx ~474: a group turned into a Text field keeps its
    // children).
    const changedKind: DraftField = {
      id: id("group_g"),
      key: "g",
      label: { en: "g" },
      type: "string",
      fields: [leaf("field_x", "x")],
    };
    expect(draftParentGroupKeyById([changedKind]).has(id("field_x"))).toBe(false);
  });
});
