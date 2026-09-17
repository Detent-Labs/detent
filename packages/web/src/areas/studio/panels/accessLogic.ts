/**
 * The Access tab's own add/delete gating (`studio-app`'s Access-surface
 * requirement): which of the three lists a viewing actor may add to or
 * delete from, given the actor's own standing and roles.
 *
 * Pulled out of `AccessPanel.tsx` so the four scenarios test against plain
 * data, with no rendering: this package ships no DOM test library, and
 * `AccessPanel` loads its lists through a `useEffect` a static render never
 * fires (`studio-draftProvider-chainingFetch.test.ts`'s own stated
 * convention — "test the extracted logic instead").
 */
import type { MyProcessAccess } from "../api/types.js";

const ADMIN_ROLE = "system:admin";

export interface AccessControls {
  developerEditable: boolean;
  ownerEditable: boolean;
  readerEditable: boolean;
}

/**
 * A Developer (or an admin) adds and deletes entries on the Developer list
 * and on the Owner list. An Owner (or an admin) adds and deletes entries on
 * the Reader list. Neither role sees a control for the other's own list.
 *
 * `myAccess` is `getMyProcessAccess`'s response: the calling actor's own
 * Developer/Owner-listed process ids, already resolved through groups and
 * already filtered to actors holding the role each list requires
 * (`processesMatchingAccessList`) — the same standing check
 * `ProcessesScreen.tsx` uses for its own narrowing. Checking `processId`
 * against these two sets, rather than re-deriving membership from the raw
 * `ProcessAccessLists` this process holds, is what keeps this gate correct
 * for a group-listed actor: the raw lists hold `group_xxx` entries a plain
 * `.includes(actorId)` can never match.
 */
export function accessControls(myAccess: Pick<MyProcessAccess, "developer" | "owner">, processId: string, roles: readonly string[]): AccessControls {
  const isAdmin = roles.includes(ADMIN_ROLE);
  const isDeveloper = isAdmin || myAccess.developer.includes(processId);
  const isOwner = isAdmin || myAccess.owner.includes(processId);
  return { developerEditable: isDeveloper, ownerEditable: isDeveloper, readerEditable: isOwner };
}
