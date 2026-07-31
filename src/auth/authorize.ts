/**
 * Authorization: gates the two process-admin operations that carried no
 * permission check at all — publish and cancel-any-instance — behind a
 * reserved role on the already-resolved `Actor`. Deliberately separate from
 * `resolve.ts` (credential -> Actor): this only reads `Actor.roles`, which
 * every `ActorResolver` already populates. No policy engine, no role
 * hierarchy — a fixed set of roles, checked directly, same as
 * `Step.assignment.strategy.type`'s single `"static"` check. No role implies
 * another.
 */
import type { Actor } from "../cel/eval.js";

/** Required to call `POST /processes`. */
export const PUBLISH_ROLE = "system:publish";
/** Required to call `POST /instances/:id/cancel`. */
export const CANCEL_ANY_ROLE = "system:cancel-any";
/** Required for `scope=all` on `GET /instances`, `GET /instances/:id/record`, and every `/admin/*` route. */
export const ADMIN_ROLE = "system:admin";
/** Required for every studio route (`/drafts/*`). Implies nothing else — publishing still separately requires `system:publish`. */
export const DEVELOPER_ROLE = "system:developer";
/** Required for every `/reporting/*` route. Implies nothing else: a process owner holding only this cannot publish, administer users, or read the operator's instance list. */
export const REPORTS_ROLE = "system:reports";

/** The resolved Actor lacks a role an operation requires. Distinct from ActorResolutionError (no valid identity at all). */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requireRole(actor: Actor, role: string): void {
  if (!actor.roles.includes(role)) {
    throw new AuthorizationError(`actor '${actor.id}' lacks required role '${role}'`);
  }
}
