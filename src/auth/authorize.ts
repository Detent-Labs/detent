/**
 * Authorization: gates the two process-admin operations that carried no
 * permission check at all — publish and cancel-any-instance — behind a
 * reserved role on the already-resolved `Actor`. Deliberately separate from
 * `resolve.ts` (credential -> Actor): this only reads `Actor.roles`, which
 * every `ActorResolver` already populates. No policy engine, no role
 * hierarchy — a fixed set of roles, checked directly, unlike
 * `Step.assignment.strategy.type`, which resolves against the injected
 * `AssignmentRegistry`. No role implies another.
 *
 * `can`/`requirePermission` at the bottom are the process-scoped seam. Six
 * gated operations name one process; each asks through those two rather than
 * through a bare `requireRole`, so a later change to how a grant is stored
 * moves this module alone. Still not an extension point: three fixed
 * permissions in a module-private map, no registry, nothing configurable.
 * ROADMAP.md stage 40 carries the design.
 */
import type { Actor } from "../cel/eval.js";
import type { ProcessId } from "../schema/definition.js";

/** Required to call `POST /processes`. */
export const PUBLISH_ROLE = "system:publish";
/** Required to call `POST /instances/:id/cancel`. */
export const CANCEL_ANY_ROLE = "system:cancel-any";
/** Required for `scope=all` on `GET /instances`, `GET /instances/:id/record`, and every `/admin/*` route. */
export const ADMIN_ROLE = "system:admin";
/** Admits every studio route (`/drafts/*`), and is the ONLY role admitting the two migration-plan routes and the orphan-key scan. Implies nothing else — publishing still separately requires `system:publish`. */
export const DEVELOPER_ROLE = "system:developer";
/** Required for every `/reporting/*` route. Implies nothing else: a process owner holding only this cannot publish, administer users, or read the operator's instance list. */
export const REPORTS_ROLE = "system:reports";
/** Required to write a data list (`/admin/data-lists/*`); reads also accept `DEVELOPER_ROLE`, so the studio can offer the existing keys. Implies nothing else: staff who maintain cost centres must not gain the power to cancel instances. */
export const DATALISTS_ROLE = "system:datalists";
/** Required to write a process template (`PUT`/`DELETE /templates/:key`); reads also accept `DEVELOPER_ROLE` and `AUTHOR_ROLE`, so every author can seed a process from one. Implies nothing else: staff who curate templates must not gain the power to publish a process. */
export const TEMPLATES_ROLE = "system:templates";
/**
 * The no-code authoring subset of the studio surface: the four draft routes,
 * the publish route (beside `PUBLISH_ROLE`), `GET /registry`, the two template
 * reads and the published version body. Two routes outside the studio prefix
 * join it, because studio screens call them — the data list read (the
 * `"db.list"` picker) and the record read for an instance the actor started
 * (the panel beside the Player).
 *
 * Deliberately NOT the two migration-plan routes or the orphan-key scan: those
 * rewrite the state of every running instance on a version, and stay
 * `DEVELOPER_ROLE`-only. Implies nothing else, and nothing implies it —
 * publishing still separately requires `PUBLISH_ROLE`.
 */
export const AUTHOR_ROLE = "system:author";

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

/**
 * A gated operation whose target is one process, named by what the call site
 * asks rather than by the role that answers it today. Exactly three exist:
 * publishing a body, cancelling an instance, and the migration routes. Every
 * other gated operation names no process and keeps `requireRole`.
 */
export type Permission = "publish" | "cancel" | "migrate";

/**
 * The reserved role each permission takes today. Module-private on purpose:
 * nothing outside can read it, replace it, or add an entry, which is what
 * keeps this a direct check rather than the policy extension point the
 * `authorization` capability rules out.
 */
const PERMISSION_ROLE: Record<Permission, string> = {
  publish: PUBLISH_ROLE,
  cancel: CANCEL_ANY_ROLE,
  migrate: DEVELOPER_ROLE,
};

/**
 * May `actor` perform `permission` on the process `processId` names? The whole
 * body is the global-role check that already shipped, so every process answers
 * the same and no caller gains or loses access.
 *
 * `processId` is the seam itself. It reaches no branch today; a scoped grant
 * lands here rather than in the six call sites that hold a process. Callers
 * must not assume it names a process the store already holds — the publish
 * route reads it straight out of an unvalidated request body.
 */
export function can(actor: Actor, permission: Permission, processId: ProcessId): boolean {
  void processId; // no grant carries a scope yet; stage 40's storage half reads this
  return actor.roles.includes(PERMISSION_ROLE[permission]);
}

/** `can` in the throwing shape `requireRole` already gave every HTTP gate. */
export function requirePermission(actor: Actor, permission: Permission, processId: ProcessId): void {
  if (!can(actor, permission, processId)) {
    throw new AuthorizationError(
      `actor '${actor.id}' lacks required role '${PERMISSION_ROLE[permission]}' for process '${processId}'`,
    );
  }
}
