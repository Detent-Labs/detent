/**
 * Developer-facing draft routes behind `system:developer`. Kept out of
 * `routes.ts`, which stays the participant-facing surface — same reasoning as
 * `admin-routes.ts`. Same framework-agnostic handler shape and `guarded`
 * wrapper; each handler resolves the actor then requires `DEVELOPER_ROLE`
 * before any read or write.
 */
import type { SQL } from "bun";
import { sql, withTransaction } from "../engine/store.js";
import { getDraft, saveDraft, listDrafts, deleteDraft, markDraftPublished } from "../engine/drafts.js";
import { publishBody, createDefinitionStore } from "../engine/definitions.js";
import { registerMigrationPlan, resolveMigrationPlan, findOrphanKeys } from "../engine/migration.js";
import type { Registry, DataSourceRegistry } from "../engine/registry.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, DEVELOPER_ROLE, PUBLISH_ROLE } from "../auth/authorize.js";
import { mapError, RequestShapeError, type HttpResult, type ErrorContext } from "./errors.js";
import type { ProcessId, ProcessBody, MigrationSpec } from "../schema/definition.js";

/** Shared by every `:version`/`:fromVersion`/`:toVersion` path segment — no existing HTTP handler parses a numeric path param, so this is the one place that convention starts. */
function parseVersion(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new RequestShapeError(`${label} must be an integer`);
  return n;
}

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

export async function handleListDrafts(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    return { status: 200, body: await listDrafts(db) };
  });
}

export async function handleGetDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const draft = await getDraft(processId as ProcessId, db);
    if (!draft) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    return { status: 200, body: draft };
  });
}

export async function handleSaveDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
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
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const removed = await deleteDraft(processId as ProcessId, db);
    if (!removed) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    return { status: 204, body: null };
  });
}

/**
 * Publishes the *persisted* draft, not any body the caller supplies — there is
 * nothing to accept beyond the process id. Requires `DEVELOPER_ROLE` (every
 * studio route does) and, separately, `PUBLISH_ROLE` — `system:developer`
 * implies nothing else, so publishing from Studio stays gated exactly as
 * publishing from anywhere else. `publishBody` and the `base_version` stamp
 * run inside one `withTransaction` so a stamp failure can never leave a
 * published version with an un-stamped draft — the publish itself would roll
 * back too, matching the "both or neither" a caller expects from one HTTP call.
 */
export async function handlePublishDraft(
  processId: string,
  req: Request,
  resolver: ActorResolver,
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    requireRole(actor, PUBLISH_ROLE);
    const draft = await getDraft(processId as ProcessId, db);
    if (!draft) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    const published = await withTransaction(db, async (tx) => {
      const result = await publishBody(processId as ProcessId, draft.body as ProcessBody, registry, dataSourceRegistry, tx);
      await markDraftPublished(processId as ProcessId, result.version, tx);
      return result;
    });
    return {
      status: 200,
      body: { processId: published.processId, version: published.version, definitionHash: published.definitionHash, status: published.status },
    };
  });
}

/** The compiled body `resolveBody` already resolves for engine use — unlike the metadata-only sibling `GET /processes/:processId/versions`, this requires `DEVELOPER_ROLE`. */
export async function handleGetVersionBody(processId: string, versionRaw: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const version = parseVersion(versionRaw, "version");
    const body = await createDefinitionStore(db).resolveBody(processId as ProcessId, version);
    if (!body) return { status: 404, body: { error: { type: "not-found", message: `no published version ${version} for ${processId}` } } };
    return { status: 200, body };
  });
}

/** Reads a registered migration plan. 404 when no plan has ever been registered for the key. */
export async function handleGetMigrationPlan(
  processId: string,
  fromRaw: string,
  toRaw: string,
  req: Request,
  resolver: ActorResolver,
  db: SQL = sql,
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const fromVersion = parseVersion(fromRaw, "fromVersion");
    const toVersion = parseVersion(toRaw, "toVersion");
    const plan = await resolveMigrationPlan(processId as ProcessId, fromVersion, toVersion, db);
    if (!plan) return { status: 404, body: { error: { type: "not-found", message: `no migration plan: ${processId} ${fromVersion}->${toVersion}` } } };
    return { status: 200, body: plan };
  });
}

/** Wraps `registerMigrationPlan` unchanged: free-edits an unapplied plan, rejects once frozen (mapped 409 via `MigrationPlanError`). */
export async function handlePutMigrationPlan(
  processId: string,
  fromRaw: string,
  toRaw: string,
  req: Request,
  resolver: ActorResolver,
  db: SQL = sql,
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const fromVersion = parseVersion(fromRaw, "fromVersion");
    const toVersion = parseVersion(toRaw, "toVersion");
    let spec: unknown;
    try {
      spec = await req.json();
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    await registerMigrationPlan(processId as ProcessId, fromVersion, toVersion, spec as MigrationSpec, db);
    const plan = await resolveMigrationPlan(processId as ProcessId, fromVersion, toVersion, db);
    return { status: 200, body: plan };
  });
}

/** Read-only orphan-key dry run, wrapping `findOrphanKeys` unchanged. Version-keyed, not plan-keyed — the scan is independent of any specific migration target. */
export async function handleGetOrphanKeys(processId: string, versionRaw: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const version = parseVersion(versionRaw, "version");
    const scan = await findOrphanKeys(processId as ProcessId, version, db);
    return { status: 200, body: scan };
  });
}
