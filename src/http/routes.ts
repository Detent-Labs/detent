/**
 * Framework-agnostic route handlers: `(parsed request) -> Runtime API call ->
 * {status, body}`. No `Request`/`Response` construction — `server.ts` does
 * path/method matching and translates the returned `{status, body}` into a
 * real `Response`. Each handler never throws: every Runtime API Layer error
 * is caught and mapped via `errors.ts`.
 */
import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import {
  AutomaticCascadeLoop,
  createProcessInstance,
  getInstanceView,
  submitAndTransition,
  claimStep,
  releaseClaim,
  delegateClaim,
  listInstances,
  getInstanceRecord,
  cancelInstance,
  postComment,
  listComments,
  type InstanceListFilter,
} from "../runtime/api.js";
import { publishBody, listProcesses, listVersions } from "../engine/definitions.js";
import { instanceStatus } from "../schema/definition.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, PUBLISH_ROLE, ADMIN_ROLE } from "../auth/authorize.js";
import type { Registry, DataSourceRegistry } from "../engine/registry.js";
import type { Instance, PathId, ProcessId, InstanceId, StepId, ProcessBody } from "../schema/definition.js";
import { mapError, RequestShapeError, type HttpResult, type ErrorContext } from "./errors.js";
import { z } from "zod";

/**
 * Shallow envelope schemas for the two routes that used to cast an unchecked
 * `req.json()` result (`api.ts:59`/`:89` before this change). Deliberately
 * loose on `data`: field-level validation is `validateSubmissionData`'s job,
 * so duplicating it here would create two places to change a rule — see
 * design.md "Zod for the two request bodies, not hand-written checks".
 */
const createInstanceBodySchema = z.object({
  version: z.number().int().positive().optional(),
  data: z.record(z.unknown()).optional(),
});
const delegateBodySchema = z.object({
  toActorId: z.string().min(1),
});
// 10,000 characters is a round, generous bound for a free-text note — see
// design.md "Text validation lives at the HTTP boundary only" for why it has
// no narrower precedent to match (the MAX_*_LENGTH constants in
// schema/compile.ts bound authored process-definition strings, a different
// concern from runtime user text).
const MAX_COMMENT_LENGTH = 10_000;
const commentBodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
});
const submitBodySchema = z.object({
  pathId: z.string(),
  data: z.record(z.unknown()).default({}),
});

/** Parses `req`'s JSON body against `schema`, raising `RequestShapeError` (400) for invalid JSON or a shape mismatch alike — never a bare `ZodError`, which `mapError` maps to 422, the field-validation status, not the request-shape one. */
async function parseJsonBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new RequestShapeError("request body is not valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new RequestShapeError(`request body does not match the expected shape: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * The credential handed to an `ActorResolver` is the request's `Headers`
 * unchanged — each resolver reads whatever it needs (`Authorization` for
 * JWT, `X-Actor-Id`/`X-Actor-Roles` for the dev resolver). No
 * resolver-specific field is pre-extracted here.
 */
async function resolveActor(req: Request, resolver: ActorResolver): Promise<Actor> {
  return resolver(req.headers);
}

/** `req`'s method and path, for `mapError`'s fallback log — an actionable trace needs the request, not just the stack. */
function errorContext(req: Request): ErrorContext {
  return { method: req.method, path: new URL(req.url).pathname };
}

/** Runs `fn`, mapping any thrown error via `mapError` with `req`'s method/path attached. Every handler but `handleSubmit` uses this — it alone needs a non-error branch on `AutomaticCascadeLoop`. */
async function guarded(req: Request, fn: () => Promise<HttpResult>): Promise<HttpResult> {
  try {
    return await fn();
  } catch (err) {
    return mapError(err, errorContext(req));
  }
}

export async function handleCreateInstance(
  processId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const body = await parseJsonBody(req, createInstanceBodySchema);
    const created = await createProcessInstance(processId as ProcessId, actor, dataSourceRegistry, { version: body.version, data: body.data as Instance["data"] | undefined }, db);
    return { status: 201, body: created };
  });
}

export async function handleGetInstanceView(
  instanceId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const view = await getInstanceView(instanceId as InstanceId, actor, dataSourceRegistry, db);
    return { status: 200, body: view };
  });
}

export async function handleSubmit(
  instanceId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  let actor: Actor | undefined;
  try {
    actor = await resolveActor(req, resolver);
    const body = await parseJsonBody(req, submitBodySchema);
    const updated = await submitAndTransition(instanceId as InstanceId, body.pathId as PathId, body.data as Instance["data"], actor, dataSourceRegistry, db);
    return { status: 200, body: updated };
  } catch (err) {
    // The write already committed before this raised; report the resulting
    // (now-faulted) view instead of an error response — see design.md.
    if (err instanceof AutomaticCascadeLoop && actor) {
      const view = await getInstanceView(instanceId as InstanceId, actor, dataSourceRegistry, db);
      return { status: 200, body: view };
    }
    return mapError(err, errorContext(req));
  }
}

export async function handleClaim(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const updated = await claimStep(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  });
}

export async function handleRelease(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const updated = await releaseClaim(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  });
}

export async function handleDelegate(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const body = await parseJsonBody(req, delegateBodySchema);
    const updated = await delegateClaim(instanceId as InstanceId, actor, body.toActorId, db);
    return { status: 200, body: updated };
  });
}

export async function handlePostComment(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const body = await parseJsonBody(req, commentBodySchema);
    const created = await postComment(instanceId as InstanceId, actor, body.text, db);
    return { status: 201, body: created };
  });
}

export async function handleListComments(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const url = new URL(req.url);
    const limit = parseLimit(url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listComments(instanceId as InstanceId, actor, { limit, cursor }, db);
    return { status: 200, body: page };
  });
}

/** `limit=abc` or a `limit` that is not a positive integer is a request error, not a silent default. */
function parseLimit(url: URL): number | undefined {
  const raw = url.searchParams.get("limit");
  if (raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new RequestShapeError(`limit must be a positive integer, got '${raw}'`);
  return n;
}

/** Every repeated `status` value must be a known InstanceStatus; an unknown one is a request error. */
function parseStatuses(url: URL): Instance["status"][] | undefined {
  const raw = url.searchParams.getAll("status");
  if (raw.length === 0) return undefined;
  return raw.map((s) => {
    const parsed = instanceStatus.safeParse(s);
    if (!parsed.success) throw new RequestShapeError(`unknown status '${s}'`);
    return parsed.data;
  });
}

/** An omitted scope resolves to "all" — that is what it has always meant. Any other value is a request error. */
function parseScope(url: URL): "mine" | "all" {
  const raw = url.searchParams.get("scope");
  if (raw === null) return "all";
  if (raw !== "mine" && raw !== "all") throw new RequestShapeError(`unknown scope '${raw}'`);
  return raw;
}

export async function handleListInstances(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const url = new URL(req.url);
    const scope = parseScope(url);
    const assignedTo = url.searchParams.get("assignedTo") ?? undefined;
    // scope=mine derives "mine" from the resolved actor — a caller cannot
    // pair it with its own assignedTo value to see another actor's instances.
    if (scope === "mine" && assignedTo !== undefined) {
      throw new RequestShapeError("scope=mine cannot be combined with an explicit assignedTo");
    }
    if (scope === "all") {
      requireRole(actor, ADMIN_ROLE);
    }
    const filter: InstanceListFilter = {
      processId: (url.searchParams.get("processId") as ProcessId) ?? undefined,
      status: parseStatuses(url),
      currentStepId: (url.searchParams.get("currentStepId") as StepId) ?? undefined,
      startedBy: url.searchParams.get("startedBy") ?? undefined,
      claimedBy: url.searchParams.get("claimedBy") ?? undefined,
      assignedTo: scope === "mine" ? actor.id : assignedTo,
      assignedToRoles: scope === "mine" ? actor.roles : undefined,
    };
    const limit = parseLimit(url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listInstances(filter, { limit, cursor }, db);
    return { status: 200, body: page };
  });
}

export async function handleInstanceRecord(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const url = new URL(req.url);
    const limit = parseLimit(url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await getInstanceRecord(instanceId as InstanceId, actor, { limit, cursor }, db);
    return { status: 200, body: page };
  });
}

export async function handleCancel(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    const updated = await cancelInstance(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  });
}

/**
 * Publish an authored body. `processId` is not part of the hashed
 * `ProcessBody` (see CLAUDE.md's hashing/versioning section), so the request
 * carries it as a sibling field: the caller decides identity — the same
 * `processId` across two calls is a new version of one process, a fresh one
 * mints a new process. Validates against the server's own `registry`, never
 * one the client could supply.
 *
 * Resolves the actor through the same `ActorResolver` seam every other route
 * uses, and additionally requires `PUBLISH_ROLE` on the resolved actor before
 * the request body is even parsed (`src/auth/authorize.ts`) — publish carries
 * no other use for the actor value.
 */
export async function handlePublish(
  req: Request,
  resolver: ActorResolver,
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver);
    requireRole(actor, PUBLISH_ROLE);
    let parsed: { processId?: unknown; body?: unknown };
    try {
      parsed = (await req.json()) as { processId?: unknown; body?: unknown };
    } catch {
      throw new RequestShapeError("request body is not valid JSON");
    }
    if (typeof parsed.processId !== "string" || !parsed.body) {
      throw new RequestShapeError("request body must be { processId: string, body: ProcessBody }");
    }
    const published = await publishBody(parsed.processId as ProcessId, parsed.body as ProcessBody, registry, dataSourceRegistry, db);
    return {
      status: 200,
      body: { processId: published.processId, version: published.version, definitionHash: published.definitionHash, status: published.status },
    };
  });
}

export async function handleListProcesses(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    await resolveActor(req, resolver);
    return { status: 200, body: await listProcesses(db) };
  });
}

export async function handleListVersions(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    await resolveActor(req, resolver);
    return { status: 200, body: await listVersions(processId as ProcessId, db) };
  });
}
