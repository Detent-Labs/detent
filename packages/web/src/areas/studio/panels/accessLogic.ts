/**
 * The Access tab's own add/delete gating (`studio-app`'s Access-surface
 * requirement): which of the three lists a viewing actor may add to or
 * delete from, given the lists as loaded and the actor's own id/roles.
 *
 * Pulled out of `AccessPanel.tsx` so the four scenarios test against plain
 * data, with no rendering: this package ships no DOM test library, and
 * `AccessPanel` loads its lists through a `useEffect` a static render never
 * fires (`studio-draftProvider-chainingFetch.test.ts`'s own stated
 * convention — "test the extracted logic instead").
 */
import type { ProcessAccessLists } from "../api/types.js";

const ADMIN_ROLE = "system:admin";

export interface AccessControls {
  developerEditable: boolean;
  ownerEditable: boolean;
  readerEditable: boolean;
}

/**
 * A Developer (or an admin) adds and deletes entries on the Developer list
 * and on the Owner list. An Owner (or an admin) adds and deletes entries on
 * the Reader list. Neither role sees a control for the other's own list. An
 * actor reaching the screen through `ADMIN_ROLE` alone gets every control,
 * regardless of their own Developer or Owner entry.
 */
export function accessControls(lists: ProcessAccessLists, actorId: string, roles: readonly string[]): AccessControls {
  const isAdmin = roles.includes(ADMIN_ROLE);
  const isDeveloper = isAdmin || lists.developer.includes(actorId);
  const isOwner = isAdmin || lists.owner.includes(actorId);
  return { developerEditable: isDeveloper, ownerEditable: isDeveloper, readerEditable: isOwner };
}
