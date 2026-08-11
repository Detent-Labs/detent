/**
 * The authoring routes. Kept out of `routes.ts`, which stays the
 * participant-facing surface — same reasoning as `admin-routes.ts`. Same
 * framework-agnostic handler shape, and the same `resolveActor` and `guarded`
 * helpers, imported from `routes.ts` rather than copied.
 *
 * Each handler resolves the actor, then applies one of three gates before any
 * read or write:
 * - `requireAuthoring` (author OR developer) on the four draft routes, the
 *   publish route (beside `PUBLISH_ROLE`) and `GET /registry`.
 * - `requireStudioRead` (those two OR templates) on the two template reads and
 *   the published version body.
 * - `requireRole(actor, DEVELOPER_ROLE)` alone on the two migration-plan
 *   routes and the orphan-key scan.
 */
import type { SQL } from "bun";
import { sql, withTransaction } from "../engine/store.js";
import { getDraft, saveDraft, listDrafts, deleteDraft, markDraftPublished } from "../engine/drafts.js";
import { getTemplate, listTemplates, saveTemplate, deleteTemplate } from "../engine/templates.js";
import { publishBody, createDefinitionStore } from "../engine/definitions.js";
import { registerMigrationPlan, resolveMigrationPlan, findOrphanKeys } from "../engine/migration.js";
import {
  type Registry,
  type DataSourceRegistry,
  type AssignmentRegistry,
} from "../engine/registry.js";
// The org-aware set (static + org.manager-of-starter), not the static-only leaf
// factory of the same name in registry.js. This is the composition root.
import { createDefaultAssignmentRegistry } from "../engine/assignment-strategies.js";
import { describeConfigSchema, type ConfigFieldDescriptor } from "../engine/config-descriptor.js";
import type { ZodTypeAny } from "zod";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, AuthorizationError, DEVELOPER_ROLE, PUBLISH_ROLE, TEMPLATES_ROLE, AUTHOR_ROLE } from "../auth/authorize.js";
import { RequestShapeError, type HttpResult } from "./errors.js";
import { resolveActor, guarded } from "./routes.js";
import type { ProcessId, ProcessBody, MigrationSpec } from "../schema/definition.js";

/** Shared by every `:version`/`:fromVersion`/`:toVersion` path segment — no existing HTTP handler parses a numeric path param, so this is the one place that convention starts. */
function parseVersion(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new RequestShapeError(`${label} must be an integer`);
  return n;
}

/**
 * Either authoring role admits. The whole no-code authoring surface takes it:
 * the four draft routes, the publish route (which separately needs
 * `PUBLISH_ROLE`) and `GET /registry`, whose config-schema descriptions drive
 * the inspector's plugin-config form.
 *
 * Not a general `requireAnyRole`: this names one specific pair, so a later
 * route cannot reach for it and quietly widen itself. The two migration-plan
 * routes and the orphan-key scan deliberately do NOT take it.
 */
function requireAuthoring(actor: { id: string; roles: readonly string[] }): void {
  if (actor.roles.includes(AUTHOR_ROLE) || actor.roles.includes(DEVELOPER_ROLE)) return;
  throw new AuthorizationError(`actor '${actor.id}' lacks required role '${AUTHOR_ROLE}' or '${DEVELOPER_ROLE}'`);
}

/**
 * Any studio role admits. Three reads take it: the two template reads, and
 * the published version body a curator creates a template from. Writing a
 * template still needs `TEMPLATES_ROLE` alone.
 *
 * The same rule as `requireAuthoring` above: this names one specific trio, and
 * a later route may not reach for it to widen itself.
 */
function requireStudioRead(actor: { id: string; roles: readonly string[] }): void {
  if (actor.roles.includes(TEMPLATES_ROLE) || actor.roles.includes(AUTHOR_ROLE) || actor.roles.includes(DEVELOPER_ROLE)) return;
  throw new AuthorizationError(
    `actor '${actor.id}' lacks required role '${TEMPLATES_ROLE}', '${AUTHOR_ROLE}' or '${DEVELOPER_ROLE}'`,
  );
}

export async function handleListDrafts(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireAuthoring(actor);
    return { status: 200, body: await listDrafts(db) };
  });
}

export async function handleGetDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireAuthoring(actor);
    const draft = await getDraft(processId as ProcessId, db);
    if (!draft) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    return { status: 200, body: draft };
  });
}

export async function handleSaveDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireAuthoring(actor);
    let parsed: { body?: unknown; layout?: unknown; revision?: unknown; baseVersion?: unknown };
    try {
      parsed = (await req.json()) as { body?: unknown; layout?: unknown; revision?: unknown; baseVersion?: unknown };
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const saved = await saveDraft(
      processId as ProcessId,
      {
        body: parsed.body,
        layout: parsed.layout,
        revision: parsed.revision as number,
        updatedBy: actor.id,
        // `undefined` and an absent key are the same thing here: leave the stored base alone.
        baseVersion: parsed.baseVersion as number | undefined,
      },
      db,
    );
    return { status: 200, body: saved };
  });
}

export async function handleDeleteDraft(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireAuthoring(actor);
    const removed = await deleteDraft(processId as ProcessId, db);
    if (!removed) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    return { status: 204, body: null };
  });
}

/**
 * Publishes the *persisted* draft, not any body the caller supplies — there is
 * nothing to accept beyond the process id. Needs an authoring role (either one)
 * and, separately, `PUBLISH_ROLE` — neither authoring role implies anything
 * else, so publishing from Studio stays gated exactly as publishing from
 * anywhere else. `publishBody` and the `base_version` stamp
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
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireAuthoring(actor);
    requireRole(actor, PUBLISH_ROLE);
    const draft = await getDraft(processId as ProcessId, db);
    if (!draft) return { status: 404, body: { error: { type: "not-found", message: `no draft: ${processId}` } } };
    const published = await withTransaction(db, async (tx) => {
      const result = await publishBody(processId as ProcessId, draft.body as ProcessBody, registry, dataSourceRegistry, tx, assignmentRegistry);
      await markDraftPublished(processId as ProcessId, result.version, tx);
      return result;
    });
    return {
      status: 200,
      body: { processId: published.processId, version: published.version, definitionHash: published.definitionHash, status: published.status },
    };
  });
}

/**
 * The compiled body `resolveBody` already resolves for engine use, unlike the
 * metadata-only sibling `GET /processes/:processId/versions`.
 *
 * Any studio role admits. A curator creates a template from a published
 * version, so refusing the body would leave the role able to write a template
 * and unable to obtain one — a browser walk caught exactly that. A published
 * body is the one every participant already runs, so it is the safe half of
 * the pair to widen. A draft stays closed to the curator.
 */
export async function handleGetVersionBody(processId: string, versionRaw: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireStudioRead(actor);
    const version = parseVersion(versionRaw, "version");
    const body = await createDefinitionStore(db).resolveBody(processId as ProcessId, version);
    if (!body) return { status: 404, body: { error: { type: "not-found", message: `no published version ${version} for ${processId}` } } };
    return { status: 200, body };
  });
}

/**
 * Reads a registered migration plan. 404 when no plan has ever been registered
 * for the key.
 *
 * `DEVELOPER_ROLE` alone, deliberately: this route and its two siblings below
 * rewrite the state of every running instance on a version, which is not part
 * of the no-code authoring subset `AUTHOR_ROLE` grants.
 */
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

/** Read-only orphan-key dry run, wrapping `findOrphanKeys` unchanged. Version-keyed, not plan-keyed — the scan is independent of any specific migration target. `DEVELOPER_ROLE` alone, for the reason `handleGetMigrationPlan` states. */
export async function handleGetOrphanKeys(processId: string, versionRaw: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, DEVELOPER_ROLE);
    const version = parseVersion(versionRaw, "version");
    const scan = await findOrphanKeys(processId as ProcessId, version, db);
    return { status: 200, body: scan };
  });
}

/**
 * Builds a `type -> descriptor` map for every entry in `reg` whose
 * `configSchema` the converter can represent. An entry with no declared
 * `configSchema`, or one the converter cannot represent, is simply absent —
 * the studio area's plugin-config-form then falls back to its raw JSON
 * textarea for that type.
 */
function describeRegistry(reg: Map<string, { configSchema?: ZodTypeAny }>): Record<string, ConfigFieldDescriptor[]> {
  const schemas: Record<string, ConfigFieldDescriptor[]> = {};
  for (const [type, def] of reg) {
    if (!def.configSchema) continue;
    const descriptor = describeConfigSchema(def.configSchema, type);
    if (descriptor) schemas[type] = descriptor;
  }
  return schemas;
}

/**
 * Read-only view of the running server's three plugin registries: registered
 * action-handler, data-source and assignment-strategy types, by name, plus a
 * browser-consumable config-schema description per type where one exists.
 * The Tools screen renders only the type-name arrays; `actionSchemas` /
 * `dataSourceSchemas` / `assignmentStrategySchemas` serve the studio area's
 * `studio-plugin-config-form` capability instead.
 *
 * Either authoring role admits, because of that second consumer: the
 * plugin-config form is exactly what lets an author configure an action
 * without JSON. The Tools SCREEN stays behind `system:developer` — that gate
 * lives in the studio area's `ROUTE_ROLE` map, not here.
 */
export async function handleGetRegistry(
  req: Request,
  resolver: ActorResolver,
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireAuthoring(actor);
    return {
      status: 200,
      body: {
        actionTypes: [...registry.keys()],
        dataSourceTypes: [...dataSourceRegistry.keys()],
        assignmentStrategyTypes: [...assignmentRegistry.keys()],
        actionSchemas: describeRegistry(registry),
        dataSourceSchemas: describeRegistry(dataSourceRegistry),
        assignmentStrategySchemas: describeRegistry(assignmentRegistry),
      },
    };
  });
}

export async function handleListTemplates(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireStudioRead(actor);
    return { status: 200, body: await listTemplates(db) };
  });
}

export async function handleGetTemplate(templateKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireStudioRead(actor);
    const template = await getTemplate(templateKey, db);
    if (!template) return { status: 404, body: { error: { type: "not-found", message: `no template: ${templateKey}` } } };
    return { status: 200, body: template };
  });
}

export async function handleSaveTemplate(templateKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, TEMPLATES_ROLE);
    let parsed: { body?: unknown; layout?: unknown };
    try {
      parsed = (await req.json()) as { body?: unknown; layout?: unknown };
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    const saved = await saveTemplate(templateKey, { body: parsed.body, layout: parsed.layout, createdBy: actor.id }, db);
    return { status: 200, body: saved };
  });
}

export async function handleDeleteTemplate(templateKey: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, TEMPLATES_ROLE);
    const removed = await deleteTemplate(templateKey, db);
    if (!removed) return { status: 404, body: { error: { type: "not-found", message: `no template: ${templateKey}` } } };
    return { status: 204, body: null };
  });
}
