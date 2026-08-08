/**
 * Operator-facing routes behind `system:admin`: outbox listing/counts, the two
 * dead-letter repairs, pending timers, and the local-account writes — listing,
 * creating, disabling/enabling, assigning roles and a manager, and setting a
 * password. Kept out of `routes.ts`, which stays the participant-facing
 * surface.
 * Same framework-agnostic handler shape as `routes.ts`, and the same
 * `resolveActor`, `errorContext`, `guarded` and `parseLimit` helpers, imported
 * from it rather than copied. Each handler resolves the actor then requires
 * `ADMIN_ROLE` before any read or write.
 */
import type { SQL } from "bun";
import { sql, withTransaction } from "../engine/store.js";
import { listOutbox, countOutboxByStatus, listPendingTimers, requeueOutboxRow, discardOutboxRow, getOutboxRow, MAX_LIST_LIMIT, type OutboxListFilter } from "../engine/admin-queries.js";
import {
  listUsers,
  createUser,
  setDisabled,
  setRolesById,
  setManagerById,
  setPasswordById,
  setDisplayName,
  validateDisplayName,
  DISPLAY_NAME_MAX_LENGTH,
  SelfManagerError,
} from "../auth/users.js";
import { migrateInstances } from "../engine/migration.js";
import { redactInstance } from "../engine/retention.js";
import { localizedText, type ProcessId, type InstanceId, type LocalizedText } from "../schema/definition.js";
import { MAX_KEY_LENGTH } from "../schema/compile.js";
import { DB_LIST_DATA_SOURCE_TYPE, MAX_DATA_LIST_VALUES } from "../engine/host.js";
import { listUiStringOverrides, setUiStringOverride, countUiStringOverrides, uiStringOverrideExists } from "../engine/ui-strings.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, ADMIN_ROLE, DATALISTS_ROLE, DEVELOPER_ROLE } from "../auth/authorize.js";
import { RequestShapeError, type HttpResult } from "./errors.js";
import { resolveActor, guarded, parseLimit } from "./routes.js";

/** Same rejection rule as studio-routes.ts::parseVersion, applied to a request-body field instead of a path segment. */
function parseVersionField(raw: unknown, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new RequestShapeError(`${label} must be an integer`);
  return n;
}

/**
 * `requeueOutboxRow`/`discardOutboxRow` report no row affected for two
 * distinct reasons — the key doesn't exist, or it exists but isn't a dead
 * letter — which the repair itself cannot distinguish. A follow-up read
 * against the same key tells them apart: absent -> 404, present -> 409.
 */
async function notFoundOrConflict(idempotencyKey: string, db: SQL): Promise<HttpResult> {
  const row = await getOutboxRow(idempotencyKey, db);
  if (!row) return { status: 404, body: { error: { type: "not-found", message: `no outbox row: ${idempotencyKey}` } } };
  return {
    status: 409,
    body: { error: { type: "conflict", message: `outbox row '${idempotencyKey}' is not a dead letter (status: ${row.status})` } },
  };
}

export async function handleAdminListOutbox(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const url = new URL(req.url);
    const status = url.searchParams.getAll("status");
    const filter: OutboxListFilter = {
      status: status.length > 0 ? status : undefined,
      instanceId: url.searchParams.get("instanceId") ?? undefined,
    };
    const limit = parseLimit(url, MAX_LIST_LIMIT);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const [page, counts] = await Promise.all([listOutbox(filter, { limit, cursor }, db), countOutboxByStatus(db)]);
    return { status: 200, body: { ...page, counts } };
  });
}

export async function handleAdminOutboxRetry(idempotencyKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const updated = await requeueOutboxRow(idempotencyKey, db);
    return updated ? { status: 200, body: updated } : await notFoundOrConflict(idempotencyKey, db);
  });
}

export async function handleAdminOutboxDiscard(idempotencyKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const updated = await discardOutboxRow(idempotencyKey, db);
    return updated ? { status: 200, body: updated } : await notFoundOrConflict(idempotencyKey, db);
  });
}

export async function handleAdminListTimers(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const url = new URL(req.url);
    const limit = parseLimit(url, MAX_LIST_LIMIT);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listPendingTimers({ limit, cursor }, db);
    return { status: 200, body: page };
  });
}

export async function handleAdminListUsers(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const url = new URL(req.url);
    const limit = parseLimit(url, MAX_LIST_LIMIT);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listUsers({ limit, cursor }, db);
    return { status: 200, body: page };
  });
}

async function handleSetUserDisabled(userId: string, disabled: boolean, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const updated = await setDisabled(userId, disabled, db);
    if (!updated) return { status: 404, body: { error: { type: "not-found", message: `no user: ${userId}` } } };
    return { status: 200, body: updated };
  });
}

/** A role string reaches a JWT claim and an assignment candidate list; both stay bounded. No character set is enforced — cli.ts has written role strings unchecked since stage 7, and a pattern would make an existing row unsavable here. */
const MAX_ROLE_LENGTH = 64;
const MAX_ROLES = 64;

/** Trims each entry and drops duplicates, first occurrence winning. Raises `RequestShapeError` (400) on any shape the route refuses. */
function parseRoles(value: unknown): string[] {
  if (!Array.isArray(value)) throw new RequestShapeError("roles must be an array of strings");
  if (value.length > MAX_ROLES) throw new RequestShapeError(`roles holds at most ${MAX_ROLES} entries`);
  const roles = value.map((entry) => {
    if (typeof entry !== "string") throw new RequestShapeError("roles must be an array of strings");
    const role = entry.trim();
    if (!role) throw new RequestShapeError("a role must not be empty");
    if (role.length > MAX_ROLE_LENGTH) throw new RequestShapeError(`a role is at most ${MAX_ROLE_LENGTH} characters`);
    return role;
  });
  // A Set keeps first-insertion order, so this is the same array the previous
  // seen-Set-plus-push loop produced. First occurrence wins.
  return [...new Set(roles)];
}

/**
 * The self-strip guard runs before the read, so an actor whose own id backs no
 * `auth_users` row still gets the 409: the rule governs the actor, who
 * demonstrably authenticated, not the row. Both non-2xx bodies are returned
 * inline, the way `handleSetUserDisabled` returns its 404 — no error class and
 * no mapping entry is added to `errors.ts`.
 */
export async function handleAdminSetUserRoles(userId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    let body: { roles?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const roles = parseRoles(body.roles);
    if (actor.id === userId && !roles.includes(ADMIN_ROLE)) {
      return { status: 409, body: { error: { type: "self-role-strip", message: `an actor cannot remove ${ADMIN_ROLE} from its own account` } } };
    }
    const updated = await setRolesById(userId, roles, db);
    if (!updated) return { status: 404, body: { error: { type: "not-found", message: `no user: ${userId}` } } };
    return { status: 200, body: updated };
  });
}

/**
 * A body field that must be present and hold something after trimming. Returns
 * the value as sent, not the trimmed form: trimming a password would store a
 * different secret than the operator typed. The caller trims where the stored
 * value should be trimmed, as `email` does.
 */
function requireNonBlank(value: unknown, label: string): string {
  if (typeof value !== "string") throw new RequestShapeError(`${label} must be a string`);
  if (!value.trim()) throw new RequestShapeError(`${label} must not be empty`);
  return value;
}

/**
 * Create a local account. Wraps `createUser` unchanged, the way
 * `handleAdminSetUserRoles` wraps `setRolesById`, and bounds `roles` through
 * the same `parseRoles` that route uses.
 *
 * The 201 body is built here rather than read back: `createUser`'s INSERT sets
 * `email` and `roles` to exactly these values, and `disabled`/`manager_user_id`
 * to their column defaults. A follow-up SELECT would add a round trip to learn
 * what the statement above it just wrote.
 *
 * A duplicate email answers 409 from the column's own UNIQUE constraint. A
 * SELECT ahead of the insert would race a concurrent create for the same
 * address, and the constraint decides the outcome either way.
 */
export async function handleAdminCreateUser(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    let body: { email?: unknown; password?: unknown; roles?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const email = requireNonBlank(body.email, "email").trim();
    const password = requireNonBlank(body.password, "password");
    const roles = body.roles === undefined ? [] : parseRoles(body.roles);

    let created: Awaited<ReturnType<typeof createUser>>;
    try {
      // No display name at creation: the account gets one from `PATCH
      // /admin/users/:id/name`, or keeps its email as the resolved name. One
      // field, one route, rather than a second way to set it.
      created = await createUser(email, password, roles, null, db);
    } catch (err) {
      if (isEmailUniqueViolation(err)) {
        return { status: 409, body: { error: { type: "email-in-use", message: `an account already holds ${email}` } } };
      }
      throw err;
    }
    // `displayName` resolves to the email while `display_name` is NULL, the
    // rule `resolveDisplayName` applies to every other user-returning read.
    return { status: 201, body: { userId: created.userId, email, roles, disabled: false, managerUserId: undefined, displayName: email } };
  });
}

/** Postgres SQLSTATE 23505 on `auth_users.email`'s own UNIQUE constraint. Reads `errno` and the constraint name, for the reason `isManagerForeignKeyViolation` states. */
function isEmailUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { errno?: unknown; constraint?: unknown };
  return e.errno === "23505" && e.constraint === "auth_users_email_key";
}

/**
 * Set an account's password on its holder's behalf. No strength rule runs
 * here: `cli.ts`'s `set-password` has never applied one, and a floor this route
 * alone enforced would refuse a password the CLI still accepts.
 *
 * The write does not revoke a token already issued to that account. No JWT
 * claim derives from the password, so an outstanding one keeps authenticating
 * until it expires. Disable is the control that ends a session at once.
 */
export async function handleAdminSetUserPassword(userId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    let body: { password?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const password = requireNonBlank(body.password, "password");
    const updated = await setPasswordById(userId, password, db);
    if (!updated) return { status: 404, body: { error: { type: "not-found", message: `no user: ${userId}` } } };
    return { status: 200, body: updated };
  });
}

/**
 * Set or clear the account's manager, read by the `org.manager-of-starter`
 * assignment strategy. `{ managerUserId: null }` clears it.
 *
 * Two 400s: a `managerUserId` naming no account, and one equal to `userId`. The
 * self-pointer would name an instance's starter as their own approver — an
 * operator mistake rather than an organizational fact. A cycle between two
 * accounts is NOT refused: the strategy reads one hop and never walks it.
 *
 * The unknown-target 400 comes from the column's own foreign key rather than a
 * pre-read, so a concurrent delete cannot slip between a check and the write.
 */
export async function handleAdminSetUserManager(userId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    let body: { managerUserId?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const raw = body.managerUserId;
    if (raw !== null && typeof raw !== "string") throw new RequestShapeError("managerUserId must be a string or null");
    const managerUserId = raw === null ? null : raw.trim();
    if (managerUserId !== null && !managerUserId) throw new RequestShapeError("managerUserId must not be empty");

    let updated: Awaited<ReturnType<typeof setManagerById>>;
    try {
      updated = await setManagerById(userId, managerUserId, db);
    } catch (err) {
      if (err instanceof SelfManagerError) {
        return { status: 400, body: { error: { type: "self-manager", message: "a user cannot be their own manager" } } };
      }
      // The column's self-reference rejecting an id that backs no account.
      if (isManagerForeignKeyViolation(err)) {
        return { status: 400, body: { error: { type: "unknown-manager", message: `no user: ${managerUserId}` } } };
      }
      throw err;
    }
    if (!updated) return { status: 404, body: { error: { type: "not-found", message: `no user: ${userId}` } } };
    return { status: 200, body: updated };
  });
}

/**
 * Set or clear the account's human-readable name. `{ displayName: null }`
 * clears it, so the resolved value falls back to the account's email.
 *
 * The trim and the 200-character bound come from `validateDisplayName`
 * (`src/auth/users.ts`), not from a check written here: a later self-scoped
 * route calls that same helper rather than re-deriving the bound. This route
 * rejects an empty-after-trim value outright, while `setDisplayName` normalizes
 * one to `NULL` — telling the caller beats silently accepting.
 */
export async function handleAdminSetUserName(userId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    let body: { displayName?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const raw = body.displayName;
    if (raw !== null && typeof raw !== "string") throw new RequestShapeError("displayName must be a string or null");
    const checked = validateDisplayName(raw);
    if (!checked.ok) {
      throw new RequestShapeError(
        checked.reason === "empty" ? "displayName must not be empty" : `displayName is at most ${DISPLAY_NAME_MAX_LENGTH} characters`,
      );
    }

    const updated = await setDisplayName(userId, checked.displayName, db);
    if (!updated) return { status: 404, body: { error: { type: "not-found", message: `no user: ${userId}` } } };
    return { status: 200, body: updated };
  });
}

/**
 * Postgres SQLSTATE 23503 on this column's own constraint. Bun.sql throws an
 * untyped `PostgresError` carrying the SQLSTATE as `errno` (`code` holds
 * `ERR_POSTGRES_SERVER_ERROR`, which is the same for every server error), so the
 * check reads `errno` and the constraint name rather than `code`.
 */
function isManagerForeignKeyViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { errno?: unknown; constraint?: unknown };
  return e.errno === "23503" && e.constraint === "auth_users_manager_user_id_fkey";
}

export async function handleAdminDisableUser(userId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return handleSetUserDisabled(userId, true, req, resolver, db);
}

export async function handleAdminEnableUser(userId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return handleSetUserDisabled(userId, false, req, resolver, db);
}

/** Wraps `migrateInstances` unchanged. No new engine logic: `MigrationPlanError` (e.g. no registered plan) falls through to `mapError`, mapped 409 the same way `PUT /migration-plans/...` already maps it. */
export async function handleAdminRunMigration(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    let body: { processId?: unknown; fromVersion?: unknown; toVersion?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    if (typeof body.processId !== "string" || !body.processId) throw new RequestShapeError("processId is required");
    const fromVersion = parseVersionField(body.fromVersion, "fromVersion");
    const toVersion = parseVersionField(body.toVersion, "toVersion");
    const result = await migrateInstances(body.processId as ProcessId, fromVersion, toVersion, db);
    return { status: 200, body: result };
  });
}

/** Wraps `redactInstance` unchanged. `InstanceRunningError`/`NotFoundError` fall through to `mapError`. */
export async function handleAdminRedactInstance(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const updated = await redactInstance(instanceId as InstanceId, db);
    return { status: 200, body: updated };
  });
}

/* ---------------------------------------------------------------- data lists
 * The `"db.list"` data source's values, maintained without a publish. These
 * routes carry `DATALISTS_ROLE` rather than `ADMIN_ROLE`: the grant is narrow
 * on purpose, so staff who own cost centres cannot also cancel instances.
 * Reads additionally accept `DEVELOPER_ROLE`, which is what lets the studio's
 * data source panel offer the existing keys without a second route.
 */

/** Either role admits a read; neither does not. `requireRole` reports the data list role, the one a maintainer is meant to hold. */
function requireDataListRead(actor: Actor): void {
  if (actor.roles.includes(DEVELOPER_ROLE)) return;
  requireRole(actor, DATALISTS_ROLE);
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new RequestShapeError("request body is not valid JSON");
  }
}

function requireString(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length === 0) throw new RequestShapeError(`${label} is required`);
  if (raw.length > MAX_KEY_LENGTH) throw new RequestShapeError(`${label} exceeds the ${MAX_KEY_LENGTH}-character bound`);
  return raw;
}

interface DataListValueInput {
  value: string;
  label: LocalizedText;
  sortOrder: number;
}

/**
 * Parse and check a whole value set before any write. The size bound and the
 * duplicate rule are checked here rather than per row, so a rejected request
 * writes nothing at all.
 */
function parseValues(raw: unknown): DataListValueInput[] {
  if (!Array.isArray(raw)) throw new RequestShapeError("values must be an array");
  if (raw.length > MAX_DATA_LIST_VALUES) {
    throw new RequestShapeError(`a data list holds at most ${MAX_DATA_LIST_VALUES} values, got ${raw.length}`);
  }
  const seen = new Set<string>();
  return raw.map((entry, i) => {
    const row = entry as { value?: unknown; label?: unknown; sortOrder?: unknown };
    const value = requireString(row.value, `values[${i}].value`);
    if (seen.has(value)) throw new RequestShapeError(`values names '${value}' twice`);
    seen.add(value);
    const parsed = localizedText.safeParse(row.label);
    if (!parsed.success) throw new RequestShapeError(`values[${i}].label must be a localized text object`);
    const sortOrder = row.sortOrder === undefined ? i : Number(row.sortOrder);
    if (!Number.isInteger(sortOrder)) throw new RequestShapeError(`values[${i}].sortOrder must be an integer`);
    return { value, label: parsed.data, sortOrder };
  });
}

/**
 * The published processes whose body declares a `"db.list"` data source naming
 * `listKey`. Serves both the usage report and the delete guard, so the two
 * cannot disagree. A full scan of `definitions` with no supporting index; both
 * callers are admin routes on no instance path (see the design's risk note).
 */
async function referencingProcesses(listKey: string, db: SQL): Promise<{ processId: string; version: number }[]> {
  return (await db`
    SELECT process_id AS "processId", version
    FROM definitions
    WHERE status = 'published'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(body->'dataSources', '[]'::jsonb)) AS ds
        WHERE ds->>'type' = ${DB_LIST_DATA_SOURCE_TYPE} AND ds->'config'->>'listKey' = ${listKey}
      )
    ORDER BY process_id, version
  `) as { processId: string; version: number }[];
}

async function readList(listKey: string, db: SQL): Promise<{ listKey: string; label: string; description: string | null } | undefined> {
  const rows = (await db`SELECT list_key AS "listKey", label, description FROM data_lists WHERE list_key = ${listKey}`) as {
    listKey: string;
    label: string;
    description: string | null;
  }[];
  return rows[0];
}

const notFoundList = (listKey: string): HttpResult => ({
  status: 404,
  body: { error: { type: "not-found", message: `no data list: ${listKey}` } },
});

export async function handleAdminListDataLists(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    requireDataListRead(await resolveActor(req, resolver));
    const items = (await db`
      SELECT l.list_key AS "listKey", l.label, l.description, l.updated_at AS "updatedAt", l.updated_by AS "updatedBy",
             count(v.value) FILTER (WHERE v.active)::int AS "activeValueCount"
      FROM data_lists l
      LEFT JOIN data_list_values v ON v.list_key = l.list_key
      GROUP BY l.list_key
      ORDER BY l.list_key
    `) as unknown[];
    return { status: 200, body: { items } };
  });
}

export async function handleAdminCreateDataList(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DATALISTS_ROLE);
    const body = await readJson(req);
    const listKey = requireString(body.listKey, "listKey");
    const label = requireString(body.label, "label");
    const description = body.description === undefined || body.description === null ? null : String(body.description);
    // The conflict is decided by the insert, not by a preceding read: a
    // read-then-insert pair lets two simultaneous creates of one key past the
    // check, and the loser then surfaces a primary key violation as a 500
    // rather than the 409 this route already has an answer for.
    const inserted = (await db`
      INSERT INTO data_lists (list_key, label, description, updated_by)
      VALUES (${listKey}, ${label}, ${description}, ${actor.id})
      ON CONFLICT (list_key) DO NOTHING
      RETURNING list_key
    `) as unknown[];
    if (inserted.length === 0) {
      return { status: 409, body: { error: { type: "conflict", message: `data list '${listKey}' already exists` } } };
    }
    return { status: 201, body: { listKey, label, description } };
  });
}

export async function handleAdminGetDataList(listKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    requireDataListRead(await resolveActor(req, resolver));
    const list = await readList(listKey, db);
    if (!list) return notFoundList(listKey);
    // Inactive values are reported, not hidden: an operator needs to see what a
    // running instance can still hold.
    const values = (await db`
      SELECT value, label, active, sort_order AS "sortOrder"
      FROM data_list_values WHERE list_key = ${listKey}
      ORDER BY sort_order, value
    `) as unknown[];
    return { status: 200, body: { ...list, values, usedBy: await referencingProcesses(listKey, db) } };
  });
}

export async function handleAdminUpdateDataList(listKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DATALISTS_ROLE);
    const body = await readJson(req);
    const label = requireString(body.label, "label");
    const description = body.description === undefined || body.description === null ? null : String(body.description);
    const rows = (await db`
      UPDATE data_lists SET label = ${label}, description = ${description}, updated_by = ${actor.id}, updated_at = now()
      WHERE list_key = ${listKey}
      RETURNING list_key AS "listKey", label, description
    `) as unknown[];
    if (rows.length === 0) return notFoundList(listKey);
    return { status: 200, body: rows[0] };
  });
}

/**
 * Replace the whole value set. A value the request omits is deactivated, never
 * deleted — that is what keeps a running instance's held value resolvable, and
 * it is why no route deletes a value row. A value the request names again
 * becomes active.
 */
export async function handleAdminPutDataListValues(listKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DATALISTS_ROLE);
    const body = await readJson(req);
    const values = parseValues(body.values);
    if (!(await readList(listKey, db))) return notFoundList(listKey);
    await withTransaction(db, async (tx) => {
      await tx`UPDATE data_list_values SET active = false, updated_by = ${actor.id}, updated_at = now()
        WHERE list_key = ${listKey} AND active`;
      for (const v of values) {
        await tx`INSERT INTO data_list_values (list_key, value, label, active, sort_order, updated_by)
          VALUES (${listKey}, ${v.value}, ${v.label}, true, ${v.sortOrder}, ${actor.id})
          ON CONFLICT (list_key, value) DO UPDATE
          SET label = excluded.label, active = true, sort_order = excluded.sort_order,
              updated_by = excluded.updated_by, updated_at = now()`;
      }
    });
    return { status: 200, body: { listKey, values: values.length } };
  });
}

/** Refuses while a published body references the key, the same shape as the guard that protects a version an instance pins. */
export async function handleAdminDeleteDataList(listKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DATALISTS_ROLE);
    if (!(await readList(listKey, db))) return notFoundList(listKey);
    const usedBy = await referencingProcesses(listKey, db);
    if (usedBy.length > 0) {
      return {
        status: 409,
        body: { error: { type: "conflict", message: `data list '${listKey}' is referenced by ${usedBy.length} published version(s)` } },
      };
    }
    await db`DELETE FROM data_lists WHERE list_key = ${listKey}`; // values follow, ON DELETE CASCADE
    return { status: 200, body: { listKey, deleted: true } };
  });
}

/**
 * A UI-chrome override value: a button label, a heading, a sentence of
 * empty-state prose. Bounded here rather than left to `MAX_REQUEST_BODY_SIZE`,
 * which would permit 8 MiB in one row. The public `GET /ui-strings` route
 * returns this table whole to a caller holding no token, so one admin write
 * would otherwise decide how much every visitor downloads at boot.
 */
export const MAX_OVERRIDE_VALUE_LENGTH = 4096;

/**
 * The whole table's row bound, for the same reason. Three areas carry roughly
 * 250 keys between them across two locales, so 2000 leaves room for the
 * admin/reporting catalog retrofit without leaving the read unbounded.
 */
export const MAX_OVERRIDES = 2000;

/**
 * `area`, `locale` and `key` reuse `requireString`'s `MAX_KEY_LENGTH` bound.
 * `value` is a string or `null` and nothing else: `null` clears the override,
 * and an empty string is refused rather than stored. A stored `""` would
 * resolve ahead of the builtin value — the frontend's
 * `resolveOverride(...) ?? builtin` does not fall back on `""` — and render a
 * blank label, so absence and emptiness must stay distinct.
 */
function parseOverrideValue(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string") throw new RequestShapeError("value must be a string or null");
  if (raw.length === 0) throw new RequestShapeError("value must not be empty; send null to clear the override");
  if (raw.length > MAX_OVERRIDE_VALUE_LENGTH) {
    throw new RequestShapeError(`value exceeds the ${MAX_OVERRIDE_VALUE_LENGTH}-character bound`);
  }
  return raw;
}

/** The admin screen's own read. Same data as the public route, behind the role, so the screen needs no second shape. */
export async function handleAdminListUiStrings(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const overrides = await listUiStringOverrides(db);
    return { status: 200, body: { overrides } };
  });
}

/**
 * One route for both set and clear: `value` a string upserts, `null` deletes.
 *
 * The row bound is checked only for a write that would add a row, so an
 * overwrite and a clear stay possible at the bound. The check and the write are
 * not one transaction; two concurrent admins could cross it by one row. That
 * costs nothing worth a lock, since the bound exists to keep the public read
 * small rather than to enforce an exact count.
 */
export async function handleAdminPutUiString(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const body = await readJson(req);
    const area = requireString(body.area, "area");
    const locale = requireString(body.locale, "locale");
    const key = requireString(body.key, "key");
    const value = parseOverrideValue(body.value);
    if (value !== null && !(await uiStringOverrideExists(area, locale, key, db))) {
      const count = await countUiStringOverrides(db);
      if (count >= MAX_OVERRIDES) {
        throw new RequestShapeError(`the deployment holds at most ${MAX_OVERRIDES} UI string overrides`);
      }
    }
    const written = await setUiStringOverride(area, locale, key, value, actor.id, db);
    return { status: 200, body: { area, locale, key, value, deleted: value === null && written } };
  });
}
