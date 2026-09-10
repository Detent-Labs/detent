import type { FieldId } from "workflow-engine/schema";
import { flattenDraftFields, type DraftField } from "./fields";
import { isDraftViewField, moveViewField, type DraftViewEntry } from "./view-layout";

/** The form editor's canvas interaction, the nested half: which entries draw
 * inside a group's own card, and the array operations that keep that nesting
 * honest. `view-layout.ts` covers the flat operations (drag, insert, span);
 * this module covers the ones that need to know a field's parent group. */

/** Field id -> the record, at any catalog depth. Skips a field whose `id` is
 * still `undefined` mid-edit: such a field can be nobody's parent and nobody
 * can reference it from a view entry either. */
function draftFieldsById(catalogFields: DraftField[]): Map<FieldId, DraftField> {
  const out = new Map<FieldId, DraftField>();
  for (const f of flattenDraftFields(catalogFields)) {
    if (f.id !== undefined) out.set(f.id, f);
  }
  return out;
}

/**
 * Draft-shaped counterpart of the contract's `parentGroupKeyById`
 * (`src/schema/definition.ts`). Kept local for the same reason
 * `flattenDraftFields` (`./fields.ts`) is: the contract's version is typed
 * against the fully-required `FieldDef[]`, not a mid-edit `Draft`'s partial
 * catalog. Three shapes only a draft can be in need their own handling here:
 *
 * - a field's `id` may be `undefined`; such a field holds no map entry,
 *   where the contract's version would key one on `undefined`
 * - a group's `key` may be `undefined` or empty; its children then map to
 *   nothing, the same as a top-level field (checkbox 4.4's case)
 * - a parent carrying `fields` is not necessarily a `group` any more --
 *   `changeKind` (`EntityTabs.tsx`) rewrites a field's type and leaves its
 *   `fields` in place, so a group turned into a Text field keeps its
 *   children. Only a `type: "group"` parent with a key hands that key to its
 *   own children; every other parent hands its children nothing, not even
 *   its own ambient parent key, since a broken mid-edit container is not a
 *   member of the group around it either.
 */
export function draftParentGroupKeyById(fields: DraftField[]): Map<FieldId, string> {
  const out = new Map<FieldId, string>();
  const walk = (fs: DraftField[], parentKey: string | undefined) => {
    for (const f of fs) {
      if (f.id !== undefined && parentKey !== undefined) out.set(f.id, parentKey);
      if (f.fields) {
        const childParentKey = f.type === "group" && f.key ? f.key : undefined;
        walk(f.fields, childParentKey);
      }
    }
  };
  walk(fields, undefined);
  return out;
}

/** True for a placed entry that is a group's own card: a field entry whose
 * catalog field is `type: "group"` and carries a non-empty `key`. A
 * key-less group draws no card at all (checkbox 4.4) -- its own entry falls
 * through as a plain leaf, the same as any other entry whose `group` never
 * resolves. */
function isGroupCard(entry: DraftViewEntry, fieldsById: Map<FieldId, DraftField>): boolean {
  if (!isDraftViewField(entry) || entry.ref === undefined) return false;
  const field = fieldsById.get(entry.ref);
  return field?.type === "group" && !!field.key;
}

/** Every group card's own row index, by the key that names it. Built from
 * the ROWS the view actually carries, not the catalog: a card the view
 * drops leaves its key absent here, which is exactly how "the view does not
 * carry" (checkbox 4.3) reads as unresolved below. */
function groupCardIndexByKey(rows: DraftViewEntry[], fieldsById: Map<FieldId, DraftField>): Map<string, number> {
  const out = new Map<string, number>();
  rows.forEach((entry, index) => {
    if (!isDraftViewField(entry) || entry.ref === undefined) return;
    const field = fieldsById.get(entry.ref);
    if (field?.type === "group" && field.key) out.set(field.key, index);
  });
  return out;
}

/** The row index of the card an entry's own `.group` names, or `undefined`
 * for a root entry -- either one that carries no `group` at all, or one
 * whose `group` never resolves to a present card (checkbox 4.3: never
 * hidden, drawn at the root instead). This is the one place both the tree
 * builder and the scoped move read a field's or a note's parent, so neither
 * can disagree about who is whose sibling. */
function groupOf(entry: DraftViewEntry, cardIndexByKey: Map<string, number>): number | undefined {
  const group = entry.group;
  if (!group) return undefined;
  return cardIndexByKey.get(group);
}

/** A view entry's place in the canvas tree: its own index in the ORIGINAL
 * `rows` array (every handler in the screen still addresses `rows[i]`, so
 * losing it breaks selection, the strip and every button), plus its
 * members when it is a group's own card. */
export interface ViewTreeNode {
  index: number;
  entry: DraftViewEntry;
  /** Present, even as `[]`, only when this node is a group's own card
   * (`isGroupCard`). Absent for every other entry, whether or not it
   * happens to carry a `.group` of its own: an unresolved `.group` makes
   * this a root leaf (checkbox 4.3), and a resolved one makes it someone
   * else's member instead of a root at all. Presence, not `.length`, is
   * the discriminant a renderer needs: a card with zero members still
   * draws a card. */
  members?: ViewTreeNode[];
}

/**
 * The canvas's nested read of a step's view: the roots, and per group entry
 * its members, each node carrying that entry's own index in the original
 * array. Nothing here mutates or renders (checkboxes 4.1-4.4), so a unit
 * test drives all of it without a DOM.
 *
 * A group's members need not sit next to its card in `rows` -- membership
 * comes from each entry's own `.group` resolving to a present card, not
 * from array adjacency (`view-layout.ts`'s array keeps whatever order a
 * drag or a JSON edit gave it). A member that is itself a group's card (a
 * nested group) gets its own members attached the same way, so nesting goes
 * as deep as the catalog does.
 */
export function viewTree(rows: DraftViewEntry[], catalogFields: DraftField[]): ViewTreeNode[] {
  const fieldsById = draftFieldsById(catalogFields);
  const cardIndexByKey = groupCardIndexByKey(rows, fieldsById);

  const nodes: ViewTreeNode[] = rows.map((entry, index) => ({
    index,
    entry,
    members: isGroupCard(entry, fieldsById) ? [] : undefined,
  }));

  const roots: ViewTreeNode[] = [];
  nodes.forEach((node) => {
    const parentIndex = groupOf(node.entry, cardIndexByKey);
    if (parentIndex === undefined || parentIndex === node.index) {
      roots.push(node);
      return;
    }
    // `parentIndex` came out of `cardIndexByKey`, which only ever names a
    // row that passed `isGroupCard`, so `members` is already `[]` there.
    nodes[parentIndex]!.members!.push(node);
  });
  return roots;
}

/** Every row index reachable from `rootIndex` through `.group` membership,
 * `rootIndex` included: the card plus its members, plus a nested group's
 * own members, however far apart they sit in `rows`. Used to find where a
 * whole group's footprint ends, for the root-level step-over move below --
 * a plain leaf's footprint is just itself. */
function subtreeIndices(rows: DraftViewEntry[], cardIndexByKey: Map<string, number>, rootIndex: number): number[] {
  const set = new Set<number>([rootIndex]);
  let grew = true;
  while (grew) {
    grew = false;
    rows.forEach((entry, i) => {
      if (set.has(i)) return;
      const parentIndex = groupOf(entry, cardIndexByKey);
      if (parentIndex !== undefined && set.has(parentIndex)) {
        set.add(i);
        grew = true;
      }
    });
  }
  return [...set];
}

/**
 * Move a placed entry one position up or down among its own siblings, the
 * keyboard equivalent of dragging it across one neighbour -- scoped by the
 * entry's own group (checkbox 4.6). For a member, siblings are the other
 * entries naming the same group. For a root entry, siblings are the other
 * root entries, group cards included.
 *
 * Implemented as a splice to the target sibling's own slot, through
 * `moveViewField` (the same primitive the drag path uses), never as a
 * two-position swap: the delta spec's "A keyboard move reorders the same
 * way a drag does" scenario would go false on an array where a group's
 * members are not adjacent, since a swap and a splice shift a different set
 * of entries in between. Stepping past a root sibling that is a group card
 * moves past that whole card, every one of its members included, wherever
 * they sit in `rows` -- the entry lands below (or above) the group's full
 * footprint, not merely past the card's own row.
 *
 * Out-of-range is a no-op, returning `rows` unchanged: a command on the
 * first or last sibling needs no separate guard at the call site.
 */
export function nudgeViewField(
  rows: DraftViewEntry[],
  index: number,
  delta: -1 | 1,
  catalogFields: DraftField[],
): DraftViewEntry[] {
  if (index < 0 || index >= rows.length) return rows;
  const fieldsById = draftFieldsById(catalogFields);
  const cardIndexByKey = groupCardIndexByKey(rows, fieldsById);
  const parentIndex = groupOf(rows[index]!, cardIndexByKey);

  const siblings: number[] = [];
  rows.forEach((entry, i) => {
    if (groupOf(entry, cardIndexByKey) === parentIndex) siblings.push(i);
  });

  const pos = siblings.indexOf(index);
  const targetPos = pos + delta;
  if (targetPos < 0 || targetPos >= siblings.length) return rows;
  const targetIndex = siblings[targetPos]!;

  const footprint = subtreeIndices(rows, cardIndexByKey, targetIndex);
  const slot = delta === 1 ? Math.max(...footprint) + 1 : Math.min(...footprint);
  return moveViewField(rows, index, slot);
}

/**
 * Remove a placed entry from the canvas, cascading when it is a group's own
 * card (checkbox 4.8): every entry naming that group's key -- field and note
 * members alike -- leaves with it, in the one change. A member left behind
 * would name a group the view no longer carries, a draft no publish
 * accepts (the "Removing a group card removes the members placed inside
 * it" requirement).
 *
 * Removing anything else, a plain field, a note, or a member of a group,
 * removes only that one entry; the group it belonged to, if any, stays with
 * its other members.
 */
export function removeViewEntry(rows: DraftViewEntry[], index: number, catalogFields: DraftField[]): DraftViewEntry[] {
  if (index < 0 || index >= rows.length) return rows;
  const entry = rows[index]!;
  const fieldsById = draftFieldsById(catalogFields);
  const field = isDraftViewField(entry) && entry.ref !== undefined ? fieldsById.get(entry.ref) : undefined;
  if (field?.type !== "group" || !field.key) {
    return rows.filter((_, i) => i !== index);
  }
  const key = field.key;
  return rows.filter((r, i) => i !== index && r.group !== key);
}

/** Every catalog key naming a placeable group, to the group field's own id:
 * a `type: "group"` field with a non-empty `key`. The inverse direction of
 * `draftParentGroupKeyById`'s values, needed to find (and place) the card
 * entry a newly-inserted member belongs under. */
function groupFieldIdByKey(fieldsById: Map<FieldId, DraftField>): Map<string, FieldId> {
  const out = new Map<string, FieldId>();
  for (const f of fieldsById.values()) {
    if (f.type === "group" && f.key && f.id !== undefined) out.set(f.key, f.id);
  }
  return out;
}

/**
 * Place a catalog field on the canvas at a drop slot, honoring the field's
 * catalog parent (checkbox 4.9, the MODIFIED "A left palette lists..."
 * requirement). A field the catalog nests inside a group lands carrying
 * that group's key as its own `group`, regardless of the slot named: the
 * caller picks the slot (among the group's members, or after the last one
 * by default -- a rendering decision, not this function's), and this
 * function honors it while still attaching the right `group`.
 *
 * When that group's own card is not yet on the view, one change places
 * both: the card at the drop slot, the member entry right after it, so no
 * intermediate draft ever names a group the view does not carry (the
 * "A group's first field brings the group card with it" scenario).
 *
 * A top-level field -- no catalog parent, or a parent whose own key is
 * still empty (checkbox 4.4) -- places exactly like `insertViewField`: at
 * the slot, carrying no `group`. A field already on the view is not
 * re-added, the same dedup `insertViewField` applies.
 */
export function insertGroupedField(
  rows: DraftViewEntry[],
  ref: FieldId,
  slot: number,
  catalogFields: DraftField[],
): DraftViewEntry[] {
  if (rows.filter(isDraftViewField).some((r) => r.ref === ref)) return rows;
  const at = Math.max(0, Math.min(slot, rows.length));
  const next = [...rows];

  const parentKey = draftParentGroupKeyById(catalogFields).get(ref);
  if (parentKey === undefined) {
    next.splice(at, 0, { ref });
    return next;
  }

  const fieldsById = draftFieldsById(catalogFields);
  const groupId = groupFieldIdByKey(fieldsById).get(parentKey);
  if (groupId === undefined) {
    // Defensive: `draftParentGroupKeyById` and `fieldsById` walk the same
    // catalog, so a parent key with no matching group field should not
    // happen. Fall back to a top-level placement rather than write a
    // `group` nothing in the view can ever resolve.
    next.splice(at, 0, { ref });
    return next;
  }

  const cardPresent = rows.some((r) => isDraftViewField(r) && r.ref === groupId);
  if (cardPresent) {
    next.splice(at, 0, { ref, group: parentKey });
    return next;
  }
  next.splice(at, 0, { ref: groupId }, { ref, group: parentKey });
  return next;
}
