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
  listInstances,
  getInstanceRecord,
  cancelInstance,
  type InstanceListFilter,
} from "../runtime/api.js";
import { publishBody, listProcesses, listVersions } from "../engine/definitions.js";
import { instanceStatus } from "../schema/definition.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver } from "../auth/resolve.js";
import type { Registry, DataSourceRegistry } from "../engine/registry.js";
import type { Instance, PathId, ProcessId, InstanceId, StepId, ProcessBody } from "../schema/definition.js";
import { mapError, RequestShapeError, type HttpResult } from "./errors.js";

/**
 * The credential handed to an `ActorResolver` is the request's `Headers`
 * unchanged — each resolver reads whatever it needs (`Authorization` for
 * JWT, `X-Actor-Id`/`X-Actor-Roles` for the dev resolver). No
 * resolver-specific field is pre-extracted here.
 */
function extractCredential(req: Request): Headers {
  return req.headers;
}

async function resolveActor(req: Request, resolver: ActorResolver): Promise<Actor> {
  return resolver(extractCredential(req));
}

export async function handleCreateInstance(
  processId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  try {
    const actor = await resolveActor(req, resolver);
    const body = (await req.json()) as { version?: number; data?: Instance["data"] };
    const created = await createProcessInstance(processId as ProcessId, actor, dataSourceRegistry, { version: body.version, data: body.data }, db);
    return { status: 201, body: created };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetInstanceView(
  instanceId: string,
  req: Request,
  resolver: ActorResolver,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  try {
    const actor = await resolveActor(req, resolver);
    const view = await getInstanceView(instanceId as InstanceId, actor, dataSourceRegistry, db);
    return { status: 200, body: view };
  } catch (err) {
    return mapError(err);
  }
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
    const body = (await req.json()) as { pathId: string; data: Instance["data"] };
    const updated = await submitAndTransition(instanceId as InstanceId, body.pathId as PathId, body.data, actor, dataSourceRegistry, db);
    return { status: 200, body: updated };
  } catch (err) {
    // The write already committed before this raised; report the resulting
    // (now-faulted) view instead of an error response — see design.md.
    if (err instanceof AutomaticCascadeLoop && actor) {
      const view = await getInstanceView(instanceId as InstanceId, actor, dataSourceRegistry, db);
      return { status: 200, body: view };
    }
    return mapError(err);
  }
}

export async function handleClaim(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    const actor = await resolveActor(req, resolver);
    const updated = await claimStep(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleRelease(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    const actor = await resolveActor(req, resolver);
    const updated = await releaseClaim(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  } catch (err) {
    return mapError(err);
  }
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

export async function handleListInstances(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    await resolveActor(req, resolver);
    const url = new URL(req.url);
    const filter: InstanceListFilter = {
      processId: (url.searchParams.get("processId") as ProcessId) ?? undefined,
      status: parseStatuses(url),
      currentStepId: (url.searchParams.get("currentStepId") as StepId) ?? undefined,
      startedBy: url.searchParams.get("startedBy") ?? undefined,
      claimedBy: url.searchParams.get("claimedBy") ?? undefined,
      assignedTo: url.searchParams.get("assignedTo") ?? undefined,
    };
    const limit = parseLimit(url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await listInstances(filter, { limit, cursor }, db);
    return { status: 200, body: page };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleInstanceRecord(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    await resolveActor(req, resolver);
    const url = new URL(req.url);
    const limit = parseLimit(url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const page = await getInstanceRecord(instanceId as InstanceId, { limit, cursor }, db);
    return { status: 200, body: page };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleCancel(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    const actor = await resolveActor(req, resolver);
    const updated = await cancelInstance(instanceId as InstanceId, actor, db);
    return { status: 200, body: updated };
  } catch (err) {
    return mapError(err);
  }
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
 * uses, even though publishing itself needs no `Actor` value — the resolver
 * is the one trust boundary this route has, and skipping it would make
 * publish reachable by a caller no resolver would ever accept.
 */
export async function handlePublish(
  req: Request,
  resolver: ActorResolver,
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
  db: SQL = sql,
): Promise<HttpResult> {
  try {
    await resolveActor(req, resolver);
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
  } catch (err) {
    return mapError(err);
  }
}

export async function handleListProcesses(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    await resolveActor(req, resolver);
    return { status: 200, body: await listProcesses(db) };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleListVersions(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    await resolveActor(req, resolver);
    return { status: 200, body: await listVersions(processId as ProcessId, db) };
  } catch (err) {
    return mapError(err);
  }
}
