/**
 * Developer-facing draft routes behind `system:developer`. Kept out of
 * `routes.ts`, which stays the participant-facing surface — same reasoning as
 * `admin-routes.ts`. Same framework-agnostic handler shape and `guarded`
 * wrapper; each handler resolves the actor then requires `DEVELOPER_ROLE`
 * before any read or write.
 */
import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import { getDraft, saveDraft, listDrafts, deleteDraft } from "../engine/drafts.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, DEVELOPER_ROLE } from "../auth/authorize.js";
import { mapError, RequestShapeError, type HttpResult } from "./errors.js";
import type { ProcessId } from "../schema/definition.js";

/** Same credential-passthrough seam as routes.ts::resolveActor. */
async function resolveActor(req: Request, resolver: ActorResolver): Promise<Actor> {
  return resolver(req.headers);
}

/** Same shape as routes.ts::guarded. */
async function guarded(fn: () => Promise<HttpResult>): Promise<HttpResult> {
  try {
    return await fn();
  } catch (err) {
    return mapError(err);
  }
}

export async function handleListDrafts(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    return { status: 200, body: await listDrafts(db) };
  });
}

export async function handleGetDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const draft = await getDraft(processId as ProcessId, db);
    if (!draft) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    return { status: 200, body: draft };
  });
}

export async function handleSaveDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    let parsed: { body?: unknown; layout?: unknown; revision?: unknown };
    try {
      parsed = (await req.json()) as { body?: unknown; layout?: unknown; revision?: unknown };
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const saved = await saveDraft(processId as ProcessId, { body: parsed.body, layout: parsed.layout, revision: parsed.revision as number, updatedBy: actor.id }, db);
    return { status: 200, body: saved };
  });
}

export async function handleDeleteDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const removed = await deleteDraft(processId as ProcessId, db);
    if (!removed) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    return { status: 204, body: null };
  });
}
