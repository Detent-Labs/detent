/**
 * Authorization: gates the two process-admin operations that carried no
 * permission check at all — publish and cancel-any-instance — behind a
 * reserved role on the already-resolved `Actor`. Deliberately separate from
 * `resolve.ts` (credential -> Actor): this only reads `Actor.roles`, which
 * every `ActorResolver` already populates. No policy engine, no role
 * hierarchy — two fixed roles, checked directly, same as
 * `Step.assignment.strategy.type`'s single `"static"` check.
 */
import type { Actor } from "../cel/eval.js";

/** Required to call `POST /processes`. */
export const PUBLISH_ROLE = "system:publish";
/** Required to call `POST /instances/:id/cancel`. */
export const CANCEL_ANY_ROLE = "system:cancel-any";

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
