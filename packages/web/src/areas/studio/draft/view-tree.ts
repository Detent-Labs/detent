import type { FieldId } from "workflow-engine/schema";
import { flattenDraftFields, type DraftField } from "./fields";
import { fillMissingTabs, homeTab, isDraftViewField, moveViewField, type DraftViewEntry, type DraftViewTab } from "./view-layout";

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
 *   nothing, the same as a top-level field
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
 * key-less group draws no card at all -- its own entry falls
 * through as a plain leaf, the same as any other entry whose `group` never
 * resolves. */
function isGroupCard(entry: DraftViewEntry, fieldsById: Map<FieldId, DraftField>): boolean {
  if (!isDraftViewField(entry) || entry.ref === undefined) return false;
  const field = fieldsById.get(entry.ref);
  return field?.type === "group" && !!field.key;
}

/** The group key an entry declares, read through the catalog: a group card's
 * own `key`, and `undefined` for every other entry. It is the `groupKeyOf`
 * that `view-layout.ts`'s `owningTab`, `homeTab` and `drawnRows` take, built
 * on the same test `viewTree` draws a card by. */
export function cardGroupKey(catalogFields: DraftField[]): (entry: DraftViewEntry) => string | undefined {
  const fieldsById = draftFieldsById(catalogFields);
  return (entry) => {
    if (!isGroupCard(entry, fieldsById) || !isDraftViewField(entry) || entry.ref === undefined) return undefined;
    return fieldsById.get(entry.ref)?.key;
  };
}

/** Every group card's own row index, by the key that names it. Built from
 * the ROWS the view actually carries, not the catalog: a card the view
 * drops leaves its key absent here, which is exactly how "the view does not
 * carry" reads as unresolved below. */
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
 * whose `group` never resolves to a present card (never hidden, drawn at
 * the root instead). This is the one place both the tree
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
   * this a root leaf, and a resolved one makes it someone
   * else's member instead of a root at all. Presence, not `.length`, is
   * the discriminant a renderer needs: a card with zero members still
   * draws a card. */
  members?: ViewTreeNode[];
}

/**
 * The canvas's nested read of a step's view: the roots, and per group entry
 * its members, each node carrying that entry's own index in the original
 * array. Nothing here mutates or renders, so a unit test drives all of it
 * without a DOM.
 *
 * A group's members need not sit next to its card in `rows` -- membership
 * comes from each entry's own `.group` resolving to a present card, not
 * from array adjacency (`view-layout.ts`'s array keeps whatever order a
 * drag or a JSON edit gave it). A member that is itself a group's card (a
 * nested group) gets its own members attached the same way, so nesting goes
 * as deep as the catalog does. A card caught in a cycle of cards naming each
 * other draws at the root, so a hand-edited body never hides a card.
 */
export function viewTree(rows: DraftViewEntry[], catalogFields: DraftField[]): ViewTreeNode[] {
  const fieldsById = draftFieldsById(catalogFields);
  const cardIndexByKey = groupCardIndexByKey(rows, fieldsById);

  const nodes: ViewTreeNode[] = rows.map((entry, index) => ({
    index,
    entry,
    members: isGroupCard(entry, fieldsById) ? [] : undefined,
  }));

  const parentOf = rows.map((entry) => groupOf(entry, cardIndexByKey));
  // True when climbing parents from `index` leads back to `index`: a card
  // naming its own key, or two cards naming each other. Such a card hangs
  // from nothing that reaches a root, so it draws as a root instead.
  const inCycle = (index: number): boolean => {
    const seen = new Set<number>();
    for (let p = parentOf[index]; p !== undefined && !seen.has(p); p = parentOf[p]) {
      if (p === index) return true;
      seen.add(p);
    }
    return false;
  };

  const roots: ViewTreeNode[] = [];
  nodes.forEach((node) => {
    const parentIndex = parentOf[node.index];
    if (parentIndex === undefined || inCycle(node.index)) {
      roots.push(node);
      return;
    }
    // `parentIndex` came out of `cardIndexByKey`, which only ever names a
    // row that passed `isGroupCard`, so `members` is already `[]` there.
    nodes[parentIndex]!.members!.push(node);
  });
  return roots;
}

/**
 * The slot a drop on a group's own box names, and the slot its tail row
 * names: one past the group's last member, or one past its card when the
 * group has no member yet or the card sits later in `rows`. A palette field
 * dropped there lands after the group's last member (`insertGroupedField`).
 * A root card dropped there lands after the group in root order.
 */
export function groupTailSlot(node: ViewTreeNode): number {
  const members = node.members ?? [];
  const lastMemberIndex = members.length > 0 ? members[members.length - 1]!.index : node.index;
  return Math.max(node.index, lastMemberIndex) + 1;
}

/** Every row index reachable from `rootIndex` through `.group` membership,
 * `rootIndex` included: the card plus its members, plus a nested group's
 * own members, however far apart they sit in `rows`. Used by the cascading
 * remove below, to find every entry a group's own card takes with it --
 * a plain leaf's closure is just itself. */
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
 * entry's own group. For a member, siblings are the other entries naming the
 * same group, whatever tab the canvas shows. For a root entry, siblings are
 * the other root entries, group cards included, that `drawn` holds. On a
 * tabbed form `drawn` is `drawnRows`'s answer for the shown tab, so a root
 * steps past the neighbour the author can see, never past an entry another
 * tab draws. Omitting `drawn` counts every root, which is the untabbed form.
 *
 * Implemented as a splice to a sibling boundary, through `moveViewField`
 * (the same primitive the drag path uses), never as a two-position swap:
 * the delta spec's "A keyboard move reorders the same way a drag does"
 * scenario would go false on an array where a group's members are not
 * adjacent, since a swap and a splice shift a different set of entries in
 * between.
 *
 * The slot is the NEXT sibling's own raw index when moving down (or the
 * array's end, past the last sibling), and the TARGET sibling's own raw
 * index when moving up -- a boundary between siblings, not the target's
 * `.group` footprint. That distinction matters once a group's members
 * scatter: an entry unrelated to the group (a different root, say) can sit
 * physically between two of its members without being one of them, and
 * bounding by the target's raw-index footprint would sweep that unrelated
 * entry along for the ride, turning a one-sibling step into two. Bounding
 * by sibling position instead keeps the move to exactly one step among
 * `siblings`, regardless of what else is interleaved in `rows`.
 *
 * Out-of-range is a no-op, returning `rows` unchanged: a command on the
 * first or last sibling needs no separate guard at the call site.
 */
export function nudgeViewField(
  rows: DraftViewEntry[],
  index: number,
  delta: -1 | 1,
  catalogFields: DraftField[],
  drawn?: number[],
): DraftViewEntry[] {
  if (index < 0 || index >= rows.length) return rows;
  const fieldsById = draftFieldsById(catalogFields);
  const cardIndexByKey = groupCardIndexByKey(rows, fieldsById);
  const parentIndex = groupOf(rows[index]!, cardIndexByKey);
  const onCanvas = parentIndex === undefined && drawn !== undefined ? new Set(drawn) : undefined;

  const siblings: number[] = [];
  rows.forEach((entry, i) => {
    if (groupOf(entry, cardIndexByKey) === parentIndex && (onCanvas === undefined || onCanvas.has(i))) siblings.push(i);
  });

  const pos = siblings.indexOf(index);
  if (pos === -1) return rows;
  const targetPos = pos + delta;
  if (targetPos < 0 || targetPos >= siblings.length) return rows;
  const targetIndex = siblings[targetPos]!;

  const slot = delta === 1 ? (siblings[targetPos + 1] ?? rows.length) : targetIndex;
  return moveViewField(rows, index, slot);
}

/**
 * Remove a placed entry from the canvas, cascading when it is a group's own
 * card: every entry naming that group's key -- field and note
 * members alike -- leaves with it, in the one change. A member left behind
 * would name a group the view no longer carries, a draft no publish
 * accepts (the "Removing a group card removes the members placed inside
 * it" requirement).
 *
 * The cascade reuses `subtreeIndices`, the same transitive closure
 * `nudgeViewField` walks: removing an OUTER group must take a nested
 * group's own card AND that nested group's own members, not just the
 * entries naming the outer key directly. A single-level filter on `.group`
 * would strand the inner group's members, naming a group (the inner one)
 * that stayed on the view but whose own card just left it -- itself an
 * unpublishable state.
 *
 * Removing anything else, a plain field, a note, or a member of a group,
 * removes only that one entry; the group it belonged to, if any, stays with
 * its other members.
 */
export function removeViewEntry(rows: DraftViewEntry[], index: number, catalogFields: DraftField[]): DraftViewEntry[] {
  if (index < 0 || index >= rows.length) return rows;
  const fieldsById = draftFieldsById(catalogFields);
  if (!isGroupCard(rows[index]!, fieldsById)) {
    return rows.filter((_, i) => i !== index);
  }
  const cardIndexByKey = groupCardIndexByKey(rows, fieldsById);
  const doomed = new Set(subtreeIndices(rows, cardIndexByKey, index));
  return rows.filter((_, i) => !doomed.has(i));
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
 * The group cards a view still lacks for `ref` to sit inside its catalog
 * parent, outermost first. Each card carries its own parent's key as its
 * `group`. The walk climbs from `ref` through its ancestors and stops at the
 * first one already on the view, at the top of the chain, or at a cycle.
 * Empty for a top-level field, and for a field under a key-less group.
 *
 * `insertGroupedField` places these ahead of a palette field, and
 * `view-group-sync.ts::moveFieldAndSyncViews` places them ahead of a moved
 * field's entry, so the two cannot disagree about which cards a form needs.
 */
export function missingAncestorCards(rows: DraftViewEntry[], ref: FieldId, catalogFields: DraftField[]): DraftViewEntry[] {
  const parentKeyById = draftParentGroupKeyById(catalogFields);
  const groupIdByKey = groupFieldIdByKey(draftFieldsById(catalogFields));
  const isPresent = (fieldId: FieldId) => rows.some((r) => isDraftViewField(r) && r.ref === fieldId);

  const cards: DraftViewEntry[] = [];
  const seen = new Set<FieldId>();
  let current = ref;
  for (;;) {
    const key = parentKeyById.get(current);
    if (key === undefined) break;
    const groupId = groupIdByKey.get(key);
    if (groupId === undefined || seen.has(groupId)) break; // catalog inconsistency, or a cycle: stop rather than loop
    seen.add(groupId);
    if (isPresent(groupId)) break;
    const ownGroup = parentKeyById.get(groupId);
    cards.push(ownGroup === undefined ? { ref: groupId } : { ref: groupId, group: ownGroup });
    current = groupId;
  }
  return cards.reverse();
}

/**
 * Where a new member lands among a group's existing members (the MODIFIED
 * "A left palette lists..." requirement's position rule): a drop on another
 * member's own edge -- `at` equal to that member's own index, or to one past
 * it -- lands exactly there; every other drop lands after the group's last
 * member. `cardIndex` is the group's own row index, the fallback anchor when
 * the group has no members yet to test an edge against, so a group's first
 * member always lands right after its card.
 *
 * Deciding this needs only `rows`, the group's key and the named slot -- no
 * drop geometry -- so it belongs here, where a unit test can drive it,
 * rather than in the renderer, which keeps the one thing it alone can know:
 * which card edge the pointer hit.
 */
function memberInsertionSlot(rows: DraftViewEntry[], groupKey: string, cardIndex: number, at: number): number {
  const memberIndices: number[] = [];
  rows.forEach((r, i) => {
    if (r.group === groupKey) memberIndices.push(i);
  });
  const onMemberEdge = memberIndices.some((mi) => at === mi || at === mi + 1);
  if (onMemberEdge) return at;
  const anchor = memberIndices.length > 0 ? Math.max(...memberIndices) : cardIndex;
  return anchor + 1;
}

/**
 * Place a catalog field on the canvas at a drop slot, honoring the field's
 * catalog parent (the MODIFIED "A left palette lists..." requirement). A
 * field the catalog nests inside a group lands carrying
 * that group's key as its own `group`, wherever the drop named: among the
 * group's existing members, at the drop's own slot when that slot sits on
 * another member's edge, and after the group's last member otherwise
 * (`memberInsertionSlot`).
 *
 * A field nested two or more groups deep gets its WHOLE missing ancestor
 * chain placed, outermost first, each card carrying its own parent's key --
 * not just its immediate parent -- stopping as soon as an ancestor already
 * on the view is reached. One change places every missing card plus the
 * field itself, so no intermediate draft ever names a group the view does
 * not carry (the "A group's first field brings the group card with it"
 * scenario, generalized to a deeper chain).
 *
 * A top-level field -- no catalog parent, or a parent whose own key is
 * still empty -- places exactly like `insertViewField`: at
 * the slot, carrying no `group`. A field already on the view is not
 * re-added, the same dedup `insertViewField` applies.
 *
 * On a tabbed form `tab` is the tab the canvas shows. The one root entry the
 * placement adds takes it: the outermost card of a placed chain, or a
 * top-level field. A member and an inner card carry none, since the card
 * holding them names the tab (rule 4 of the definition contract's tab
 * hierarchy). A member joining a card the form already carries therefore
 * lands on that card's tab.
 */
export function insertGroupedField(
  rows: DraftViewEntry[],
  ref: FieldId,
  slot: number,
  catalogFields: DraftField[],
  tab?: string,
): DraftViewEntry[] {
  if (rows.filter(isDraftViewField).some((r) => r.ref === ref)) return rows;

  const fieldsById = draftFieldsById(catalogFields);
  const parentKeyById = draftParentGroupKeyById(catalogFields);
  const groupIdByKey = groupFieldIdByKey(fieldsById);

  const at = Math.max(0, Math.min(slot, rows.length));
  const next = [...rows];
  const parentKey = parentKeyById.get(ref);

  const cards = missingAncestorCards(rows, ref, catalogFields);
  if (cards.length > 0) {
    const fieldEntry: DraftViewEntry = parentKey === undefined ? { ref } : { ref, group: parentKey };
    next.splice(at, 0, ...fillMissingTabs([...cards, fieldEntry], tab));
    return next;
  }

  if (parentKey === undefined) {
    next.splice(at, 0, ...fillMissingTabs([{ ref }], tab));
    return next;
  }

  // The immediate parent's own card is already on the view: place the field
  // among its members instead of at the raw drop slot.
  const groupId = groupIdByKey.get(parentKey);
  if (groupId === undefined) {
    // Defensive: `parentKeyById` and `groupIdByKey` walk the same catalog,
    // so a parent key with no matching group field should not happen. Fall
    // back to a top-level placement rather than write a `group` nothing in
    // the view can ever resolve.
    next.splice(at, 0, ...fillMissingTabs([{ ref }], tab));
    return next;
  }
  const cardIndex = rows.findIndex((r) => isDraftViewField(r) && r.ref === groupId);
  const memberSlot = memberInsertionSlot(rows, parentKey, cardIndex, at);
  next.splice(memberSlot, 0, { ref, group: parentKey });
  return next;
}

/** Which sibling list a card's edges and tail slot belong to: one group's
 * members, named by the group's key, or the roots one tab draws, named by
 * that tab's key (`undefined` on an untabbed form). */
export type DragScope = { group: string } | { tab: string | undefined };

/**
 * Every row's own drag scope: its group for a member, and for a root the tab
 * the canvas draws it on (`view-layout.ts::homeTab`) -- whichever sibling
 * list a card's own edges and tail slot belong to. What a dragover handler
 * compares a dragged card's origin against, so a card can only relocate
 * within its own scope (the "A drag that would land a member outside its
 * group SHALL change nothing" requirement): a member within its group, a
 * root among the roots its own tab draws. Reuses `viewTree` rather than
 * re-walking `rows`, so this can never disagree with what the canvas
 * actually draws.
 */
export function dragScopeByIndex(rows: DraftViewEntry[], catalogFields: DraftField[], tabs?: DraftViewTab[]): Map<number, DragScope> {
  const groupKeyOf = cardGroupKey(catalogFields);
  const map = new Map<number, DragScope>();
  const walk = (nodes: ViewTreeNode[], scope: DragScope | undefined) => {
    for (const node of nodes) {
      map.set(node.index, scope ?? { tab: homeTab(node.entry, rows, tabs, groupKeyOf) });
      if (node.members) walk(node.members, { group: groupKeyOf(node.entry) ?? "" });
    }
  };
  walk(viewTree(rows, catalogFields), undefined);
  return map;
}

/**
 * Whether a card whose own drag origin sits at `draggedIndex` may legally
 * land at `targetScope` -- the whole drag refusal rule, as one equality
 * check once `dragScopeByIndex` has already answered "whose scope is
 * this". An index the map does not hold lands nowhere. A dragover handler calls `preventDefault` only where this reads
 * true; where it reads false, the browser draws its own no-drop cursor and
 * fires no `drop` -- no new visual state, no CSS (design.md: "A refused
 * drop uses the browser's own no-drop cursor").
 */
export function isLawfulCardDrop(scopeByIndex: Map<number, DragScope>, draggedIndex: number, targetScope: DragScope): boolean {
  const origin = scopeByIndex.get(draggedIndex);
  if (origin === undefined) return false;
  if ("group" in origin) return "group" in targetScope && origin.group === targetScope.group;
  return "tab" in targetScope && origin.tab === targetScope.tab;
}

/**
 * Where the entry originally at `index` in `rows` ends up in `next` -- the
 * array a splice-based move (`nudgeViewField`, or a plain `moveViewField`)
 * returned. Reads the move's own OUTPUT rather than assuming a fixed
 * `index + delta`: a root entry's move can step over a whole group's
 * footprint, landing more than one position away
 * (`EntityTabs.tsx`'s `moveField` reads its own landed row the same way,
 * off the moved tree rather than trusting the target it was handed).
 * Relies on the move keeping the same object reference for the moved
 * entry -- every mover in this module does, via `moveViewField`'s splice --
 * so `indexOf` finds it. `undefined` for an out-of-range `index`, or when
 * the entry cannot be found in `next` at all (should not happen for a
 * `next` this module's own movers returned).
 */
export function landedIndex(rows: DraftViewEntry[], next: DraftViewEntry[], index: number): number | undefined {
  if (index < 0 || index >= rows.length) return undefined;
  const found = next.indexOf(rows[index]!);
  return found === -1 ? undefined : found;
}
