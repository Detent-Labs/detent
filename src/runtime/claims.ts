/**
 * Claim lifecycle for the Runtime API Layer: claim, release and delegate a
 * claim on an assignment-bearing step.
 */

import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import {
  claimStep as engineClaimStep,
  releaseClaim as engineReleaseClaim,
  delegateClaim as engineDelegateClaim,
  UnknownDelegateError,
} from "../engine/transition.js";
import type { Actor } from "../cel/eval.js";
import { knownUserIds } from "../auth/users.js";
import { ADMIN_ROLE, AuthorizationError } from "../auth/authorize.js";
import { InstanceNotRunningError, NotFoundError } from "../errors.js";
import type { InstanceId } from "../schema/definition.js";
import { toWriteResult, type InstanceWriteResult } from "./internal.js";

/**
 * Runs an engine claim call and converts its `NotFoundError` (an id that
 * resolves to no instance) into what the actor may see. An `ADMIN_ROLE`
 * holder may read any instance, so the not-found answer tells that caller
 * nothing new. Everyone else gets one authorization refusal that names the
 * actor and the id and nothing else, so it does not reveal whether the id
 * exists. Claim keeps its status-before-authority order for an instance that
 * exists: only the engine's load of the row raises `NotFoundError` here.
 */
async function refuseUnknownInstance<T>(instanceId: InstanceId, actor: Actor, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof NotFoundError && !actor.roles.includes(ADMIN_ROLE)) {
      throw new AuthorizationError(`actor '${actor.id}' may not act on instance '${instanceId}'`);
    }
    throw err;
  }
}

/**
 * Claim the current step of a running instance. Thin delegation to the engine
 * implementation — see `engine/transition.ts::claimStep` for the row-lock,
 * candidate-eligibility, and exclusivity semantics. Answers the write result
 * (`toWriteResult`), never the instance: a claim authorizes no read.
 *
 * `engineClaimStep` no-ops (returns the instance unchanged) rather than
 * throwing when the instance is not running — that no-op exists for internal
 * idempotent re-entry and must stay. A *caller-initiated* claim needs to be
 * told, so this wrapper detects the no-op after the fact: claiming never
 * changes `status`, so a returned instance whose status is not `running` can
 * only mean the no-op branch fired against the row the engine's own row lock
 * read — exact, not a separate unlocked check racing it.
 */
export async function claimStep(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<InstanceWriteResult> {
  const updated = await refuseUnknownInstance(instanceId, actor, () => engineClaimStep(instanceId, actor, db));
  if (updated.status !== "running") throw new InstanceNotRunningError(updated.instanceId, updated.status);
  return toWriteResult(updated);
}

/**
 * Release a claim on the current step of a running instance. Thin delegation
 * to the engine implementation — see `engine/transition.ts::releaseClaim`.
 * Same non-running detection as `claimStep`, for the same reason, and the same
 * write result.
 */
export async function releaseClaim(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<InstanceWriteResult> {
  const updated = await refuseUnknownInstance(instanceId, actor, () => engineReleaseClaim(instanceId, actor, db));
  if (updated.status !== "running") throw new InstanceNotRunningError(updated.instanceId, updated.status);
  return toWriteResult(updated);
}

/**
 * Delegate a claim on the current step of a running instance to a named
 * actor. Delegation to the engine implementation — see
 * `engine/transition.ts::delegateClaim`. Same non-running detection as
 * `claimStep`/`releaseClaim`, for the same reason, and the same write result.
 * `toActorId` is still not checked against `assignment.candidates`: the
 * contract permits delegating outside the candidate set, and the
 * `assignment.delegated` event records exactly that.
 *
 * It IS checked against the local account directory, but only where the
 * delegating actor's own id resolves there. The engine cannot ask whether a
 * deployment uses local accounts — both resolvers can be active at once — so
 * it asks about this delegator instead. On an external identity provider the
 * answer is no and the target check does not run, which keeps this rule from
 * rejecting every delegation in such a deployment. One query answers both
 * halves, so the two facts cannot disagree.
 *
 * The check travels as a callback rather than running here, so the engine can
 * order it after its own claimant check and inside its row lock. Running it
 * first would make a non-claimant's error depend on whether the target exists,
 * turning this call into a directory-enumeration oracle.
 */
export async function delegateClaim(instanceId: InstanceId, actor: Actor, toActorId: string, db: SQL = sql): Promise<InstanceWriteResult> {
  const validateTarget = async (target: string): Promise<void> => {
    const known = await knownUserIds([actor.id, target], db);
    if (known.has(actor.id) && !known.has(target)) throw new UnknownDelegateError(target);
  };
  const updated = await refuseUnknownInstance(instanceId, actor, () => engineDelegateClaim(instanceId, actor, toActorId, db, validateTarget));
  if (updated.status !== "running") throw new InstanceNotRunningError(updated.instanceId, updated.status);
  return toWriteResult(updated);
}
