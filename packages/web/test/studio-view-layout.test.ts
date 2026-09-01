import { describe, expect, it } from "bun:test";
import { authoredProcessBody, type FieldId } from "workflow-engine/schema";
import {
  clampSpan,
  dropSlot,
  insertViewField,
  insertViewNote,
  isDraftViewField,
  moveViewField,
  nudgeViewField,
  reorderIndex,
  unplacedRefs,
  type DraftViewEntry,
  type DraftViewField,
} from "../src/areas/studio/draft/view-layout";

/** The form editor's canvas interaction, as pure functions. `studio-canvas`
 * requires canvas interaction logic to live outside rendering and be tested
 * there, the same shape `studio-canvas-layout.test.ts` follows. */

/** These functions are typed on the branded `FieldId`, so the short readable
 * ids below are branded rather than loosened: nothing under test inspects an
 * id's text, and a `string` signature would drop the brand the contract makes
 * the sole reference anchor. */
const id = (s: string) => s as FieldId;
const rows = (...refs: string[]): DraftViewField[] => refs.map((ref) => ({ ref: id(ref) }));
const refs = (list: DraftViewField[]): string[] => list.map((r) => String(r.ref));

describe("dropSlot maps a card edge to an insertion index", () => {
  it("names the card's own index on its leading edge", () => {
    expect(dropSlot(0, "before")).toBe(0);
    expect(dropSlot(2, "before")).toBe(2);
  });

  it("names the next index on its trailing edge", () => {
    expect(dropSlot(0, "after")).toBe(1);
    expect(dropSlot(2, "after")).toBe(3);
  });

  it("gives the same slot for both halves of a span-2 card", () => {
    // A span-2 card owns its whole grid row, so there is no pixel column that
    // splits it. The side decides, and only the side.
    expect(dropSlot(1, "before")).toBe(1);
    expect(dropSlot(1, "after")).toBe(2);
  });
});

describe("reorderIndex accounts for the moving card leaving the array", () => {
  it("shifts a slot below the card's own position down by one", () => {
    expect(reorderIndex(0, 3)).toBe(2);
    expect(reorderIndex(1, 4)).toBe(3);
  });

  it("leaves a slot above the card's position alone", () => {
    expect(reorderIndex(3, 1)).toBe(1);
    expect(reorderIndex(3, 0)).toBe(0);
  });

  it("reports a no-op for a drop on either of the card's own edges", () => {
    expect(reorderIndex(2, 2)).toBe(2);
    expect(reorderIndex(2, 3)).toBe(2);
  });
});

describe("moveViewField splices the view array to the drop position", () => {
  it("moves a card forward", () => {
    expect(refs(moveViewField(rows("a", "b", "c", "d"), 0, 3))).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a card backward", () => {
    expect(refs(moveViewField(rows("a", "b", "c", "d"), 3, 1))).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a card to the end", () => {
    expect(refs(moveViewField(rows("a", "b", "c"), 0, 3))).toEqual(["b", "c", "a"]);
  });

  it("returns the same array for a drop on the card's own edge", () => {
    const start = rows("a", "b", "c");
    expect(moveViewField(start, 1, 1)).toBe(start);
    expect(moveViewField(start, 1, 2)).toBe(start);
  });

  it("ignores an out-of-range source", () => {
    const start = rows("a", "b");
    expect(moveViewField(start, 5, 0)).toBe(start);
  });

  it("drops beside a span-2 card the same way it drops beside any other", () => {
    const start: DraftViewField[] = [{ ref: id("a") }, { ref: id("wide"), span: 2 }, { ref: id("c") }];
    // Dropping "a" after the wide card: slot 2, which is index 1 once "a" goes.
    expect(refs(moveViewField(start, 0, dropSlot(1, "after")))).toEqual(["wide", "a", "c"]);
    // Dropping "c" before the wide card: slot 1, and "c" sits after it, so no shift.
    expect(refs(moveViewField(start, 2, dropSlot(1, "before")))).toEqual(["a", "c", "wide"]);
  });
});

describe("nudgeViewField is the keyboard move, producing the same array a drag does", () => {
  it("moves up exactly as dragging one position up would", () => {
    const start = rows("a", "b", "c");
    expect(refs(nudgeViewField(start, 2, -1))).toEqual(["a", "c", "b"]);
    expect(refs(nudgeViewField(start, 2, -1))).toEqual(refs(moveViewField(start, 2, dropSlot(1, "before"))));
  });

  it("moves down exactly as dragging one position down would", () => {
    const start = rows("a", "b", "c");
    expect(refs(nudgeViewField(start, 0, 1))).toEqual(["b", "a", "c"]);
    expect(refs(nudgeViewField(start, 0, 1))).toEqual(refs(moveViewField(start, 0, dropSlot(1, "after"))));
  });

  it("is a no-op at either end", () => {
    const start = rows("a", "b");
    expect(nudgeViewField(start, 0, -1)).toBe(start);
    expect(nudgeViewField(start, 1, 1)).toBe(start);
  });
});

describe("insertViewField places a palette field at the drop slot", () => {
  it("inserts at the slot", () => {
    expect(refs(insertViewField(rows("a", "c"), id("b"), 1))).toEqual(["a", "b", "c"]);
  });

  it("appends past the end", () => {
    expect(refs(insertViewField(rows("a"), id("b"), 9))).toEqual(["a", "b"]);
  });

  it("clamps a negative slot to the front", () => {
    expect(refs(insertViewField(rows("a"), id("b"), -3))).toEqual(["b", "a"]);
  });

  it("refuses to add a field the view already references", () => {
    const start = rows("a", "b");
    expect(insertViewField(start, id("a"), 0)).toBe(start);
  });

  it("dedups against field entries alone: a note beside a matching-looking entry does not block the insert", () => {
    const start: DraftViewEntry[] = [{ kind: "note", text: { en: "hi" } }, { ref: id("a") }];
    expect(refs(insertViewField(start, id("b"), 2).filter(isDraftViewField))).toEqual(["a", "b"]);
  });
});

describe("insertViewNote places a note at the drop slot, with no dedup", () => {
  it("inserts at the slot", () => {
    const start: DraftViewEntry[] = [{ ref: id("a") }, { ref: id("c") }];
    const next = insertViewNote(start, { en: "Note" }, 1);
    expect(next).toEqual([{ ref: id("a") }, { kind: "note", text: { en: "Note" } }, { ref: id("c") }]);
  });

  it("appends past the end", () => {
    const next = insertViewNote(rows("a"), { en: "Note" }, 9);
    expect(next[1]).toEqual({ kind: "note", text: { en: "Note" } });
  });

  it("places a second note beside the first: a note names no catalog field, so nothing dedups it", () => {
    const first = insertViewNote([], { en: "One" }, 0);
    const both = insertViewNote(first, { en: "Two" }, 1);
    expect(both).toEqual([
      { kind: "note", text: { en: "One" } },
      { kind: "note", text: { en: "Two" } },
    ]);
  });

  it("leaves authoredProcessBody.safeParse succeeding: the seeded non-empty base-locale text satisfies the note's own invariant", () => {
    const body = {
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [{ id: "field_a", key: "a", label: { en: "A" }, type: "string" }],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            id: "step_a",
            key: "a",
            label: { en: "A" },
            type: "task",
            terminal: true,
            view: { fields: insertViewNote([{ ref: id("field_a") }], { en: "New note" }, 1) },
          },
        ],
      },
    };
    expect(authoredProcessBody.safeParse(body).success).toBe(true);
  });
});

describe("unplacedRefs is the palette's content", () => {
  it("lists catalog fields not on the view, in catalog order", () => {
    expect(unplacedRefs([id("a"), id("b"), id("c")], rows("b"))).toEqual([id("a"), id("c")]);
  });

  it("empties once every field is placed", () => {
    expect(unplacedRefs([id("a"), id("b")], rows("b", "a"))).toEqual([]);
  });

  it("a note marks no catalog field as used: the palette still offers every field the notes sit beside", () => {
    const view: DraftViewEntry[] = [{ kind: "note", text: { en: "hi" } }, { ref: id("b") }];
    expect(unplacedRefs([id("a"), id("b"), id("c")], view)).toEqual([id("a"), id("c")]);
  });
});

describe("clampSpan never lets a field exceed its grid", () => {
  it("reads an absent span as 1", () => {
    expect(clampSpan(undefined, 2)).toBe(1);
  });

  it("passes a span that fits", () => {
    expect(clampSpan(2, 2)).toBe(2);
  });

  it("clamps a span-2 field on a one-column form", () => {
    expect(clampSpan(2, 1)).toBe(1);
  });
});
