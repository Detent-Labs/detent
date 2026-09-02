/**
 * Assignment-candidate groups, backed by the `groups` table
 * (`src/engine/store.ts::initSchema`). Mirrors `src/auth/users.ts`'s own
 * conventions: `db: SQL = sql` default parameters, a `UserSummary`-shaped
 * `GroupSummary` return (or `undefined` for a missing id), keyset pagination.
 *
 * A group's `members` column carries no foreign key, mirroring
 * `auth_users.roles`, not `manager_user_id` (group-based-assignment
 * design.md): an operator may list a member id before that account exists or
 * after it stops existing. The runtime resolution read (`getGroupMembers`)
 * naturally drops both a disabled account and a nonexistent one.
 *
 * Every account write is reachable over HTTP through the `system:admin`-gated
 * `/admin/groups*` routes (`src/http/admin-routes.ts`).
 */
import { SQL } from "bun";
import { z } from "zod";
import { sql } from "../engine/store.js";
import { encodeCursor, decodeCursor } from "../pagination.js";
import { MAX_LIST_LIMIT, type Page } from "../engine/admin-queries.js";
import type { Actor } from "../cel/eval.js";

/** A group's scope: every process, or a named list of processes. Strict on write, lenient on read — mirrors `src/auth/grants.ts`'s scope shape. */
export const groupScope = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }),
  z.object({ type: z.literal("processes"), processIds: z.array(z.string()) }),
]);
export type GroupScope = z.infer<typeof groupScope>;

export interface GroupSummary {
  groupId: string;
  name: string;
  scope: GroupScope;
  members: string[];
}

interface GroupRow {
  group_id: string;
  name: string;
  scope: unknown;
  members: string[];
}

const toSummary = (r: GroupRow): GroupSummary => ({
  groupId: r.group_id,
  name: r.name,
  scope: r.scope as GroupScope,
  members: r.members,
});

export async function createGroup(name: string, scope: GroupScope, db: SQL = sql): Promise<GroupSummary> {
  const groupId = `group_${crypto.randomUUID()}`;
  const rows = (await db`
    INSERT INTO groups (group_id, name, scope, members)
    VALUES (${groupId}, ${name}, ${scope}, ${db.array([], "TEXT")})
    RETURNING group_id, name, scope, members
  `) as GroupRow[];
  return toSummary(rows[0]!);
}

/** Its own copy of the constant `admin-queries.ts` keeps private, mirroring `listUsers`'s own default. */
const DEFAULT_LIST_LIMIT = 50;

/** Groups by name ascending, keyset-paged on `(name, group_id)`, mirroring `listUsers`'s shape. */
export async function listGroups(page: { limit?: number; cursor?: string } = {}, db: SQL = sql): Promise<Page<GroupSummary>> {
  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorName, cursorGroupId] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];
  const rows = (await db`
    SELECT group_id, name, scope, members
    FROM groups
    WHERE (
      ${cursorName ?? null}::text IS NULL
      OR (name, group_id) > (${cursorName ?? null}::text, ${cursorGroupId ?? null}::text)
    )
    ORDER BY name, group_id
    LIMIT ${limit + 1}
  `) as GroupRow[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([last.name, last.group_id]) : undefined;
  return { items: pageRows.map(toSummary), cursor };
}

export async function renameGroup(groupId: string, name: string, db: SQL = sql): Promise<GroupSummary | undefined> {
  const rows = (await db`UPDATE groups SET name = ${name} WHERE group_id = ${groupId} RETURNING group_id, name, scope, members`) as GroupRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/** Replaces the whole member list, matching `setRolesById`'s replace-not-merge semantics. */
export async function setGroupMembers(groupId: string, members: string[], db: SQL = sql): Promise<GroupSummary | undefined> {
  const rows = (await db`UPDATE groups SET members = ${db.array(members, "TEXT")} WHERE group_id = ${groupId} RETURNING group_id, name, scope, members`) as GroupRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

export async function setGroupScope(groupId: string, scope: GroupScope, db: SQL = sql): Promise<GroupSummary | undefined> {
  const rows = (await db`UPDATE groups SET scope = ${scope} WHERE group_id = ${groupId} RETURNING group_id, name, scope, members`) as GroupRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/**
 * The live-resolution read `org.group-members` calls: the group's current
 * member list, filtered to an active `auth_users` account. Returns `[]` when
 * `groupId` names no group — the join alone accounts for that, with no
 * separate existence check.
 *
 * The `JOIN` form is required: `x = ANY(subquery)` is the subquery/IN-semantics
 * form of `ANY` (the subquery returns one row whose column is itself
 * `text[]`), not array-unnesting, and fails against live Postgres with
 * `operator does not exist: text = text[]`. Joining `groups` lets `ANY`
 * unnest the `members` array column directly.
 */
export async function getGroupMembers(groupId: string, db: SQL = sql): Promise<string[]> {
  const rows = (await db`
    SELECT au.user_id
    FROM auth_users au
    JOIN groups g ON g.group_id = ${groupId}
    WHERE au.user_id = ANY(g.members) AND NOT au.disabled
  `) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

/**
 * The reverse of `getGroupMembers`: every group id whose `members` array
 * contains `actorId`. Powers "reports visible to me" (`listMyReports`),
 * which starts from the actor rather than from one already-known report, so
 * it needs this direction and not the forward one.
 */
export async function getGroupsForMember(actorId: string, db: SQL = sql): Promise<string[]> {
  const rows = (await db`SELECT group_id FROM groups WHERE ${actorId} = ANY(members)`) as { group_id: string }[];
  return rows.map((r) => r.group_id);
}

/**
 * The principal set an actor matches by: their own id, every role they hold,
 * and every group they belong to. Resolved from the credential and the group
 * store, never from client input. One function for the three readers that
 * match on it — the `scope=visible` list, the direct instance read
 * (`loadInstanceForActor`) and report sharing (`listMyReports`) — so the
 * three cannot drift.
 */
export async function actorPrincipals(actor: Actor, db: SQL = sql): Promise<string[]> {
  return [actor.id, ...actor.roles, ...(await getGroupsForMember(actor.id, db))];
}

/**
 * Batch-by-ids scope lookup, mirroring `knownUserIds`'s shape. A missing key
 * in the returned map is how a caller detects a nonexistent group id.
 */
export async function getGroupScopes(groupIds: string[], db: SQL = sql): Promise<Map<string, GroupScope>> {
  if (groupIds.length === 0) return new Map();
  const rows = (await db`SELECT group_id, scope FROM groups WHERE group_id = ANY(${db.array(groupIds, "TEXT")})`) as { group_id: string; scope: unknown }[];
  return new Map(rows.map((r) => [r.group_id, r.scope as GroupScope]));
}

/**
 * Batch-by-ids name lookup, mirroring `getGroupScopes`'s shape over the same
 * id set. A missing key in the returned map is how a caller detects a
 * nonexistent group id — read by `resolveFields`' person-field option
 * resolution (`src/runtime/api.ts`), which keeps the id itself as the label
 * for one, so a stale `allowedGroups` entry stays visible.
 */
export async function groupNamesForIds(groupIds: string[], db: SQL = sql): Promise<Map<string, string>> {
  if (groupIds.length === 0) return new Map();
  const rows = (await db`SELECT group_id, name FROM groups WHERE group_id = ANY(${db.array(groupIds, "TEXT")})`) as { group_id: string; name: string }[];
  return new Map(rows.map((r) => [r.group_id, r.name]));
}

/**
 * Every PUBLISHED process whose `allowedGroups` still names `groupId`, an
 * `EXISTS` scan of `definitions` matching `src/http/admin-routes.ts::
 * referencingProcesses`'s shape (task 1.7). Uses the `@>` containment
 * operator, the one existing precedent for this exact check
 * (`src/runtime/api.ts`'s `candidates @> to_jsonb(...)`), rather than the
 * unprecedented `?` existence operator. An absent or empty `allowedGroups`
 * array yields no match, the same as a plain string array.
 */
export async function referencingPublishedProcesses(groupId: string, db: SQL = sql): Promise<string[]> {
  const rows = (await db`
    SELECT process_id AS "processId"
    FROM definitions
    WHERE status = 'published'
      AND (body -> 'allowedGroups') @> to_jsonb(${groupId}::text)
    ORDER BY process_id
  `) as { processId: string }[];
  return rows.map((r) => r.processId);
}

export type DeleteGroupResult = { deleted: true } | { deleted: false; referencedBy: string[] } | undefined;

/**
 * Calls `referencingPublishedProcesses` first; when it returns a non-empty
 * list, deletes nothing and returns that list (the caller turns it into a
 * 409); otherwise attempts the delete: returns `undefined` when no such
 * `groupId` exists, or `{ deleted: true }` when a row existed and was
 * removed.
 */
export async function deleteGroup(groupId: string, db: SQL = sql): Promise<DeleteGroupResult> {
  const referencedBy = await referencingPublishedProcesses(groupId, db);
  if (referencedBy.length > 0) return { deleted: false, referencedBy };
  const rows = (await db`DELETE FROM groups WHERE group_id = ${groupId} RETURNING group_id`) as { group_id: string }[];
  return rows[0] ? { deleted: true } : undefined;
}

/** The bound every write path enforces, mirroring `DISPLAY_NAME_MAX_LENGTH`. */
export const GROUP_NAME_MAX_LENGTH = 200;

export type GroupNameValidation = { ok: true; name: string } | { ok: false; reason: "empty" | "too-long" };

/** Trim-and-bound check a route applies before writing, mirroring `validateDisplayName`'s shape. */
export function validateGroupName(value: string): GroupNameValidation {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > GROUP_NAME_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, name: trimmed };
}
