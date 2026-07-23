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
} from "../runtime/api.js";
import type { Actor } from "../cel/eval.js";
import type { ActorResolver, DevHeaderCredential } from "../auth/resolve.js";
import type { Instance, PathId, ProcessId, InstanceId } from "../schema/definition.js";
import { mapError, type HttpResult } from "./errors.js";

/**
 * Extract the dev header-based credential from a request — the one concrete
 * `ActorResolver` shipped in core. A resolver expecting a different credential
 * shape (JWT, session cookie, …) needs its own extraction here; this wrapper
 * ships only the dev resolver's convention, matching the "extracts a
 * credential from the request (transport detail)" split in design.md.
 */
function extractCredential(req: Request): DevHeaderCredential {
  return { actorIdHeader: req.headers.get("X-Actor-Id"), actorRolesHeader: req.headers.get("X-Actor-Roles") };
}

async function resolveActor(req: Request, resolver: ActorResolver): Promise<Actor> {
  return resolver(extractCredential(req));
}

export async function handleCreateInstance(processId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    const actor = await resolveActor(req, resolver);
    const body = (await req.json()) as { version?: number; data?: Instance["data"] };
    const created = await createProcessInstance(processId as ProcessId, actor, { version: body.version, data: body.data }, db);
    return { status: 201, body: created };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetInstanceView(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  try {
    const actor = await resolveActor(req, resolver);
    const view = await getInstanceView(instanceId as InstanceId, actor, db);
    return { status: 200, body: view };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleSubmit(instanceId: string, req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  let actor: Actor | undefined;
  try {
    actor = await resolveActor(req, resolver);
    const body = (await req.json()) as { pathId: string; data: Instance["data"] };
    const updated = await submitAndTransition(instanceId as InstanceId, body.pathId as PathId, body.data, actor, db);
    return { status: 200, body: updated };
  } catch (err) {
    // The write already committed before this raised; report the resulting
    // (now-faulted) view instead of an error response — see design.md.
    if (err instanceof AutomaticCascadeLoop && actor) {
      const view = await getInstanceView(instanceId as InstanceId, actor, db);
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
