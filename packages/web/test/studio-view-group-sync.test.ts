import { describe, expect, it } from "bun:test";
import type { FieldId } from "workflow-engine/schema";
import type { DraftField } from "../src/areas/studio/draft/fields";
import type { Draft } from "../src/areas/studio/draft/types";
import type { DraftViewEntry } from "../src/areas/studio/draft/view-layout";
import {
  moveFieldAndSyncViews,
  syncViewGroupsOnFieldMove,
  writeGroupKey,
  writeGroupLabel,
} from "../src/areas/studio/draft/view-group-sync";

/** The catalog stays level with the views: the writes a field-catalog move,
 * a group-key edit and a group-label edit each owe every view entry naming
 * the field or the group. Follows `studio-view-tree.test.ts`'s fixture shape,
 * but these functions read the whole `Draft` -- the catalog plus every
 * step's `workflow.steps[].view` -- rather than one step's `rows` array. */

const id = (s: string) => s as FieldId;

const group = (fieldId: string, key: string, fields: DraftField[] = [], label = key): DraftField => ({
  id: id(fieldId),
  key,
  label: { en: label },
  type: "group",
  fields,
});

const leaf = (fieldId: string, key: string): DraftField => ({
  id: id(fieldId),
  key,
  label: { en: key },
  type: "string",
});

const ref = (r: string, groupKey?: string): DraftViewEntry =>
  groupKey === undefined ? { ref: id(r) } : { ref: id(r), group: groupKey };

const note = (text: string, groupKey?: string): DraftViewEntry =>
  groupKey === undefined ? { kind: "note", text: { en: text } } : { kind: "note", text: { en: text }, group: groupKey };

/** A draft with a catalog and one view per step, so a test can tell "every
 * step" apart from "the first one". */
const draftWith = (fields: DraftField[], ...stepViews: DraftViewEntry[][]): Draft =>
  ({
    fields,
    workflow: { steps: stepViews.map((view) => ({ view: { fields: view } })) },
  }) as unknown as Draft;

const draftOf = (...stepViews: DraftViewEntry[][]): Draft => draftWith([], ...stepViews);

const rowsOf = (draft: Draft): DraftViewEntry[][] => (draft.workflow?.steps ?? []).map((s) => s.view?.fields ?? []);

const catalogField = (draft: Draft, fieldId: string): DraftField | undefined => {
  const walk = (fs: DraftField[]): DraftField | undefined => {
    for (const f of fs) {
      if (f.id === fieldId) return f;
      const inner = walk(f.fields ?? []);
      if (inner) return inner;
    }
    return undefined;
  };
  return walk(draft.fields ?? []);
};

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

  it("treats a destination group's still-empty key the same as no destination: removes the group key rather than writing it empty", () => {
    // A key-less group draws no card at all (`view-tree.ts::isGroupCard`'s
    // `!!field.key` test), so it can never be a field's named destination
    // even where the caller's own lookup answers `""` rather than
    // `undefined` for it (a `DraftField.key` still mid-edit).
    const draft = draftOf([ref("x", "g")]);

    syncViewGroupsOnFieldMove(draft, "x", "");

    const [fields] = rowsOf(draft);
    expect(fields).toEqual([ref("x")]);
    expect("group" in fields[0]!).toBe(false);
  });
});

describe("moveFieldAndSyncViews brings a missing group card along", () => {
  it("places the destination group's card before the moved field's entry, on a view lacking it", () => {
    const draft = draftWith(
      [leaf("a", "a"), leaf("x", "x"), group("g", "g", [leaf("y", "y")])],
      [ref("a"), ref("x")],
      [ref("g"), ref("y", "g"), ref("x")],
    );

    moveFieldAndSyncViews(draft, "x", "g");

    const rows = rowsOf(draft);
    expect(rows[0]).toEqual([ref("a"), ref("g"), ref("x", "g")]);
    expect(rows[1]).toEqual([ref("g"), ref("y", "g"), ref("x", "g")]);
    expect(catalogField(draft, "g")!.fields!.map((f) => f.id as string)).toEqual(["y", "x"]);
  });

  it("places the whole missing chain for a nested destination, outermost first, each card naming its own parent", () => {
    const draft = draftWith(
      [leaf("x", "x"), group("outer", "outer", [group("inner", "inner", [leaf("z", "z")])])],
      [ref("x")],
    );

    moveFieldAndSyncViews(draft, "x", "inner");

    expect(rowsOf(draft)[0]).toEqual([ref("outer"), ref("inner", "outer"), ref("x", "inner")]);
  });

  it("places only the missing part of the chain when an outer card is already on the view", () => {
    const draft = draftWith(
      [leaf("x", "x"), group("outer", "outer", [group("inner", "inner", [leaf("z", "z")])])],
      [ref("outer"), ref("x")],
    );

    moveFieldAndSyncViews(draft, "x", "inner");

    expect(rowsOf(draft)[0]).toEqual([ref("outer"), ref("inner", "outer"), ref("x", "inner")]);
  });

  it("gives a view already carrying the destination card no second one", () => {
    const draft = draftWith([leaf("x", "x"), group("g", "g")], [ref("g"), ref("x")]);

    moveFieldAndSyncViews(draft, "x", "g");

    expect(rowsOf(draft)[0]).toEqual([ref("g"), ref("x", "g")]);
  });

  it("brings the destination card ahead of a moved group's own card, and the moved group's members stay after it", () => {
    const draft = draftWith(
      [group("h", "h", [leaf("k", "k")]), group("g", "g", [leaf("y", "y")])],
      [ref("g"), ref("y", "g")],
    );

    moveFieldAndSyncViews(draft, "g", "h");

    expect(rowsOf(draft)[0]).toEqual([ref("h"), ref("g", "h"), ref("y", "g")]);
  });

  it("places nothing on a move to the top level", () => {
    const draft = draftWith([group("g", "g", [leaf("x", "x")])], [ref("g"), ref("x", "g")], [ref("x", "g")]);

    moveFieldAndSyncViews(draft, "x", undefined);

    const rows = rowsOf(draft);
    expect(rows[0]).toEqual([ref("g"), ref("x")]);
    expect(rows[1]).toEqual([ref("x")]);
  });

  it("places no card on a view that does not carry the moved field", () => {
    const draft = draftWith([leaf("x", "x"), group("g", "g")], [ref("other")]);

    moveFieldAndSyncViews(draft, "x", "g");

    expect(rowsOf(draft)[0]).toEqual([ref("other")]);
  });
});

describe("writeGroupKey", () => {
  it("follows a rename through to every step, three of them, and writes the catalog key", () => {
    const draft = draftWith(
      [group("req", "request", [leaf("a", "a"), leaf("b", "b"), leaf("d", "d")]), leaf("c", "c")],
      [ref("a", "request")],
      [ref("b", "request"), ref("c")],
      [ref("d", "request")],
    );

    writeGroupKey(draft, "req", "order_request");

    const rows = rowsOf(draft);
    expect(rows[0]).toEqual([ref("a", "order_request")]);
    expect(rows[1]).toEqual([ref("b", "order_request"), ref("c")]);
    expect(rows[2]).toEqual([ref("d", "order_request")]);
    expect(catalogField(draft, "req")!.key).toBe("order_request");
  });

  it("carries a note naming the old key along with the rename", () => {
    const draft = draftWith([group("g", "g", [leaf("a", "a")])], [ref("a", "g"), note("About this group", "g")]);

    writeGroupKey(draft, "g", "renamed");

    expect(rowsOf(draft)[0]).toEqual([ref("a", "renamed"), note("About this group", "renamed")]);
  });

  it("renames a nested group's entries the same way a top-level group's rename does", () => {
    const draft = draftWith(
      [group("outer", "outer", [group("inner", "inner", [leaf("z", "z")])])],
      [ref("outer"), ref("inner", "outer"), ref("z", "inner")],
    );

    writeGroupKey(draft, "inner", "inner_renamed");

    expect(rowsOf(draft)[0]).toEqual([ref("outer"), ref("inner", "outer"), ref("z", "inner_renamed")]);
  });

  it("leaves another group's entries alone", () => {
    const draft = draftWith(
      [group("req", "request", [leaf("a", "a")]), group("ship", "shipping", [leaf("b", "b")])],
      [ref("a", "request"), ref("b", "shipping"), note("Ship it", "shipping")],
    );

    writeGroupKey(draft, "req", "order_request");

    expect(rowsOf(draft)[0]).toEqual([ref("a", "order_request"), ref("b", "shipping"), note("Ship it", "shipping")]);
  });

  it("does not merge two groups when a key typed one keystroke at a time passes through the other group's key", () => {
    // Renaming `resolution` to `receipt_resolution` passes through
    // `receipt`, the real `receipt` group's own key. A match on the key
    // string would carry that group's entries along from then on.
    const draft = draftWith(
      [
        group("receipt", "receipt", [leaf("received_quantity", "received_quantity"), leaf("receipt_note", "receipt_note")]),
        group("resolution", "resolution", [leaf("discrepancy_note", "discrepancy_note")]),
      ],
      [
        ref("receipt"),
        ref("received_quantity", "receipt"),
        ref("receipt_note", "receipt"),
        note("Count every box", "receipt"),
        ref("resolution"),
        ref("discrepancy_note", "resolution"),
      ],
    );

    const typed = "receipt_resolution";
    for (let n = 1; n <= typed.length; n++) writeGroupKey(draft, "resolution", typed.slice(0, n));

    expect(rowsOf(draft)[0]).toEqual([
      ref("receipt"),
      ref("received_quantity", "receipt"),
      ref("receipt_note", "receipt"),
      note("Count every box", "receipt"),
      ref("resolution"),
      ref("discrepancy_note", "receipt_resolution"),
    ]);
  });

  it("keeps a note in its group when the key is cleared and typed again, and never writes an empty group", () => {
    const draft = draftWith([group("g", "g", [leaf("a", "a")])], [ref("g"), ref("a", "g"), note("Inside", "g")]);

    writeGroupKey(draft, "g", "");

    // The cleared key names nothing: the member's entry drops `group`, and
    // the note keeps the old key, so the checks rail flags it rather than
    // the form losing it.
    expect(rowsOf(draft)[0]).toEqual([ref("g"), ref("a"), note("Inside", "g")]);
    expect(rowsOf(draft)[0]!.some((e) => e.group === "")).toBe(false);

    writeGroupKey(draft, "g", "g");

    expect(rowsOf(draft)[0]).toEqual([ref("g"), ref("a", "g"), note("Inside", "g")]);
  });

  it("carries no note into a key another group already holds", () => {
    const draft = draftWith(
      [group("g", "g", [leaf("a", "a")]), group("h", "h", [leaf("b", "b")])],
      [note("In g", "g"), note("In h", "h")],
    );

    writeGroupKey(draft, "g", "h");

    expect(rowsOf(draft)[0]).toEqual([note("In g", "g"), note("In h", "h")]);
  });

  it("moves no note off a key two groups share", () => {
    const draft = draftWith(
      [group("g", "dup", [leaf("a", "a")]), group("h", "dup", [leaf("b", "b")])],
      [ref("a", "dup"), note("Which one?", "dup")],
    );

    writeGroupKey(draft, "g", "unique");

    expect(rowsOf(draft)[0]).toEqual([ref("a", "unique"), note("Which one?", "dup")]);
  });

  it("gives a group's first key to every entry naming one of its direct children, across three steps", () => {
    const draft = draftWith(
      [group("g", "", [leaf("child_a", "child_a"), leaf("child_b", "child_b")])],
      [ref("child_a")],
      [ref("child_b")],
      [ref("child_a"), ref("child_b")],
    );

    writeGroupKey(draft, "g", "newly_named");

    const rows = rowsOf(draft);
    expect(rows[0]).toEqual([ref("child_a", "newly_named")]);
    expect(rows[1]).toEqual([ref("child_b", "newly_named")]);
    expect(rows[2]).toEqual([ref("child_a", "newly_named"), ref("child_b", "newly_named")]);
  });

  it("leaves an entry naming a field outside the group's own children alone, on a first key", () => {
    const draft = draftWith([group("g", "", [leaf("child_a", "child_a")]), leaf("unrelated", "unrelated")], [ref("child_a"), ref("unrelated")]);

    writeGroupKey(draft, "g", "newly_named");

    expect(rowsOf(draft)[0]).toEqual([ref("child_a", "newly_named"), ref("unrelated")]);
  });

  it("moves no root note into a group gaining its first key", () => {
    const draft = draftWith([group("g", "", [leaf("child_a", "child_a")])], [ref("child_a"), note("About this section")]);

    writeGroupKey(draft, "g", "newly_named");

    expect(rowsOf(draft)[0]).toEqual([ref("child_a", "newly_named"), note("About this section")]);
  });
});

describe("writeGroupLabel", () => {
  const lineItemDraft = (key: string) =>
    draftWith(
      [group("li", key, [leaf("a", "a"), leaf("b", "b")], "Line Item")],
      [ref("li"), ref("a", key), note("Per line", key)],
      [ref("li"), ref("b", key)],
      [ref("a", key)],
    );

  it("renames a label-locked group's key and rewrites every view entry naming it, across steps", () => {
    const draft = lineItemDraft("line_item");

    writeGroupLabel(draft, "li", { en: "Line Items" }, "en");

    expect(catalogField(draft, "li")!.key).toBe("line_items");
    expect(catalogField(draft, "li")!.label).toEqual({ en: "Line Items" });
    const rows = rowsOf(draft);
    expect(rows[0]).toEqual([ref("li"), ref("a", "line_items"), note("Per line", "line_items")]);
    expect(rows[1]).toEqual([ref("li"), ref("b", "line_items")]);
    expect(rows[2]).toEqual([ref("a", "line_items")]);
  });

  it("keeps the group's key when the new label derives to nothing", () => {
    const draft = lineItemDraft("line_item");

    writeGroupLabel(draft, "li", { en: "!!!" }, "en");

    expect(catalogField(draft, "li")!.key).toBe("line_item");
    expect(catalogField(draft, "li")!.label).toEqual({ en: "!!!" });
    expect(rowsOf(draft)[0]).toEqual([ref("li"), ref("a", "line_item"), note("Per line", "line_item")]);
  });

  it("leaves a hand-edited key alone", () => {
    const draft = lineItemDraft("custom");

    writeGroupLabel(draft, "li", { en: "Line Items" }, "en");

    expect(catalogField(draft, "li")!.key).toBe("custom");
    expect(rowsOf(draft)[1]).toEqual([ref("li"), ref("b", "custom")]);
  });
});
