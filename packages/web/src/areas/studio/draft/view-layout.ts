import type { FieldId, LocalizedText, View, ViewEntry, ViewField, ViewTab } from "workflow-engine/schema";
import type { DraftOf } from "./types";

export type DraftViewField = DraftOf<ViewField>;

/** A drafted view entry: a field reference or a note, before publish-time
 * validation. `DraftOf` makes every key optional, so a mid-edit note (no
 * `text` yet) and a mid-edit field (no `ref` yet) both parse as this type. */
export type DraftViewEntry = DraftOf<ViewEntry>;

/** A drafted tab-strip member: a minted `key` and an authored `label`,
 * before publish-time validation. */
export type DraftViewTab = DraftOf<ViewTab>;

/** A drafted step view: entries, the column count, and the optional tab
 * strip above them. */
export type DraftView = DraftOf<View>;

/** True for a drafted field entry, the studio's counterpart to
 * `definition.ts`'s `isViewField`: a drafted note always carries `kind`, and
 * a drafted field never does. */
export function isDraftViewField(entry: DraftViewEntry): entry is DraftViewField {
  return !("kind" in entry);
}

/** Which edge of a card a pointer or a keyboard command targets. The canvas
 * reports the side rather than a pixel offset, so nothing here reads geometry
 * and every case below is testable without a DOM. */
export type DropSide = "before" | "after";

/**
 * The insertion slot a drop names, as an index into the array BEFORE anything
 * moves. Dropping after the last card yields `rows.length`.
 *
 * A `span: 2` card fills its whole grid row, so both of its visual halves
 * belong to the same card. The side, not the pixel column, decides the slot.
 */
export function dropSlot(target: number, side: DropSide): number {
  return side === "after" ? target + 1 : target;
}

/**
 * Where an existing card ends up after moving to a drop slot.
 *
 * The slot indexes the array before the card leaves it, so a slot past the
 * card's own position shifts down by one once it does. A slot on either side
 * of the card itself is a no-op and reports the card's own index.
 */
export function reorderIndex(from: number, slot: number): number {
  if (slot > from) return slot - 1;
  return slot;
}

/** Splices `rows[from]` out and back in at `to`. The one array-move
 * primitive `moveViewField` and `moveViewTab` both reduce to, so a card drag
 * and a tab-strip reorder can never drift apart on the mechanics. */
function spliceMove<T>(rows: T[], from: number, to: number): T[] {
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Move a placed card to a drop slot. This is the one array change a drag and
 * a keyboard move both produce, so neither can drift from the other. */
export function moveViewField(rows: DraftViewEntry[], from: number, slot: number): DraftViewEntry[] {
  const to = reorderIndex(from, slot);
  if (from === to || from < 0 || from >= rows.length) return rows;
  return spliceMove(rows, from, to);
}

/** Move a placed card one position up or down, the keyboard equivalent of
 * dragging it across one neighbour. Out-of-range is a no-op, so a command on
 * the first or last card needs no separate guard at the call site.
 *
 * `drawn` names the entry indices the canvas is currently drawing, in draw
 * order — `drawnRows` below, on a form filtered to one tab. The move then
 * swaps the card with the neighbour the author can SEE, not with the array
 * neighbour, which on a tabbed form may sit on another tab and make the
 * command read as a no-op. Omitting it draws every entry, which is the
 * untabbed form and the behavior this had before tabs existed. */
export function nudgeViewField(rows: DraftViewEntry[], index: number, delta: -1 | 1, drawn?: number[]): DraftViewEntry[] {
  const neighbour = drawnNeighbour(drawn ?? rows.map((_, i) => i), index, delta);
  if (neighbour === undefined) return rows;
  return moveViewField(rows, index, delta === 1 ? neighbour + 1 : neighbour);
}

/** Place a catalog field on the canvas at a drop slot. A field already on the
 * view is not re-added: the palette lists only unplaced fields, and a stale
 * drag must not duplicate a row. A note names no catalog field, so it never
 * collides with this dedup. */
export function insertViewField(rows: DraftViewEntry[], ref: FieldId, slot: number): DraftViewEntry[] {
  if (rows.filter(isDraftViewField).some((r) => r.ref === ref)) return rows;
  const at = Math.max(0, Math.min(slot, rows.length));
  const next = [...rows];
  next.splice(at, 0, { ref });
  return next;
}

/** Place a note on the canvas at a drop slot, seeded with `text`. Unlike
 * `insertViewField`, this dedups nothing: a note names no catalog field, so
 * two may sit side by side. */
export function insertViewNote(rows: DraftViewEntry[], text: LocalizedText, slot: number): DraftViewEntry[] {
  const at = Math.max(0, Math.min(slot, rows.length));
  const next = [...rows];
  next.splice(at, 0, { kind: "note", text });
  return next;
}

/** Catalog field ids not yet on the view, in catalog order. This is the
 * palette's own content, and the inverse of what the canvas shows.
 *
 * Typed on `FieldId` rather than `string` throughout: `ViewField.ref` is the
 * branded id, and the contract makes that id the sole reference anchor. A
 * `string` here would let a key or a label reach the array. A note carries
 * no `ref`, so it never places a catalog field. */
export function unplacedRefs(catalogIds: FieldId[], rows: DraftViewEntry[]): FieldId[] {
  const placed = new Set<FieldId | undefined>(rows.filter(isDraftViewField).map((r) => r.ref));
  return catalogIds.filter((id) => !placed.has(id));
}

/** The drawn width of a card: `min(span, columns)`. A field never exceeds the
 * grid it sits in, and its stored `span` is left alone, so narrowing a form to
 * one column and widening it again returns every card to its declared width. */
export function clampSpan(span: number | undefined, columns: 1 | 2): 1 | 2 {
  return Math.min(span ?? 1, columns) as 1 | 2;
}

// ============================================================
// Tab strip.
// ============================================================

/** Mints a tab's `key`: a fresh UUID, unique within the view by
 * construction. A `ViewTab.key` carries no identifier grammar the way a
 * field's `key` does — `definition.ts` requires only a non-empty trimmed
 * string — and the editor never shows it (design.md: "The studio mints the
 * `key` and never shows it"), so there is no derive-from-label step to run
 * and no collision to dedupe against. */
function mintTabKey(): string {
  return crypto.randomUUID();
}

/** True for a root entry: one that declares no `group`. Only a root entry
 * carries its own `tab` — a group's members carry none of their own (rule 4
 * of the definition contract's tab/field/group hierarchy), so they are never
 * a target of the sweep below or of the merge in `removeViewTab`. */
function isRootEntry(entry: DraftViewEntry): boolean {
  return !entry.group;
}

/** Adds a tab to `view`, minting its `key` and carrying `label` as authored
 * (design.md: "The editor mints the `key` and never shows it"; the caller —
 * `seedLocalizedText` today — is what guarantees a non-empty base-locale
 * entry).
 *
 * Adding the FIRST tab to a form sweeps every existing root entry onto it
 * (`studio-form-editor`: "Creating and removing a tab leaves no entry
 * stranded" — rule 3 of the definition contract requires a non-empty `tab`
 * on every root entry once a view declares one, so the author's very next
 * keystroke would otherwise produce an unpublishable draft). A grouped entry
 * is skipped: its group holds it, and the group's own entry is what carries
 * the tab. Adding a second or later tab sweeps nothing — every existing root
 * entry already names a tab, and the author assigns new ones deliberately. */
export function addViewTab(view: DraftView, label: DraftViewTab["label"]): DraftView {
  const tabs = view.tabs ?? [];
  const key = mintTabKey();
  const nextTabs = [...tabs, { key, label }];

  if (tabs.length > 0) return { ...view, tabs: nextTabs };

  const fields = (view.fields ?? []).map((entry) => (isRootEntry(entry) ? { ...entry, tab: key } : entry));
  return { ...view, tabs: nextTabs, fields };
}

/** Renames a tab: writes `label` alone, on a copy. The `key` a copy carries
 * is untouched by construction — this function has no parameter through
 * which one could reach it — which is what the definition contract's rule
 * requires: an authoring surface SHALL NOT rewrite a tab's `key` once an
 * entry in the view names it, since a rewrite would orphan every entry
 * naming the old value. A `key` naming no tab is a no-op: the map matches
 * nothing and hands back an equivalent, unmutated array. */
export function renameViewTab(view: DraftView, key: string, label: DraftViewTab["label"]): DraftView {
  return { ...view, tabs: (view.tabs ?? []).map((t) => (t.key === key ? { ...t, label } : t)) };
}

/** Removes a tab, handing its entries to a neighbour rather than deleting
 * them (`studio-form-editor`: "The editor deletes no entry. It opens no
 * dialog either").
 *
 * Removing the tab before the removed one's own strip position takes its
 * entries — the tab after it when the removed tab was first. Removing the
 * LAST remaining tab is the teardown case instead: `tab` is cleared from
 * every entry and `tabs` drops from the view, returning the form to the
 * shape it had before any tab existed. A `key` naming no tab is a no-op. */
export function removeViewTab(view: DraftView, key: string): DraftView {
  const tabs = view.tabs ?? [];
  const index = tabs.findIndex((t) => t.key === key);
  if (index === -1) return view;

  if (tabs.length === 1) {
    const fields = (view.fields ?? []).map((entry) => {
      if (entry.tab === undefined) return entry;
      const out = { ...entry };
      delete out.tab;
      return out;
    });
    const next = { ...view, fields };
    delete next.tabs;
    return next;
  }

  const target = tabs[index === 0 ? 1 : index - 1]!.key;
  const fields = (view.fields ?? []).map((entry) => (entry.tab === key ? { ...entry, tab: target } : entry));
  const nextTabs = tabs.filter((t) => t.key !== key);
  return { ...view, tabs: nextTabs, fields };
}

/** Move a tab to a drop slot, the tab-strip's own `moveViewField`. It
 * touches `tabs` alone — reordering changes the tab order alone and moves no
 * entry between tabs (`studio-form-editor`), and this function's signature
 * carries no `fields` to move one through even by mistake. */
export function moveViewTab(tabs: DraftViewTab[], from: number, slot: number): DraftViewTab[] {
  const to = reorderIndex(from, slot);
  if (from === to || from < 0 || from >= tabs.length) return tabs;
  return spliceMove(tabs, from, to);
}

// ============================================================
// Tab strip: what the editor's canvas draws.
// ============================================================

/** The tab whose entries the canvas draws: `active` while it still names a
 * tab, the strip's first tab otherwise, and `undefined` for a view
 * declaring none.
 *
 * Derived on every render rather than stored, so removing the open tab or
 * loading another step needs no effect to repair the selection. A tab
 * carrying no `key` yet is skipped: nothing can name it, so nothing draws
 * on it. */
export function shownTab(tabs: DraftViewTab[] | undefined, active: string | undefined): string | undefined {
  const keys = (tabs ?? []).map((t) => t.key).filter((k): k is string => !!k);
  if (active !== undefined && keys.includes(active)) return active;
  return keys[0];
}

/** The tab an entry draws on: its own `tab` on a root entry, its group's on
 * a member. `groupKeyOf` names the group an entry DECLARES — a group field's
 * catalog `key`, the value `DraftViewEntry.group` references — and answers
 * `undefined` for every other entry.
 *
 * A group nested in a group walks up again. The hop count is bounded by the
 * entry count, so a malformed cycle terminates rather than hanging. The
 * counterpart of `form-ui`'s own `owningTab`, over a draft rather than a
 * resolved view. */
export function owningTab(
  entry: DraftViewEntry,
  entries: DraftViewEntry[],
  groupKeyOf: (entry: DraftViewEntry) => string | undefined,
): string | undefined {
  let current = entry;
  for (let hops = 0; hops <= entries.length; hops++) {
    if (current.tab !== undefined) return current.tab;
    const group = current.group;
    if (!group) return undefined;
    const parent = entries.find((e) => groupKeyOf(e) === group);
    if (!parent) return undefined;
    current = parent;
  }
  return undefined;
}

/** The entry indices the canvas draws for `tab`, in the view's own order.
 * `undefined` draws every entry: an untabbed view lays out exactly the way
 * it did before tabs existed.
 *
 * An entry whose owning tab names no tab in the strip draws on the FIRST tab
 * rather than on none. The JSON view can author one — design.md accepts that
 * a hand-authored draft breaks the rule and fails at publish — and a card no
 * canvas draws is a card no author can repair. */
export function drawnRows(
  entries: DraftViewEntry[],
  tabs: DraftViewTab[] | undefined,
  tab: string | undefined,
  groupKeyOf: (entry: DraftViewEntry) => string | undefined,
): number[] {
  if (tab === undefined) return entries.map((_, i) => i);
  const keys = (tabs ?? []).map((t) => t.key).filter((k): k is string => !!k);
  const rows: number[] = [];
  entries.forEach((entry, index) => {
    const owning = owningTab(entry, entries, groupKeyOf);
    const home = owning !== undefined && keys.includes(owning) ? owning : keys[0];
    if (home === tab) rows.push(index);
  });
  return rows;
}

/** The entry a keyboard move swaps `index` with: its neighbour in the DRAWN
 * order, never in the array. `undefined` at either end of the drawn list,
 * and for an index the canvas is not drawing.
 *
 * It is also where the moved card lands, so the screen re-selects the card
 * it just moved by reading this one value. */
export function drawnNeighbour(drawn: number[], index: number, delta: -1 | 1): number | undefined {
  const at = drawn.indexOf(index);
  if (at === -1) return undefined;
  return drawn[at + delta];
}

/** Every root entry carrying no `tab` takes `tab`. On a tabbed view a
 * freshly placed entry is the only one that can be missing one, so this is
 * what keeps a palette drop, a mint and a new note inside the tab the canvas
 * is showing — rule 3 of the definition contract's tab hierarchy admits no
 * root entry outside the tabs once a view declares one.
 *
 * `undefined` hands the array straight back, and so does an array with
 * nothing to fill: an untabbed view has no tab to write, and an unchanged
 * array keeps its identity, so a stale palette drag of an already-placed
 * field still writes nothing to the draft. */
export function fillMissingTabs(entries: DraftViewEntry[], tab: string | undefined): DraftViewEntry[] {
  if (tab === undefined) return entries;
  if (!entries.some((entry) => isRootEntry(entry) && !entry.tab)) return entries;
  return entries.map((entry) => (isRootEntry(entry) && !entry.tab ? { ...entry, tab } : entry));
}

/** The entry a group change leaves behind (`studio-form-editor`: "Assigning
 * an entry to a group SHALL clear that entry's own `tab`. Clearing an
 * entry's group on a tabbed form SHALL set its `tab` to the tab the canvas
 * is showing").
 *
 * Neither move leaves a draft the definition contract rejects: rule 4
 * forbids a `tab` beside a `group`, and rule 3 requires one on every root
 * entry of a tabbed view. `tab` is the tab the canvas is showing, and
 * `undefined` there is an untabbed form, which wants no `tab` at all. */
export function setEntryGroup(
  entry: DraftViewEntry,
  group: string | undefined,
  tab: string | undefined,
): DraftViewEntry {
  const next = { ...entry };
  delete next.group;
  delete next.tab;
  if (group) return { ...next, group };
  return tab === undefined ? next : { ...next, tab };
}
