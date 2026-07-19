/**
 * Subprocess execution: the two engine-internal outbox handlers that make a
 * `subprocess` step live. Both are ordinary registry handlers (dispatched by the
 * outbox worker, at-least-once) that close over `db` and the definition resolvers
 * — they do their own DB work and return an empty patch (no Action.output).
 *
 * spawn (core.spawnSubprocess), enqueued when a parent enters a subprocess step:
 *   resolve the child body per `versionBinding`, seed it from `inputMapping`, and
 *   create the linked child (idempotent on a deterministic child id). A parent no
 *   longer running is skipped; a child left running under a since-cancelled parent
 *   is self-cancelled (cancel/spawn race backstop).
 *
 * return (core.returnSubprocess), enqueued when a child reaches a terminal step:
 *   evaluate the parent subprocess step's `outputMapping` over `child.outcome`/
 *   `child.data`, write it into the parent's data, then advance the parent off the
 *   wait-state. The first hop's guard reads the `child` namespace, so the path is
 *   selected here with child in context and committed directly; the rest runs to
 *   rest normally. Only a parent still parked at the subprocess step is advanced.
 */

import type { SQL } from "bun";
import { createInstance } from "./store.js";
import {
  resolveAutomatic,
  executeAutomaticTransition,
  selectAutomaticPath,
  cancelInstance,
} from "./transition.js";
import { buildGuardContext, evalFieldMap, SYSTEM_ACTOR } from "../cel/eval.js";
import { subprocessChildId } from "./idempotency.js";
import { instance as instanceSchema, type Instance, type ProcessBody, type StepId } from "../schema/definition.js";
import type { ResolveLatestByContract } from "./definitions.js";
import type { ResolveBody } from "./resolution.js";
import { register, type Registry, type HandlerContext } from "./registry.js";
import { SPAWN_ACTION_TYPE, RETURN_ACTION_TYPE } from "./transition.js";

const parseInstance = (raw: unknown): Instance =>
  instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);

async function loadInstance(db: SQL, instanceId: string): Promise<Instance | undefined> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId} LIMIT 1`) as { body: unknown }[];
  return rows.length > 0 ? parseInstance(rows[0].body) : undefined;
}

/** core.spawnSubprocess handler. */
export function makeSpawnHandler(
  db: SQL,
  resolveBody: ResolveBody,
  resolveLatestByContract: ResolveLatestByContract,
): (ctx: HandlerContext) => Promise<unknown> {
  return async (ctx) => {
    const { subprocessStepId, parentSeq } = ctx.config as { subprocessStepId: string; parentSeq: number };
    const parentId = ctx.instanceId;
    const childId = subprocessChildId(parentId, parentSeq, subprocessStepId);

    // Idempotent: a prior delivery already created (and drove) the child.
    const exists = (await db`SELECT 1 FROM instances WHERE instance_id = ${childId} LIMIT 1`) as unknown[];
    if (exists.length > 0) return {};

    const parent = await loadInstance(db, parentId);
    if (!parent || parent.status !== "running") return {}; // parent gone/cancelled while queued

    const parentBody = await resolveBody(parent.processId, parent.version);
    if (!parentBody) throw new Error(`spawn: parent body unresolved: ${parent.processId}@${parent.version}`);
    const step = parentBody.workflow.steps.find((s) => s.id === subprocessStepId);
    if (!step?.subprocess) throw new Error(`spawn: not a subprocess step: ${subprocessStepId}`);
    const spec = step.subprocess;

    // Resolve the child body + version per versionBinding.
    let childVersion: number | undefined;
    let childBody: ProcessBody | undefined;
    if (spec.versionBinding === "pinned") {
      childVersion = spec.pinnedVersion;
      childBody = childVersion !== undefined ? await resolveBody(spec.processId, childVersion) : undefined;
    } else {
      const r = spec.contractRef !== undefined ? await resolveLatestByContract(spec.processId, spec.contractRef) : undefined;
      if (r) ({ version: childVersion, body: childBody } = r);
    }
    if (!childBody || childVersion === undefined) throw new Error(`spawn: child body unresolved for ${spec.processId}`);

    // Seed the child from inputMapping (parent context; targets keyed by child fieldId).
    const childData = evalFieldMap(spec.inputMapping, buildGuardContext(parentBody, parent, SYSTEM_ACTOR)) as Instance["data"];

    const child = await createInstance(
      childBody,
      { processId: spec.processId, version: childVersion, instanceId: childId, data: childData, parent: { instanceId: parentId, stepId: subprocessStepId as StepId } },
      db,
    );
    // Run the child to rest — it may immediately reach a terminal outcome, which
    // enqueues its own return action.
    await resolveAutomatic(child, childBody, SYSTEM_ACTOR, db);

    // Cancel/spawn race backstop: if the parent was cancelled after our status
    // check, its cascade may have queried children before this child existed.
    // Self-cancel the still-running child so nothing is orphaned.
    const parentNow = await loadInstance(db, parentId);
    if (parentNow && parentNow.status !== "running") {
      const childNow = await loadInstance(db, childId);
      if (childNow && childNow.status === "running") await cancelInstance(childNow, childBody, SYSTEM_ACTOR, db, resolveBody);
    }
    return {};
  };
}

/** core.returnSubprocess handler. */
export function makeReturnHandler(db: SQL, resolveBody: ResolveBody): (ctx: HandlerContext) => Promise<unknown> {
  return async (ctx) => {
    const { parentInstanceId, parentStepId, childOutcome } = ctx.config as {
      parentInstanceId: string;
      parentStepId: string;
      childOutcome: string | null;
    };

    const parent = await loadInstance(db, parentInstanceId);
    if (!parent || parent.status !== "running" || parent.currentStepId !== parentStepId) return {}; // not parked here

    const parentBody = await resolveBody(parent.processId, parent.version);
    if (!parentBody) throw new Error(`return: parent body unresolved: ${parent.processId}@${parent.version}`);
    const step = parentBody.workflow.steps.find((s) => s.id === parentStepId);
    if (!step?.subprocess) throw new Error(`return: not a subprocess step: ${parentStepId}`);

    // child namespace: outcome + child data re-keyed fieldId -> key (reuse the
    // guard-context re-keying against the child's own body).
    const childInst = await loadInstance(db, ctx.instanceId);
    if (!childInst) return {};
    const childBody = await resolveBody(childInst.processId, childInst.version);
    if (!childBody) throw new Error(`return: child body unresolved: ${childInst.processId}@${childInst.version}`);
    const child = { outcome: childOutcome, data: buildGuardContext(childBody, childInst, SYSTEM_ACTOR).data };

    // outputMapping: parent context + child namespace -> parent data patch.
    const patch = evalFieldMap(step.subprocess.outputMapping, { ...buildGuardContext(parentBody, parent, SYSTEM_ACTOR), child });

    // Persist the writeback into parent data, gated on the parent still parked
    // here. ponytail: a separate write from the advance commit; a crash between
    // is self-healed on retry (still parked, the merge is idempotent).
    const upd = (await db`UPDATE instances
      SET body = jsonb_set(body, '{data}', coalesce(body->'data', '{}'::jsonb) || ((${[patch]}::jsonb) -> 0))
      WHERE instance_id = ${parentInstanceId} AND body->>'status' = 'running' AND body->>'currentStepId' = ${parentStepId}
      RETURNING instance_id`) as unknown[];
    if (upd.length === 0) return {}; // parent moved/cancelled between load and write

    // Advance off the subprocess step. The exit guards read child.outcome, absent
    // from the standard guard context, so select the first hop here with child in
    // context and commit it directly; the remaining cascade runs to rest.
    const parked = await loadInstance(db, parentInstanceId);
    if (!parked || parked.status !== "running" || parked.currentStepId !== parentStepId) return {};
    const path = selectAutomaticPath(step, { ...buildGuardContext(parentBody, parked, SYSTEM_ACTOR), child });
    if (!path) return {}; // no outcome path matched: stay parked (bounded by a step timer)
    const committed = await executeAutomaticTransition(parked, path, parentBody, db);
    await resolveAutomatic(committed, parentBody, SYSTEM_ACTOR, db);
    return {};
  };
}

/** Register both internal handlers into a registry (used by startEngine). */
export function registerSubprocessHandlers(
  registry: Registry,
  db: SQL,
  resolveBody: ResolveBody,
  resolveLatestByContract: ResolveLatestByContract,
): void {
  register(registry, SPAWN_ACTION_TYPE, { handler: makeSpawnHandler(db, resolveBody, resolveLatestByContract) });
  register(registry, RETURN_ACTION_TYPE, { handler: makeReturnHandler(db, resolveBody) });
}
