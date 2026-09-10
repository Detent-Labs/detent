import { describe, expect, it } from "bun:test";
import type { FieldId } from "workflow-engine/schema";
import type { Draft } from "../src/areas/studio/draft/types";
import type { DraftViewEntry } from "../src/areas/studio/draft/view-layout";
import { syncViewGroupsOnFieldMove, syncViewGroupsOnGroupRename } from "../src/areas/studio/draft/view-group-sync";

/** The catalog stays level with the views: the two rewrites a field-catalog
 * move and a group-key rename each owe every view entry naming the field or
 * the group. Follows `studio-view-tree.test.ts`'s fixture shape, but these
 * functions read the whole `Draft` -- every step's `workflow.steps[].view`
 * -- rather than one step's `rows` array. */

const id = (s: string) => s as FieldId;

const ref = (r: string, groupKey?: string): DraftViewEntry =>
  groupKey === undefined ? { ref: id(r) } : { ref: id(r), group: groupKey };

const note = (text: string, groupKey?: string): DraftViewEntry =>
  groupKey === undefined ? { kind: "note", text: { en: text } } : { kind: "note", text: { en: text }, group: groupKey };

/** A three-step draft, so a test can tell "every step" apart from "the first
 * one". Each step's own `view.fields` is supplied independently. */
const draftOf = (...stepViews: DraftViewEntry[][]): Draft =>
  ({
    workflow: { steps: stepViews.map((fields) => ({ view: { fields } })) },
  }) as unknown as Draft;

const rowsOf = (draft: Draft): DraftViewEntry[][] => (draft.workflow?.steps ?? []).map((s) => s.view?.fields ?? []);

describe("syncViewGroupsOnFieldMove", () => {
  it("sets every entry naming the moved field to the destination group's key, across three steps", () => {
    const draft = draftOf([ref("x", "old")], [ref("x")], [ref("x", "old"), ref("y", "old")]);

    syncViewGroupsOnFieldMove(draft, "x", "new");

    const rows = rowsOf(draft);
    expect(rows[0]).toEqual([ref("x", "new")]);
    expect(rows[1]).toEqual([ref("x", "new")]);
    // The unrelated field "y" naming the same source group is left alone: a
    // move carries only the one field its own gesture named.
    expect(rows[2]).toEqual([ref("x", "new"), ref("y", "old")]);
  });

  it("removes the group key instead of writing it empty, on a move to the top level", () => {
    const draft = draftOf([ref("x", "g")], [ref("x", "g")], [ref("x", "g")]);

    syncViewGroupsOnFieldMove(draft, "x", undefined);

    for (const fields of rowsOf(draft)) {
      expect(fields).toEqual([ref("x")]);
      expect("group" in fields[0]!).toBe(false);
    }
  });

  it("leaves a note naming the source group alone: a move carries a field, and a note names none", () => {
    const draft = draftOf([ref("x", "g"), note("Heads up", "g")]);

    syncViewGroupsOnFieldMove(draft, "x", "new");

    const [fields] = rowsOf(draft);
    expect(fields).toEqual([ref("x", "new"), note("Heads up", "g")]);
  });

  it("touches no entry whose ref names a different field", () => {
    const draft = draftOf([ref("x", "g"), ref("other", "g")]);

    syncViewGroupsOnFieldMove(draft, "x", "new");

    const [fields] = rowsOf(draft);
    expect(fields).toEqual([ref("x", "new"), ref("other", "g")]);
  });
});

describe("syncViewGroupsOnGroupRename", () => {
  it("follows a rename through to every step, three of them", () => {
    const draft = draftOf([ref("a", "request")], [ref("b", "request"), ref("c")], [ref("d", "request")]);

    syncViewGroupsOnGroupRename(draft, "request", "order_request");

    const rows = rowsOf(draft);
    expect(rows[0]).toEqual([ref("a", "order_request")]);
    expect(rows[1]).toEqual([ref("b", "order_request"), ref("c")]);
    expect(rows[2]).toEqual([ref("d", "order_request")]);
  });

  it("carries a note naming the old key along with the rename", () => {
    const draft = draftOf([ref("a", "g"), note("About this group", "g")]);

    syncViewGroupsOnGroupRename(draft, "g", "renamed");

    const [fields] = rowsOf(draft);
    expect(fields).toEqual([ref("a", "renamed"), note("About this group", "renamed")]);
  });

  it("renames a nested group's entries the same way a top-level group's rename does", () => {
    // The function itself is nesting-agnostic -- it matches `.group` by
    // string alone -- which is exactly the point: a nested group's rename
    // reaches its entries through the identical call its top-level sibling
    // does, in `FieldCatalogPanel.tsx`'s two key inputs.
    const draft = draftOf([ref("outer_card", "outer"), ref("inner_card", "outer"), ref("z", "inner")]);

    syncViewGroupsOnGroupRename(draft, "inner", "inner_renamed");

    const [fields] = rowsOf(draft);
    expect(fields).toEqual([ref("outer_card", "outer"), ref("inner_card", "outer"), ref("z", "inner_renamed")]);
  });

  it("leaves another group's entries alone", () => {
    const draft = draftOf([ref("a", "request"), ref("b", "shipping")]);

    syncViewGroupsOnGroupRename(draft, "request", "order_request");

    const [fields] = rowsOf(draft);
    expect(fields).toEqual([ref("a", "order_request"), ref("b", "shipping")]);
  });
});
