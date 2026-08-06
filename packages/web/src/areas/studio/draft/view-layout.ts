import type { FieldId, ViewField } from "workflow-engine/schema";
import type { DraftOf } from "./types";

export type DraftViewField = DraftOf<ViewField>;

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

/** Move a placed field to a drop slot. This is the one array change a drag and
 * a keyboard move both produce, so neither can drift from the other. */
export function moveViewField(rows: DraftViewField[], from: number, slot: number): DraftViewField[] {
  const to = reorderIndex(from, slot);
  if (from === to || from < 0 || from >= rows.length) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Move a placed field one position up or down, the keyboard equivalent of
 * dragging it across one neighbour. Out-of-range is a no-op, so a command on
 * the first or last card needs no separate guard at the call site. */
export function nudgeViewField(rows: DraftViewField[], index: number, delta: -1 | 1): DraftViewField[] {
  const target = index + delta;
  if (target < 0 || target >= rows.length) return rows;
  return moveViewField(rows, index, delta === 1 ? target + 1 : target);
}

/** Place a catalog field on the canvas at a drop slot. A field already on the
 * view is not re-added: the palette lists only unplaced fields, and a stale
 * drag must not duplicate a row. */
export function insertViewField(rows: DraftViewField[], ref: FieldId, slot: number): DraftViewField[] {
  if (rows.some((r) => r.ref === ref)) return rows;
  const at = Math.max(0, Math.min(slot, rows.length));
  const next = [...rows];
  next.splice(at, 0, { ref });
  return next;
}

/** Catalog field ids not yet on the view, in catalog order. This is the
 * palette's own content, and the inverse of what the canvas shows.
 *
 * Typed on `FieldId` rather than `string` throughout: `ViewField.ref` is the
 * branded id, and the contract makes that id the sole reference anchor. A
 * `string` here would let a key or a label reach the array. */
export function unplacedRefs(catalogIds: FieldId[], rows: DraftViewField[]): FieldId[] {
  const placed = new Set<FieldId | undefined>(rows.map((r) => r.ref));
  return catalogIds.filter((id) => !placed.has(id));
}

/** The drawn width of a card: `min(span, columns)`. A field never exceeds the
 * grid it sits in, and its stored `span` is left alone, so narrowing a form to
 * one column and widening it again returns every card to its declared width. */
export function clampSpan(span: number | undefined, columns: 1 | 2): 1 | 2 {
  return Math.min(span ?? 1, columns) as 1 | 2;
}
