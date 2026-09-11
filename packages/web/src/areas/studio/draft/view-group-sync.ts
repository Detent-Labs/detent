import type { FieldId } from "workflow-engine/schema";
import { moveFieldToGroup, nextFieldKey } from "../panels/fieldCatalogLogic";
import { draftFields, flattenDraftFields, type DraftField } from "./fields";
import type { Draft } from "./types";
import { fillMissingTabs, homeTab, isDraftViewField } from "./view-layout";
import { cardGroupKey, missingAncestorCards } from "./view-tree";

/**
 * Keeps `workflow.steps[].view` entries level with the field-catalog edits
 * that change what a view entry's `group` must name: moving a field between
 * groups, and changing a group field's own key, typed or derived from its
 * label. The definition contract binds a field entry's `group` to the
 * field's catalog parent (`src/schema/compile.ts::checkViewGroupReferences`),
 * so either edit left unsynced strands every entry naming the field or the
 * group, in a draft no publish accepts.
 *
 * Each exported write changes the catalog and the views together, and its
 * caller runs it inside one `mutate`, so no reader ever sees the catalog and
 * the views disagree. `moveFieldToGroup` stays the rail's pure tree function
 * over `DraftField[]`; `moveFieldAndSyncViews` adds the view half around it.
 */

/**
 * A catalog move and everything it owes the views, in one call: the
 * field-array write through `moveFieldToGroup`, the `group` of every entry
 * naming the moved field (`syncViewGroupsOnFieldMove`), and any group card a
 * form now lacks.
 *
 * Where a step's view carries the moved field but not its destination
 * group's card, the card goes immediately before the moved field's entry. A
 * nested destination brings every missing ancestor card too, outermost
 * first, each naming its own parent (`view-tree.ts::missingAncestorCards`,
 * the walk a palette drop uses). A view already carrying a card gains no
 * second one, and a move to the top level places nothing. Without the card,
 * the rewritten entry would name a group its view does not carry, which the
 * publish refuses as well.
 *
 * On a tabbed form the move keeps the tab rules. Each entry's former tab is
 * the tab the canvas drew it on: its own for a root, its outermost card's for
 * a member (`view-layout.ts::homeTab`). An entry the move puts inside a group
 * loses its `tab`, since the card holding it names the tab. An entry the move
 * lifts to the top level takes its former tab. A placed card standing at the
 * form's root takes that same former tab, and an inner card of a placed chain
 * carries none. An untabbed form gets no `tab` anywhere.
 *
 * A move the catalog refuses (`moveFieldToGroup` answers its input
 * unchanged) writes nothing.
 */
export function moveFieldAndSyncViews(draft: Draft, fieldId: string, targetGroupId: string | undefined): void {
  const fields = draft.fields ?? [];
  const next = moveFieldToGroup(fields, fieldId, targetGroupId);
  if (next === fields) return;
  const steps = draft.workflow?.steps ?? [];
  // Read before the rewrite, while each entry still names its old group.
  const groupKeyOf = cardGroupKey(fields);
  const formerTabs = steps.map((step) => {
    const rows = step.view?.fields ?? [];
    const entry = rows.find((e) => isDraftViewField(e) && e.ref === fieldId);
    return entry === undefined ? undefined : homeTab(entry, rows, step.view?.tabs, groupKeyOf);
  });
  draft.fields = next;
  // The destination's key, read off the moved tree: the field now hangs
  // directly under that group, so its key is the field's whole parent key.
  const newGroupKey = targetGroupId === undefined ? undefined : flattenDraftFields(next).find((f) => f.id === targetGroupId)?.key;
  syncViewGroupsOnFieldMove(draft, fieldId, newGroupKey);

  steps.forEach((step, s) => {
    const rows = step.view?.fields;
    if (!rows) return;
    const at = rows.findIndex((entry) => isDraftViewField(entry) && entry.ref === fieldId);
    if (at === -1) return;
    const entry = rows[at]!;
    const formerTab = formerTabs[s];
    if (entry.group) delete entry.tab;
    else if (formerTab !== undefined) entry.tab = formerTab;
    const cards = missingAncestorCards(rows, fieldId as FieldId, next);
    if (cards.length > 0) rows.splice(at, 0, ...fillMissingTabs(cards, formerTab));
  });
}

/**
 * A move's rewrite of the moved field's own entries: every view entry across
 * every step whose `ref` names `fieldId` gets `group` set to `newGroupKey`,
 * the destination group's own key. A move to the top level, or to a group
 * whose own key is still empty, deletes the key instead of writing it empty.
 * A key-less group draws no card (`view-tree.ts::isGroupCard`'s `!!field.key`
 * test) and can be nobody's named destination, the same convention
 * `insertGroupedField` follows for a field's initial placement. An absent
 * `group` and an empty one both read as "no group", but canonical JSON tells
 * them apart, the same reason `view-flags.ts::setFlag` deletes rather than
 * blanks.
 *
 * Touches no note: a move carries a field, and a note names none
 * (`studio-app`: "A move leaves a note inside the group alone").
 */
export function syncViewGroupsOnFieldMove(draft: Draft, fieldId: string, newGroupKey: string | undefined): void {
  const key = newGroupKey ? newGroupKey : undefined;
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      if (key === undefined) delete entry.group;
      else entry.group = key;
    }
  }
}

/**
 * A group field's key change, typed into its key input or derived from its
 * label, with the view rewrite it owes (`studio-app`: "Renaming a group
 * field's key rewrites the view entries naming it"). Writes the catalog key,
 * then:
 *
 * - Every field entry, across every step, whose `ref` names one of the
 *   group's DIRECT children gets `group` set to `newKey`, or loses `group`
 *   when `newKey` is empty. The match follows catalog parentage, never the
 *   old key string, so a key passing through another group's key cannot pick
 *   up that group's entries. A nested group's own children name their own
 *   parent and stay out of it, the per-immediate-parent rule
 *   `view-tree.ts::draftParentGroupKeyById` follows.
 * - A note naming `oldKey` follows to `newKey` only when both keys are
 *   non-empty and no other group field holds either one. A note has no
 *   catalog parent, so the old key is its only tie to this group, and a key
 *   another group holds ties it to that group as well. Otherwise the note
 *   keeps `oldKey`. While no group field its view carries holds `oldKey`,
 *   the checks rail reports it rather than the form losing it; while one
 *   does, the note draws in that group's box.
 * - On a tabbed view the rewrite keeps the tab rules. A cleared key lifts
 *   each child's entry to the root, where it takes the tab it drew on: the
 *   tab of the outermost card holding this group's own entry
 *   (`view-layout.ts::homeTab`, read before the key changes). A non-empty
 *   key makes each child's entry a member, which carries no `tab`. A note's
 *   `tab` stays as it was.
 * - A first key can reach a view that carries a child's entry and lacks the
 *   group's own card. That view gains the card, and any missing ancestor
 *   card, before its first child entry. The outermost placed card takes that
 *   child's former tab, so every child sits on one tab. A view already
 *   carrying the card gains no second one.
 *
 * Writes no `group: ""` anywhere. A field that is not `type: "group"` gets
 * its key written and nothing else: a non-group parent hands its leftover
 * children no key.
 */
export function writeGroupKey(draft: Draft, groupFieldId: string, newKey: string): void {
  const fields = draftFields(draft);
  const group = fields.find((f) => f.id === groupFieldId);
  if (!group) return;
  const oldKey = group.key ?? "";
  if (oldKey === newKey) return;
  const steps = draft.workflow?.steps ?? [];
  const childIds = new Set((group.fields ?? []).map((f) => f.id).filter((fid): fid is FieldId => fid !== undefined));
  // The tab each child's entry draws on, read while its `group` still names
  // this group's card, or no card before a first key. Indexed by step and
  // entry, since the writes below walk the same arrays in the same order
  // before any card is placed.
  const groupKeyOf = cardGroupKey(draft.fields ?? []);
  const formerTabs = steps.map((step) => {
    const rows = step.view?.fields ?? [];
    return rows.map((entry) =>
      group.type === "group" && isDraftViewField(entry) && entry.ref !== undefined && childIds.has(entry.ref)
        ? homeTab(entry, rows, step.view?.tabs, groupKeyOf)
        : undefined,
    );
  });
  group.key = newKey;
  if (group.type !== "group") return;

  const heldElsewhere = (key: string) => fields.some((f) => f.id !== groupFieldId && f.type === "group" && f.key === key);
  const notesFollow = oldKey !== "" && newKey !== "" && !heldElsewhere(oldKey) && !heldElsewhere(newKey);

  steps.forEach((step, s) => {
    (step.view?.fields ?? []).forEach((entry, i) => {
      if (isDraftViewField(entry)) {
        if (entry.ref === undefined || !childIds.has(entry.ref)) return;
        if (newKey === "") {
          delete entry.group;
          const formerTab = formerTabs[s]![i];
          if (formerTab !== undefined) entry.tab = formerTab;
        } else {
          entry.group = newKey;
          delete entry.tab;
        }
      } else if (notesFollow && entry.group === oldKey) {
        entry.group = newKey;
      }
    });
  });

  if (oldKey !== "") return;
  // A first key gives the children a group their views may not carry. The
  // card, with any missing ancestor card, goes before the first child entry
  // (`view-tree.ts::missingAncestorCards`, the walk a catalog move uses), and
  // the outermost placed card takes that child's former tab.
  steps.forEach((step, s) => {
    const rows = step.view?.fields;
    if (!rows) return;
    const at = rows.findIndex((entry) => isDraftViewField(entry) && entry.ref !== undefined && childIds.has(entry.ref));
    const first = rows[at];
    if (first === undefined || !isDraftViewField(first) || first.ref === undefined) return;
    const cards = missingAncestorCards(rows, first.ref, draft.fields ?? []);
    if (cards.length > 0) rows.splice(at, 0, ...fillMissingTabs(cards, formerTabs[s]![at]));
  });
}

/**
 * A group field's label edit: writes the label, and the key the edit derives
 * (`fieldCatalogLogic.ts::nextFieldKey`, live only while the key still reads
 * as the prior label's derivation) through `writeGroupKey`, so the views
 * follow. A label deriving to an empty key keeps the current key, so clearing
 * a label never clears a key the views name. `nextFieldKey` dedupes against
 * every other non-empty catalog key, so the derived key never lands on another
 * group's. A key-less field stays out of that set: a `""` in it dedupes an
 * empty derivation to `_2`, which would rename the group.
 */
export function writeGroupLabel(draft: Draft, groupFieldId: string, label: DraftField["label"], baseLocale: string): void {
  const fields = draftFields(draft);
  const group = fields.find((f) => f.id === groupFieldId);
  if (!group) return;
  const taken = new Set(fields.filter((f) => f.id !== groupFieldId).map((f) => f.key ?? "").filter((key) => key !== ""));
  const derivedKey = nextFieldKey(group.key ?? "", group.label, label, baseLocale, taken);
  group.label = label;
  if (derivedKey) writeGroupKey(draft, groupFieldId, derivedKey);
}
