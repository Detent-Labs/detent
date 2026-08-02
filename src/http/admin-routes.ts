/**
 * Operator-facing routes behind `system:admin`: outbox listing/counts, the two
 * dead-letter repairs, pending timers, and listing/disabling/enabling local
 * users. Kept out of `routes.ts`, which stays the participant-facing surface.
 * Same framework-agnostic handler shape and `guarded` wrapper as `routes.ts`;
 * each handler resolves the actor then requires `ADMIN_ROLE` before any read
 * or write.
 */
import type { SQL } from "bun";
import { sql, withTransaction } from "../engine/store.js";
import { listOutbox, countOutboxByStatus, listPendingTimers, requeueOutboxRow, discardOutboxRow, getOutboxRow, type OutboxListFilter } from "../engine/admin-queries.js";
import { listUsers, setDisabled } from "../auth/users.js";
import { migrateInstances } from "../engine/migration.js";
import { redactInstance } from "../engine/retention.js";
import { localizedText, type ProcessId, type InstanceId, type LocalizedText } from "../schema/definition.js";
import { MAX_KEY_LENGTH } from "../schema/compile.js";
import { DB_LIST_DATA_SOURCE_TYPE, MAX_DATA_LIST_VALUES } from "../engine/host.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, ADMIN_ROLE, DATALISTS_ROLE, DEVELOPER_ROLE } from "../auth/authorize.js";
import { mapError, RequestShapeError, type HttpResult, type ErrorContext } from "./errors.js";

/** Same credential-passthrough seam as routes.ts::resolveActor. */
async function resolveActor(req: Request, resolver: ActorResolver): Promise<Actor> {
  return resolver(req.headers);
}

/** Same shape as routes.ts::errorContext. */
function errorContext(req: Request): ErrorContext {
  return { method: req.method, path: new URL(req.url).pathname };
}

/** Same shape as routes.ts::guarded. */
async function guarded(req: Request, fn: () => Promise<HttpResult>): Promise<HttpResult> {
  try {
    return await fn();
  } catch (err) {
    return mapError(err, errorContext(req));
  }
}

/** Same rule as routes.ts::parseLimit: a present-but-invalid limit is a request error, not a silent default. */
function parseLimit(url: URL): number | undefined {
  const raw = url.searchParams.get("limit");
  if (raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new RequestShapeError(`limit must be a positive integer, got '${raw}'`);
  return n;
}

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
    const limit = parseLimit(url);
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
    const limit = parseLimit(url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listPendingTimers({ limit, cursor }, db);
    return { status: 200, body: page };
  });
}

export async function handleAdminListUsers(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, ADMIN_ROLE);
    const users = await listUsers(db);
    return { status: 200, body: { items: users } };
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
