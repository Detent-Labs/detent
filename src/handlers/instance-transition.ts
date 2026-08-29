/**
 * `instance.transition` action handler: drives an instance that already
 * exists along one named manual path, closing the write half of the pattern
 * `instance.query` opened. It reads the target instance's id out of the
 * ACTING instance's own data, loads that instance, and drives it through
 * `executeManualTransition` as `SYSTEM_ACTOR` — never as the participant
 * whose submission enqueued the delivery.
 *
 * Every one of the config's three keys is a flat `z.string()`, never the
 * branded `processId`/`fieldId`/`pathId` schemas: a pattern-constrained
 * property takes `config-descriptor.ts`'s generated form back to the raw JSON
 * textarea (see design.md). Referential validity is checked at publish
 * (`validateInstanceTransitionReferences`, `validateCrossProcessReadGrant`)
 * and, for what publish cannot pin down (the target's live step), here on
 * delivery.
 */

import { z } from "zod";
import { SYSTEM_ACTOR } from "../cel/eval.js";
import { PermanentError } from "../engine/outbox.js";
import { loadInstance, newInstanceEventId } from "../engine/store.js";
import { executeManualTransition, GuardRefused, ConcurrencyConflict } from "../engine/transition.js";
import { createDefinitionStore } from "../engine/definitions.js";
import type { FieldId, InstanceEvent, PathId } from "../schema/definition.js";
import {
  createDefaultAssignmentRegistry,
  INSTANCE_TRANSITION_ACTION_TYPE,
  type HandlerContext,
  type HandlerDef,
} from "../engine/registry.js";

export { INSTANCE_TRANSITION_ACTION_TYPE };

export const instanceTransitionConfigSchema = z.object({
  processId: z.string(),
  instanceIdField: z.string(),
  pathId: z.string(),
});
export type InstanceTransitionConfig = z.infer<typeof instanceTransitionConfigSchema>;

/**
 * The redelivery guard (`runtime-events`'s "A redelivery moves the target at
 * most once"): does the target already carry an `instance.transitioned-by-
 * action` event for this delivery's idempotency key? Runs BEFORE the
 * current-step/status checks below — without that ordering a redelivery of a
 * successful transition is indistinguishable from a collision with another
 * acting instance (see design.md).
 *
 * One query, filtered to this target instance; the payload key is not
 * indexed (`instance_events_instance_idx` covers the instance alone), so this
 * scans one instance's own event rows.
 */
async function alreadyTransitioned(db: HandlerContext["db"], targetInstanceId: string, idempotencyKey: string): Promise<boolean> {
  const rows = (await db`SELECT 1 FROM instance_events
    WHERE instance_id = ${targetInstanceId}
      AND kind = 'instance.transitioned-by-action'
      AND event->'payload'->>'idempotencyKey' = ${idempotencyKey}
    LIMIT 1`) as unknown[];
  return rows.length > 0;
}

async function instanceTransitionHandler(ctx: HandlerContext): Promise<unknown> {
  const config = instanceTransitionConfigSchema.parse(ctx.config);

  const acting = await loadInstance(ctx.db, ctx.instanceId);
  if (!acting) throw new PermanentError(`instance.transition: acting instance unresolved: ${ctx.instanceId}`);

  const targetInstanceId = acting.data[config.instanceIdField as FieldId];
  if (typeof targetInstanceId !== "string" || targetInstanceId.length === 0) {
    throw new PermanentError(`instance.transition: field '${config.instanceIdField}' on the acting instance holds no instance id`);
  }

  const target = await loadInstance(ctx.db, targetInstanceId);
  if (!target) {
    throw new PermanentError(`instance.transition: target instance '${targetInstanceId}' does not load`);
  }
  if (target.processId !== config.processId) {
    throw new PermanentError(
      `instance.transition: target instance '${targetInstanceId}' belongs to process '${target.processId}', not '${config.processId}'`,
    );
  }

  // The redelivery lookup runs before the current-step/status checks: a
  // redelivery of a committed transition must succeed silently, not read as
  // the target having "already moved on" to a collision.
  if (await alreadyTransitioned(ctx.db, targetInstanceId, ctx.idempotencyKey)) {
    return {};
  }

  if (target.status !== "running") {
    throw new PermanentError(`instance.transition: target instance '${targetInstanceId}' is not running (status '${target.status}')`);
  }

  const { resolveBody } = createDefinitionStore(ctx.db);
  const targetBody = await resolveBody(target.processId, target.version);
  if (!targetBody) {
    throw new PermanentError(`instance.transition: target instance body unresolved: ${target.processId}@${target.version}`);
  }

  const currentStep = targetBody.workflow.steps.find((s) => s.id === target.currentStepId);
  if (!currentStep) {
    throw new PermanentError(`instance.transition: target's current step '${target.currentStepId}' is not in its body`);
  }
  const path = (currentStep.paths ?? []).find((p) => p.id === config.pathId);
  if (!path) {
    throw new PermanentError(`instance.transition: path '${config.pathId}' is not declared on the target's current step '${target.currentStepId}'`);
  }
  if (path.trigger !== "manual") {
    throw new PermanentError(`instance.transition: path '${config.pathId}' is not a manual path`);
  }

  const event: InstanceEvent = {
    id: newInstanceEventId(),
    instanceId: target.instanceId,
    transitionSeq: target.transitionSeq + 1,
    version: target.version,
    kind: "instance.transitioned-by-action",
    payload: {
      byInstanceId: acting.instanceId,
      actionId: ctx.action.id,
      idempotencyKey: ctx.idempotencyKey,
      pathId: config.pathId as PathId,
    },
    at: new Date().toISOString(),
  };

  // One registry per delivery, shared by the transition call — the
  // single-construction shape `process-start.ts` uses.
  const assignmentRegistry = createDefaultAssignmentRegistry();
  try {
    await executeManualTransition(target, config.pathId, targetBody, SYSTEM_ACTOR, ctx.db, undefined, assignmentRegistry, [event]);
  } catch (e) {
    if (e instanceof GuardRefused) {
      throw new PermanentError(`instance.transition: the guard on path '${config.pathId}' refused`);
    }
    if (e instanceof ConcurrencyConflict) {
      throw new PermanentError(`instance.transition: lost a concurrent race to move target '${targetInstanceId}' on path '${config.pathId}'`);
    }
    throw e;
  }

  return {};
}

export const instanceTransitionHandlerDef: HandlerDef = {
  handler: instanceTransitionHandler,
  configSchema: instanceTransitionConfigSchema,
};
