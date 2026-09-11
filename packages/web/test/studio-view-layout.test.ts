import { describe, expect, it } from "bun:test";
import { authoredProcessBody, type FieldId } from "workflow-engine/schema";
import {
  addViewTab,
  clampSpan,
  drawnNeighbour,
  drawnRows,
  dropSlot,
  fillMissingTabs,
  insertViewField,
  insertViewNote,
  isDraftViewField,
  moveViewField,
  moveViewTab,
  nudgeViewField,
  owningTab,
  removeViewTab,
  renameViewTab,
  reorderIndex,
  setEntryGroup,
  shownTab,
  unplacedRefs,
  type DraftView,
  type DraftViewEntry,
  type DraftViewField,
  type DraftViewTab,
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
const tab = (key: string, label = key): DraftViewTab => ({ key, label: { en: label } });

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

describe("addViewTab sweeps the first tab, and mints a fresh key each call", () => {
  it("moves every existing root entry onto the first tab", () => {
    const view: DraftView = { fields: rows("a", "b", "c", "d") };
    const next = addViewTab(view, { en: "Details" });
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs![0]!.label).toEqual({ en: "Details" });
    const key = next.tabs![0]!.key;
    expect(key).toBeTruthy();
    expect(next.fields!.every((e) => e.tab === key)).toBe(true);
  });

  it("sweeps a note entry too: it is a root entry like any other", () => {
    const view: DraftView = { fields: [{ ref: id("a") }, { kind: "note", text: { en: "hi" } }] };
    const next = addViewTab(view, { en: "Details" });
    const key = next.tabs![0]!.key;
    expect(next.fields!.every((e) => e.tab === key)).toBe(true);
  });

  it("skips a grouped entry: its group holds it, and the group's own entry names the tab", () => {
    const view: DraftView = {
      fields: [
        { ref: id("group") },
        { ref: id("a"), group: "group" },
        { kind: "note", text: { en: "hi" }, group: "group" },
      ],
    };
    const next = addViewTab(view, { en: "Details" });
    const key = next.tabs![0]!.key;
    expect(next.fields![0]!.tab).toBe(key);
    expect(next.fields![1]!.tab).toBeUndefined();
    expect(next.fields![2]!.tab).toBeUndefined();
  });

  it("mints a distinct key each time it is called", () => {
    const first = addViewTab({ fields: [] }, { en: "A" });
    const both = addViewTab(first, { en: "B" });
    expect(both.tabs).toHaveLength(2);
    expect(both.tabs![0]!.key).not.toBe(both.tabs![1]!.key);
  });

  it("sweeps nothing when adding a second tab: every existing root entry already names one", () => {
    const first = addViewTab({ fields: rows("a", "b") }, { en: "First" });
    const firstKey = first.tabs![0]!.key;
    const second = addViewTab(first, { en: "Second" });
    expect(second.tabs).toHaveLength(2);
    expect(second.fields!.every((e) => e.tab === firstKey)).toBe(true);
  });
});

describe("removeViewTab merges into a neighbour, or tears down the last tab", () => {
  it("hands a middle tab's entries to the tab before it, in their existing order", () => {
    const view: DraftView = {
      tabs: [tab("t1"), tab("t2"), tab("t3")],
      fields: [
        { ref: id("a"), tab: "t1" },
        { ref: id("b"), tab: "t2" },
        { ref: id("c"), tab: "t2" },
        { ref: id("d"), tab: "t3" },
      ],
    };
    const next = removeViewTab(view, "t2");
    expect(next.tabs!.map((t) => t.key)).toEqual(["t1", "t3"]);
    expect(next.fields!.map((e) => e.tab)).toEqual(["t1", "t1", "t1", "t3"]);
  });

  it("hands the first tab's entries to the tab after it", () => {
    const view: DraftView = {
      tabs: [tab("t1"), tab("t2")],
      fields: [
        { ref: id("a"), tab: "t1" },
        { ref: id("b"), tab: "t2" },
      ],
    };
    const next = removeViewTab(view, "t1");
    expect(next.tabs!.map((t) => t.key)).toEqual(["t2"]);
    expect(next.fields!.map((e) => e.tab)).toEqual(["t2", "t2"]);
  });

  it("tears down the last remaining tab: no entry keeps a tab, and tabs drops from the view", () => {
    const view: DraftView = {
      tabs: [tab("t1")],
      fields: [{ ref: id("a"), tab: "t1" }, { kind: "note", text: { en: "hi" }, tab: "t1" }],
    };
    const next = removeViewTab(view, "t1");
    expect(next.tabs).toBeUndefined();
    expect(next.fields!.every((e) => e.tab === undefined)).toBe(true);
    expect("tab" in next.fields![0]!).toBe(false);
  });

  it("deletes no entry: the removed tab's own field count survives, just retargeted", () => {
    const view: DraftView = {
      tabs: [tab("t1"), tab("t2")],
      fields: [
        { ref: id("a"), tab: "t1" },
        { ref: id("b"), tab: "t2" },
      ],
    };
    const next = removeViewTab(view, "t1");
    expect(next.fields).toHaveLength(2);
  });

  it("is a no-op for a key naming no tab", () => {
    const view: DraftView = { tabs: [tab("t1")], fields: [{ ref: id("a"), tab: "t1" }] };
    expect(removeViewTab(view, "missing")).toBe(view);
  });
});

describe("moveViewTab reorders the strip alone, the tab-strip's own moveViewField", () => {
  it("moves a tab forward, the same mechanics moveViewField's own test covers", () => {
    const tabs: DraftViewTab[] = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(moveViewTab(tabs, 0, 3).map((t) => t.key)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a tab backward", () => {
    const tabs: DraftViewTab[] = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(moveViewTab(tabs, 3, 1).map((t) => t.key)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns the same array for a drop on the tab's own edge", () => {
    const tabs: DraftViewTab[] = [tab("a"), tab("b")];
    expect(moveViewTab(tabs, 0, 0)).toBe(tabs);
    expect(moveViewTab(tabs, 0, 1)).toBe(tabs);
  });
});

describe("renameViewTab writes the label alone — the key a helper never rewrites", () => {
  it("keeps the key unchanged, and every entry naming it still resolves", () => {
    const view: DraftView = {
      tabs: [tab("t1", "Before"), tab("t2", "Other")],
      fields: [
        { ref: id("a"), tab: "t1" },
        { ref: id("b"), tab: "t2" },
      ],
    };
    const next = renameViewTab(view, "t1", { en: "After" });

    const renamed = next.tabs!.find((t) => t.key === "t1")!;
    expect(renamed.key).toBe("t1");
    expect(renamed.label).toEqual({ en: "After" });

    // The definition contract: an authoring surface must not rewrite a tab's
    // key once an entry names it. Renaming leaves `fields` untouched by this
    // function, so the entry's own `tab` still names "t1" — and "t1" still
    // resolves, since the tab that renamed kept exactly that key.
    const namingEntry = next.fields!.filter(isDraftViewField).find((e) => e.ref === id("a"))!;
    expect(namingEntry.tab).toBe("t1");
    expect(next.tabs!.some((t) => t.key === namingEntry.tab)).toBe(true);
  });

  it("touches no other tab's label", () => {
    const view: DraftView = { tabs: [tab("t1", "A"), tab("t2", "B")] };
    const next = renameViewTab(view, "t1", { en: "Changed" });
    expect(next.tabs!.find((t) => t.key === "t2")!.label).toEqual({ en: "B" });
  });

  it("is a no-op for a key naming no tab", () => {
    const view: DraftView = { tabs: [tab("t1", "A")] };
    const next = renameViewTab(view, "missing", { en: "X" });
    expect(next.tabs).toEqual([tab("t1", "A")]);
  });
});

/** A view entry names its group by the group FIELD's catalog key, which the
 * screen resolves through the field catalog. These tests carry no catalog, so
 * an entry whose `ref` starts with "g" stands for a group field of that key —
 * the one fact `owningTab` and `drawnRows` read through `groupKeyOf`. */
const groupKeyOf = (entry: DraftViewEntry) =>
  isDraftViewField(entry) && String(entry.ref).startsWith("g") ? String(entry.ref) : undefined;

describe("shownTab derives the open tab rather than storing it", () => {
  const strip = [tab("t1"), tab("t2")];

  it("keeps the active tab while it still names one", () => {
    expect(shownTab(strip, "t2")).toBe("t2");
  });

  it("falls back to the first tab when the active one is gone", () => {
    // The state a removal leaves behind: no effect repairs it, this does.
    expect(shownTab(strip, "t9")).toBe("t1");
    expect(shownTab(strip, undefined)).toBe("t1");
  });

  it("answers undefined for a view declaring no tab", () => {
    expect(shownTab([], "t1")).toBeUndefined();
    expect(shownTab(undefined, undefined)).toBeUndefined();
  });

  it("skips a tab carrying no key yet: nothing can name it", () => {
    expect(shownTab([{ label: { en: "half-typed" } }, tab("t2")], undefined)).toBe("t2");
  });
});

describe("owningTab reads a member's tab off its group", () => {
  it("answers a root entry's own tab", () => {
    const entries: DraftViewEntry[] = [{ ref: id("a"), tab: "t1" }];
    expect(owningTab(entries[0]!, entries, groupKeyOf)).toBe("t1");
  });

  it("answers a member's group's tab, since a member carries none of its own", () => {
    const entries: DraftViewEntry[] = [{ ref: id("g1"), tab: "t2" }, { ref: id("a"), group: "g1" }];
    expect(owningTab(entries[1]!, entries, groupKeyOf)).toBe("t2");
  });

  it("walks up a group nested in a group", () => {
    const entries: DraftViewEntry[] = [
      { ref: id("g1"), tab: "t2" },
      { ref: id("g2"), group: "g1" },
      { kind: "note", text: { en: "hi" }, group: "g2" },
    ];
    expect(owningTab(entries[2]!, entries, groupKeyOf)).toBe("t2");
  });

  it("terminates on a cycle rather than hanging", () => {
    const entries: DraftViewEntry[] = [
      { ref: id("g1"), group: "g2" },
      { ref: id("g2"), group: "g1" },
    ];
    expect(owningTab(entries[0]!, entries, groupKeyOf)).toBeUndefined();
  });
});

describe("drawnRows filters the canvas to one tab", () => {
  const strip = [tab("t1"), tab("t2")];
  const entries: DraftViewEntry[] = [
    { ref: id("a"), tab: "t1" },
    { ref: id("b"), tab: "t2" },
    { kind: "note", text: { en: "hi" }, tab: "t2" },
  ];

  it("draws the entries naming the shown tab, in view order", () => {
    expect(drawnRows(entries, strip, "t2", groupKeyOf)).toEqual([1, 2]);
  });

  it("draws every entry on an untabbed form", () => {
    expect(drawnRows(entries, undefined, undefined, groupKeyOf)).toEqual([0, 1, 2]);
  });

  it("draws a group's members with their group, so a member stays reachable", () => {
    const grouped: DraftViewEntry[] = [
      { ref: id("g1"), tab: "t2" },
      { ref: id("a"), group: "g1" },
      { ref: id("b"), tab: "t1" },
    ];
    expect(drawnRows(grouped, strip, "t2", groupKeyOf)).toEqual([0, 1]);
    expect(drawnRows(grouped, strip, "t1", groupKeyOf)).toEqual([2]);
  });

  it("draws an entry naming no tab on the FIRST tab, rather than on none", () => {
    // A hand-authored JSON draft can break the every-root-entry-names-a-tab
    // rule. A card no canvas draws is a card no author can repair.
    const stranded: DraftViewEntry[] = [{ ref: id("a"), tab: "t2" }, { ref: id("b") }, { ref: id("c"), tab: "gone" }];
    expect(drawnRows(stranded, strip, "t1", groupKeyOf)).toEqual([1, 2]);
    expect(drawnRows(stranded, strip, "t2", groupKeyOf)).toEqual([0]);
  });
});

describe("drawnNeighbour is the keyboard move's target within the drawn list", () => {
  it("answers the neighbour in draw order, not in array order", () => {
    expect(drawnNeighbour([0, 3, 4], 3, -1)).toBe(0);
    expect(drawnNeighbour([0, 3, 4], 3, 1)).toBe(4);
  });

  it("answers undefined at either end, and for a row the canvas is not drawing", () => {
    expect(drawnNeighbour([0, 3, 4], 0, -1)).toBeUndefined();
    expect(drawnNeighbour([0, 3, 4], 4, 1)).toBeUndefined();
    expect(drawnNeighbour([0, 3, 4], 2, -1)).toBeUndefined();
  });
});

describe("nudgeViewField moves a card past the neighbour the author can SEE", () => {
  it("swaps two cards the array does not place side by side", () => {
    // b and d are on the shown tab; a and c are not. Moving d up must land it
    // above b, not between a and c where it would look like a no-op.
    const start = rows("a", "b", "c", "d");
    expect(refs(nudgeViewField(start, 3, -1, [1, 3]) as DraftViewField[])).toEqual(["a", "d", "b", "c"]);
  });

  it("moves down past the next drawn card", () => {
    const start = rows("a", "b", "c", "d");
    expect(refs(nudgeViewField(start, 1, 1, [1, 3]) as DraftViewField[])).toEqual(["a", "c", "d", "b"]);
  });

  it("is a no-op at either end of the drawn list", () => {
    const start = rows("a", "b", "c", "d");
    expect(nudgeViewField(start, 1, -1, [1, 3])).toBe(start);
    expect(nudgeViewField(start, 3, 1, [1, 3])).toBe(start);
  });

  it("keeps its old behavior when no drawn list is passed", () => {
    const start = rows("a", "b", "c");
    expect(refs(nudgeViewField(start, 2, -1) as DraftViewField[])).toEqual(
      refs(nudgeViewField(start, 2, -1, [0, 1, 2]) as DraftViewField[]),
    );
  });
});

describe("fillMissingTabs keeps a freshly placed entry inside the shown tab", () => {
  it("writes the tab on a root entry carrying none", () => {
    const placed: DraftViewEntry[] = [{ ref: id("a"), tab: "t1" }, { ref: id("b") }];
    expect(fillMissingTabs(placed, "t1")).toEqual([{ ref: id("a"), tab: "t1" }, { ref: id("b"), tab: "t1" }]);
  });

  it("leaves a grouped entry alone: its group carries the tab", () => {
    const placed: DraftViewEntry[] = [{ ref: id("g1"), tab: "t1" }, { ref: id("a"), group: "g1" }];
    expect(fillMissingTabs(placed, "t1")[1]).toEqual({ ref: id("a"), group: "g1" });
  });

  it("hands an untabbed form's array straight back, unchanged and identical", () => {
    const placed = rows("a", "b");
    expect(fillMissingTabs(placed, undefined)).toBe(placed);
  });

  it("keeps the array's identity when nothing is missing, so a no-op drag writes nothing", () => {
    const placed: DraftViewEntry[] = [{ ref: id("a"), tab: "t1" }];
    expect(fillMissingTabs(placed, "t1")).toBe(placed);
  });
});

describe("setEntryGroup keeps a group and a tab from meeting on one entry", () => {
  it("clears the entry's own tab when it takes a group", () => {
    expect(setEntryGroup({ ref: id("a"), tab: "t1" }, "g1", "t1")).toEqual({ ref: id("a"), group: "g1" });
  });

  it("writes the shown tab when the group is cleared on a tabbed form", () => {
    expect(setEntryGroup({ ref: id("a"), group: "g1" }, undefined, "t2")).toEqual({ ref: id("a"), tab: "t2" });
  });

  it("writes no tab when the group is cleared on an untabbed form", () => {
    expect(setEntryGroup({ ref: id("a"), group: "g1" }, undefined, undefined)).toEqual({ ref: id("a") });
  });

  it("reads an empty group as no group at all, the way the renderer does", () => {
    expect(setEntryGroup({ ref: id("a"), group: "g1" }, "", "t2")).toEqual({ ref: id("a"), tab: "t2" });
  });

  it("leaves every other key of the entry standing", () => {
    expect(setEntryGroup({ kind: "note", text: { en: "hi" }, span: 2, tab: "t1" }, "g1", "t1")).toEqual({
      kind: "note",
      text: { en: "hi" },
      span: 2,
      group: "g1",
    });
  });
});
