/**
 * Per-instance visibility administration for the Runtime API Layer: revoke,
 * restore and grant an actor's sight of an instance.
 */

import type { SQL } from "bun";
import { sql, withTransaction, newInstanceEventId, appendInstanceEvent, appendInstancePrincipals } from "../engine/store.js";
import type { Actor } from "../cel/eval.js";
import { can, AuthorizationError } from "../auth/authorize.js";
import type { InstanceId, InstanceEvent } from "../schema/definition.js";
import { loadInstanceForRead } from "./internal.js";

// ============================================================
// Per-instance visibility administration (instance-visibility-set)
// ============================================================

/** The three visibility operations, distinguished by what each writes. */
export type VisibilityOp = "revoked" | "restored" | "granted";

/**
 * Shared body of `revokeVisibility` / `restoreVisibility` / `grantVisibility`:
 * gate, mutate, record, in one transaction.
 *
 * The gate is the process-scoped `"visibility"` permission against the
 * instance's own process, not a bare `ADMIN_ROLE` check. It answers the same
 * today — `PERMISSION_ROLE` maps it to `ADMIN_ROLE` — and it lets an
 * installation admit a per-process administrator later by writing one grant,
 * with no code change and no scope inside a role string.
 *
 * Loading the instance first is deliberate: the permission names a process,
 * and only the instance knows which one. A caller with no standing therefore
 * learns nothing an unauthorized read would not already tell them, since the
 * load itself is unauthenticated and the refusal follows it.
 */
async function changeVisibility(
  instanceId: InstanceId,
  targetActorId: string,
  actor: Actor,
  op: VisibilityOp,
  db: SQL,
): Promise<void> {
  const { instance } = await loadInstanceForRead(instanceId, db);
  if (!(await can(actor, "visibility", instance.processId, db))) {
    throw new AuthorizationError(`actor '${actor.id}' may not change visibility of instance '${instanceId}'`);
  }
  await withTransaction(db, async (tx) => {
    if (op === "revoked") {
      await tx`INSERT INTO instance_principals_denied (instance_id, actor_id)
        VALUES (${instanceId}, ${targetActorId}) ON CONFLICT DO NOTHING`;
    } else if (op === "restored") {
      await tx`DELETE FROM instance_principals_denied
        WHERE instance_id = ${instanceId} AND actor_id = ${targetActorId}`;
    } else {
      // A grant is an ordinary principal append, so a granted actor is
      // indistinguishable from a participant afterwards. It also lifts any
      // standing revocation: granting someone you are still denying would
      // leave the grant inert and nothing on screen would say why.
      await appendInstancePrincipals(tx, instanceId, [targetActorId]);
      await tx`DELETE FROM instance_principals_denied
        WHERE instance_id = ${instanceId} AND actor_id = ${targetActorId}`;
    }
    await appendInstanceEvent(tx, {
      id: newInstanceEventId(),
      instanceId: instance.instanceId,
      transitionSeq: instance.transitionSeq,
      version: instance.version,
      kind: "visibility.changed",
      payload: { op, actorId: targetActorId, byActorId: actor.id },
      at: new Date().toISOString(),
    } as InstanceEvent);
  });
}

/** Remove one actor's sight of one instance. Names the person, never the principal they matched by. */
export async function revokeVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "revoked", db);
}

/** Undo a revocation, returning the actor to the visibility they had before. */
export async function restoreVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "restored", db);
}

/** Give one actor sight of an instance they never took part in. */
export async function grantVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "granted", db);
}
