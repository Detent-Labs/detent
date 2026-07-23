/**
 * Framework-agnostic route handlers: `(parsed request) -> Runtime API call ->
 * {status, body}`. No `Request`/`Response` construction — `server.ts` does
 * path/method matching and translates the returned `{status, body}` into a
 * real `Response`. Each handler never throws: every Runtime API Layer error
 * is caught and mapped via `errors.ts`.
 */
import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import { AutomaticCascadeLoop, createProcessInstance, getInstanceView, submitAndTransition } from "../runtime/api.js";
import type { Actor } from "../cel/eval.js";
import type { Instance, PathId, ProcessId, InstanceId } from "../schema/definition.js";
import { mapError, type HttpResult } from "./errors.js";

export async function handleCreateInstance(processId: string, req: Request, db: SQL = sql): Promise<HttpResult> {
  try {
    const body = (await req.json()) as { actor: Actor; version?: number; data?: Instance["data"] };
    const created = await createProcessInstance(processId as ProcessId, body.actor, { version: body.version, data: body.data }, db);
    return { status: 201, body: created };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetInstanceView(instanceId: string, req: Request, db: SQL = sql): Promise<HttpResult> {
  try {
    const url = new URL(req.url);
    const actorId = url.searchParams.get("actorId") ?? "";
    const rolesParam = url.searchParams.get("roles");
    const roles = rolesParam ? rolesParam.split(",") : [];
    const actor: Actor = { id: actorId, roles };
    const view = await getInstanceView(instanceId as InstanceId, actor, db);
    return { status: 200, body: view };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleSubmit(instanceId: string, req: Request, db: SQL = sql): Promise<HttpResult> {
  let actor: Actor | undefined;
  try {
    const body = (await req.json()) as { actor: Actor; pathId: string; data: Instance["data"] };
    actor = body.actor;
    const updated = await submitAndTransition(instanceId as InstanceId, body.pathId as PathId, body.data, body.actor, db);
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
