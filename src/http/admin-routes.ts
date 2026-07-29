/**
 * Operator-facing routes behind `system:admin`: outbox listing/counts, the two
 * dead-letter repairs, pending timers, and listing/disabling/enabling local
 * users. Kept out of `routes.ts`, which stays the participant-facing surface.
 * Same framework-agnostic handler shape and `guarded` wrapper as `routes.ts`;
 * each handler resolves the actor then requires `ADMIN_ROLE` before any read
 * or write.
 */
import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import { listOutbox, countOutboxByStatus, listPendingTimers, requeueOutboxRow, discardOutboxRow, getOutboxRow, type OutboxListFilter } from "../engine/admin-queries.js";
import { listUsers, setDisabled } from "../auth/users.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, ADMIN_ROLE } from "../auth/authorize.js";
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
