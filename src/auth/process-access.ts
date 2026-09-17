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
import { DEVELOPER_ROLE, AUTHOR_ROLE, OWNER_ROLE, ADMIN_ROLE, AuthorizationError } from "./authorize.js";
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

/**
 * The write gate for `addAccessPrincipal`/`deleteAccessPrincipal`, identical
 * for both. `ADMIN_ROLE` always passes. Otherwise the list that GATES the
 * write is not always the list the write TARGETS: a Developer-list match
 * gates a write to either the Developer or the Owner list, while only an
 * Owner-list match gates a write to the Reader list — a Developer who is not
 * also an Owner does not pass this check for a Reader-list write.
 */
async function requireWriteAccess(actor: Actor, processId: ProcessId, kind: AccessKind, db: SQL): Promise<void> {
  if (actor.roles.includes(ADMIN_ROLE)) return;
  const gate: AccessKind = kind === "reader" ? "owner" : "developer";
  if (await matchesAccessList(actor, processId, gate, db)) return;
  throw new AuthorizationError(`actor '${actor.id}' may not write to the '${kind}' access list of process '${processId}'`);
}

/**
 * Adds `principal` to process `processId`'s `kind` list, after
 * `requireWriteAccess` passes. Idempotent: adding an entry already present
 * succeeds and changes nothing (`ON CONFLICT DO NOTHING` against the table's
 * `(process_id, kind, principal)` primary key).
 */
export async function addAccessPrincipal(actor: Actor, processId: ProcessId, kind: AccessKind, principal: string, db: SQL = sql): Promise<void> {
  await requireWriteAccess(actor, processId, kind, db);
  await db`
    INSERT INTO process_access_roles (process_id, kind, principal) VALUES (${processId}, ${kind}, ${principal})
    ON CONFLICT DO NOTHING
  `;
}

/**
 * Deletes `principal` from process `processId`'s `kind` list, after
 * `requireWriteAccess` passes. Idempotent: deleting an absent entry succeeds
 * and changes nothing.
 */
export async function deleteAccessPrincipal(actor: Actor, processId: ProcessId, kind: AccessKind, principal: string, db: SQL = sql): Promise<void> {
  await requireWriteAccess(actor, processId, kind, db);
  await db`
    DELETE FROM process_access_roles WHERE process_id = ${processId} AND kind = ${kind} AND principal = ${principal}
  `;
}

/**
 * The three raw lists `processId` holds, one array of `principal` values per
 * `kind`. A listing, not a match test: unlike `matchesAccessList`, this
 * applies no group resolution and no role filter — it is exactly what the
 * Access surface renders, in one query rather than three.
 */
export async function getAccessLists(processId: ProcessId, db: SQL = sql): Promise<Record<AccessKind, string[]>> {
  const rows = (await db`
    SELECT kind, principal FROM process_access_roles WHERE process_id = ${processId} ORDER BY kind, principal
  `) as { kind: AccessKind; principal: string }[];
  const lists: Record<AccessKind, string[]> = { developer: [], owner: [], reader: [] };
  for (const row of rows) lists[row.kind].push(row.principal);
  return lists;
}

/**
 * The reverse direction of `matchesAccessList`: given one actor, every
 * `processId` whose `kind` list that actor matches, by the same rule
 * `matchesAccessList` applies per process — the actor's identity (own id or
 * a group from `getGroupsForMember`) present on the list, AND the role that
 * `kind` requires (`REQUIRED_ROLES`). `kind` excludes `"reader"`: a Reader
 * match needs no role, but nothing today needs "every process I can read".
 *
 * An actor lacking the required role matches no process at all, checked
 * before the query runs — the same short-circuit `requireWriteAccess`'s
 * `ADMIN_ROLE` check is not, but `matchesAccessList`'s own role gate is.
 */
export async function processesMatchingAccessList(actor: Actor, kind: Exclude<AccessKind, "reader">, db: SQL = sql): Promise<ProcessId[]> {
  if (!REQUIRED_ROLES[kind].some((role) => actor.roles.includes(role))) return [];
  const identity = [actor.id, ...(await getGroupsForMember(actor.id, db))];
  const rows = (await db`
    SELECT DISTINCT process_id AS "processId" FROM process_access_roles
    WHERE kind = ${kind} AND principal = ANY(${db.array(identity, "TEXT")})
    ORDER BY process_id
  `) as { processId: ProcessId }[];
  return rows.map((r) => r.processId);
}
