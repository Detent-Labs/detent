import type { Draft } from "./types";
import { isDraftViewField } from "./view-layout";

/**
 * Keeps `workflow.steps[].view` entries level with two field-catalog edits
 * that change what a view entry's `group` must name: moving a field between
 * groups, and renaming a group field's own key. The definition contract
 * binds a field entry's `group` to the field's catalog parent
 * (`src/schema/compile.ts::checkViewGroupReferences`), so either edit left
 * unsynced strands every entry naming the field or the group, and a
 * strand-ed draft is one no publish accepts.
 *
 * Both functions live here rather than in `fieldCatalogLogic.ts` (design.md:
 * "One helper keeps the view entries level with the catalog").
 * `moveFieldToGroup` is the rail's pure tree function over `DraftField[]`
 * alone and cannot reach `workflow.steps[].view`; widening it to take the
 * whole draft would give it a second job. Each caller writes the catalog
 * change and calls the matching function here inside the SAME `mutate`, so
 * no reader ever sees the catalog and the views disagree.
 */

/**
 * A move: every view entry across every step whose `ref` names `fieldId`
 * gets `group` set to `newGroupKey`, the destination group's own key. A move
 * to the top level, OR to a group whose own key is still empty, deletes the
 * key instead of writing it empty. An empty `newGroupKey` is normalized to
 * `undefined` right here rather than trusted from the caller: a key-less
 * group draws no card at all (`view-tree.ts::isGroupCard`'s `!!field.key`
 * test) and can be nobody's named destination, the same convention
 * `insertGroupedField` already follows for a field's initial placement. An
 * absent `group` and an empty one both read as "no group" to a reader, but
 * the contract's canonical JSON distinguishes them, the same reason
 * `view-flags.ts::setFlag` deletes rather than blanks.
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
 * A rename between two non-empty keys: every view entry across every step
 * whose `group` equals `oldKey` gets `newKey` instead — a field entry and a
 * note entry alike. Neither one has another route back to its container, so
 * leaving either behind hides it from the form and refuses the publish
 * (`studio-app`: "Renaming a group field's key rewrites the view entries
 * naming it").
 *
 * Not the function for a group field's FIRST key (`oldKey === ""`): no
 * entry can ever carry a literal `group: ""` under this module's own
 * delete-rather-than-blank convention, so a call with an empty `oldKey`
 * would match nothing. `syncViewGroupsOnGroupKeyGained` is the counterpart
 * for that case.
 */
export function syncViewGroupsOnGroupRename(draft: Draft, oldKey: string, newKey: string): void {
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of step.view?.fields ?? []) {
      if (entry.group !== oldKey) continue;
      entry.group = newKey;
    }
  }
}

/**
 * A group field's FIRST key. No entry could ever have named `""` as this
 * group (`syncViewGroupsOnGroupRename`'s own match would find nothing), but
 * the group's DIRECT children just became nameable for the first time:
 * `draftParentGroupKeyById`'s walk (`view-tree.ts`) only resolves a child's
 * parent key once the parent's own `type === "group" && key` test passes,
 * so a child placed on a view while its parent was still key-less carries
 * no `group` at all (`insertGroupedField`'s top-level-placement fallback).
 *
 * Every view entry across every step whose `ref` names one of
 * `childFieldIds` gets `group` set to `newKey`, whatever it carried before
 * — nothing legitimate could have named this group before it had a key.
 * Leaving such an entry unset strands it the moment the parent gains a key:
 * `checkViewGroupReferences`'s third half compares the field's now-resolved
 * catalog parent against the entry's `group`, and an absent `group` no
 * longer agrees.
 *
 * `childFieldIds` is the group's DIRECT children only (its own `fields`
 * array), never a deeper flatten: a nested group's own children resolve
 * their `group` off THEIR OWN immediate parent's key, independent of this
 * group's, the same per-immediate-parent rule `draftParentGroupKeyById`
 * already follows. Touches no note: a group's `fields` array holds catalog
 * fields only, and a note names none.
 */
export function syncViewGroupsOnGroupKeyGained(draft: Draft, childFieldIds: string[], newKey: string): void {
  const ids = new Set(childFieldIds);
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref === undefined || !ids.has(entry.ref)) continue;
      entry.group = newKey;
    }
  }
}
