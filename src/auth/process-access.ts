/**
 * Per-process access lists (process-access-roles): does an actor match the
 * Developer, Owner or Reader list `process_access_roles` holds for one
 * process (`src/engine/store.ts::initSchema`)? Sibling of
 * `src/auth/groups.ts` and `src/auth/authorize.ts`, following their same
 * conventions.
 *
 * A match is the actor's own id, or one of the groups the actor belongs to
 * per `getGroupsForMember` — resolved live against the group store, never
 * cached or rewritten onto the list. A Developer or Owner match additionally
 * needs the actor to hold the role that list requires
 * (`DEVELOPER_ROLE`/`AUTHOR_ROLE` for Developer, `OWNER_ROLE` for Owner); a
 * Reader match needs no role at all. The identity check is deliberately kept
 * separate from `actorPrincipals` (which folds `actor.roles` into the same
 * set as the id and groups): `process_access_roles.principal` only ever
 * holds a `user_xxx`/`group_xxx` id, never a role string, so mixing roles
 * into the set being matched against the list would blur "matched by
 * identity" and "holds the required role" into one check where this function
 * needs them kept apart.
 */
import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import { getGroupsForMember } from "./groups.js";
import { DEVELOPER_ROLE, AUTHOR_ROLE, OWNER_ROLE } from "./authorize.js";
import type { Actor } from "../cel/eval.js";
import type { ProcessId } from "../schema/definition.js";

export type AccessKind = "developer" | "owner" | "reader";

/** The role(s) a Developer or Owner list match additionally requires. Either role in the list satisfies Developer, matching `AUTHOR_ROLE`'s own no-code standing beside `DEVELOPER_ROLE`. */
const REQUIRED_ROLES: Record<Exclude<AccessKind, "reader">, readonly string[]> = {
  developer: [DEVELOPER_ROLE, AUTHOR_ROLE],
  owner: [OWNER_ROLE],
};

/**
 * Does `actor` match the `kind` list `processId` holds? Reads the list fresh
 * on every call — no caching, so a membership change or a list edit takes
 * effect on the very next call.
 */
export async function matchesAccessList(actor: Actor, processId: ProcessId, kind: AccessKind, db: SQL = sql): Promise<boolean> {
  const rows = (await db`
    SELECT principal FROM process_access_roles WHERE process_id = ${processId} AND kind = ${kind}
  `) as { principal: string }[];
  if (rows.length === 0) return false;

  const listed = new Set(rows.map((r) => r.principal));
  const identity = [actor.id, ...(await getGroupsForMember(actor.id, db))];
  if (!identity.some((p) => listed.has(p))) return false;

  if (kind === "reader") return true;
  return REQUIRED_ROLES[kind].some((role) => actor.roles.includes(role));
}
