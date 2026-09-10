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
 * to the top level (`newGroupKey` is `undefined`) deletes the key instead of
 * writing it empty — an absent `group` and an empty one both read as "no
 * group", but the contract's canonical JSON distinguishes them, the same
 * reason `view-flags.ts::setFlag` deletes rather than blanks.
 *
 * Touches no note: a move carries a field, and a note names none
 * (`studio-app`: "A move leaves a note inside the group alone").
 */
export function syncViewGroupsOnFieldMove(draft: Draft, fieldId: string, newGroupKey: string | undefined): void {
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      if (newGroupKey === undefined) delete entry.group;
      else entry.group = newGroupKey;
    }
  }
}

/**
 * A rename: every view entry across every step whose `group` equals `oldKey`
 * gets `newKey` instead — a field entry and a note entry alike. Neither one
 * has another route back to its container, so leaving either behind hides it
 * from the form and refuses the publish (`studio-app`: "Renaming a group
 * field's key rewrites the view entries naming it").
 */
export function syncViewGroupsOnGroupRename(draft: Draft, oldKey: string, newKey: string): void {
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of step.view?.fields ?? []) {
      if (entry.group !== oldKey) continue;
      entry.group = newKey;
    }
  }
}
