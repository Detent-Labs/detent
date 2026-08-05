/**
 * Subprocess execution: the two engine-internal outbox handlers that make a
 * `subprocess` step live. Both are ordinary registry handlers (dispatched by the
 * outbox worker, at-least-once) that close over `db` and the definition resolvers
 * — they do their own DB work and return an empty patch (no Action.output).
 *
 * spawn (core.spawnSubprocess), enqueued when a parent enters a subprocess step:
 *   resolve the child body per `versionBinding`, seed it from `inputMapping`, and
 *   create the linked child (idempotent on a deterministic child id — a parent no
 *   longer running when the child does not yet exist is skipped). Driving the
 *   child to rest and the cancel/spawn race backstop (self-cancelling a child left
 *   running under a since-cancelled parent) run on every delivery, not only the
 *   one that created the row: a redelivery that finds the child already created
 *   still performs both, so a crash between creation and either one is completed
 *   by the next delivery instead of stranding the child.
 *
 * return (core.returnSubprocess), enqueued when a child reaches a terminal step:
 *   evaluate the parent subprocess step's `outputMapping` over `child.outcome`/
 *   `child.data`, write it into the parent's data, then advance the parent off the
 *   wait-state. The first hop's guard reads the `child` namespace, so the path is
 *   selected here with child in context and committed directly; the rest runs to
 *   rest normally. Only a parent still parked at the subprocess step is advanced.
 *   Which step that is comes from the child's own `parent` link read at delivery,
 *   and the check, the writeback, and the advance are one transaction holding the
 *   parent row — both are required, and neither alone is sufficient. See the
 *   handler for why.
 */

import type { SQL } from "bun";
import { z } from "zod";
import { createInstance, withTransaction } from "./store.js";
import {
  resolveAutomatic,
  executeAutomaticTransition,
  selectAutomaticPath,
  cancelInstance,
} from "./transition.js";
import { buildGuardContext, evalFieldMap, SYSTEM_ACTOR } from "../cel/eval.js";
import { subprocessChildId } from "./idempotency.js";
import { instance as instanceSchema, type Instance, type InstanceEvent, type ProcessBody, type StepId } from "../schema/definition.js";
import { appendInstanceEvent, newInstanceEventId, makeAssignmentUnresolvedEvent } from "./store.js";
import type { ResolveLatestByContract } from "./definitions.js";
import type { ResolveBody } from "./resolution.js";
import {
  register,
  createDefaultAssignmentRegistry,
  resolveStepAssignment,
  type Registry,
  type HandlerContext,
  type AssignmentRegistry,
} from "./registry.js";
import { SPAWN_ACTION_TYPE, RETURN_ACTION_TYPE } from "./transition.js";

const parseInstance = (raw: unknown): Instance =>
  instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);

async function loadInstance(db: SQL, instanceId: string): Promise<Instance | undefined> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId} LIMIT 1`) as { body: unknown }[];
  return rows.length > 0 ? parseInstance(rows[0].body) : undefined;
}

/** core.spawnSubprocess handler. Registered by `registerSubprocessHandlers` below, its only caller. */
function makeSpawnHandler(
  db: SQL,
  resolveBody: ResolveBody,
  resolveLatestByContract: ResolveLatestByContract,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): (ctx: HandlerContext) => Promise<unknown> {
  return async (ctx) => {
    const { subprocessStepId, parentSeq } = ctx.config as { subprocessStepId: string; parentSeq: number };
    const parentId = ctx.instanceId;
    const childId = subprocessChildId(parentId, parentSeq, subprocessStepId);

    // Obtain the child: a redelivery finding it already created skips only
    // creation, via the same single load that used to just gate an early
    // return. The repairs below still run on the result either way.
    let child: Instance;
    let childBody: ProcessBody;
    const existing = await loadInstance(db, childId);
    if (existing) {
      child = existing;
      const resolved = await resolveBody(existing.processId, existing.version);
      if (!resolved) throw new Error(`spawn: child body unresolved: ${existing.processId}@${existing.version}`);
      childBody = resolved;
    } else {
      const parent = await loadInstance(db, parentId);
      if (!parent || parent.status !== "running") return {}; // parent gone/cancelled while queued

      const parentBody = await resolveBody(parent.processId, parent.version);
      if (!parentBody) throw new Error(`spawn: parent body unresolved: ${parent.processId}@${parent.version}`);
      const step = parentBody.workflow.steps.find((s) => s.id === subprocessStepId);
      if (!step?.subprocess) throw new Error(`spawn: not a subprocess step: ${subprocessStepId}`);
      const spec = step.subprocess;

      // Resolve the child body + version per versionBinding.
      let childVersion: number | undefined;
      let spawnedBody: ProcessBody | undefined;
      if (spec.versionBinding === "pinned") {
        childVersion = spec.pinnedVersion;
        spawnedBody = childVersion !== undefined ? await resolveBody(spec.processId, childVersion) : undefined;
      } else {
        const r = spec.contractRef !== undefined ? await resolveLatestByContract(spec.processId, spec.contractRef) : undefined;
        if (r) ({ version: childVersion, body: spawnedBody } = r);
      }
      if (!spawnedBody || childVersion === undefined) throw new Error(`spawn: child body unresolved for ${spec.processId}`);
      childBody = spawnedBody;

      // Seed the child from inputMapping (parent context; targets keyed by child fieldId).
      // A raising entry — most often reading a parent field the instance never
      // wrote, the ordinary case for an optional field — is total: it is
      // omitted rather than failing the spawn, and recorded on the PARENT.
      const { patch: childData, drops: inputDrops } = evalFieldMap(spec.inputMapping, buildGuardContext(parentBody, parent, SYSTEM_ACTOR));
      const droppedAt = new Date().toISOString();
      const dropEvents: InstanceEvent[] = inputDrops.map((d) => ({
        id: newInstanceEventId(),
        instanceId: parent.instanceId,
        transitionSeq: parent.transitionSeq,
        version: parent.version,
        kind: "mapping.entry-dropped",
        payload: { fieldId: d.fieldId, direction: "input", reason: d.reason },
        at: droppedAt,
      }));

      // Creation is a step entry, so an assignment-bearing initial step carries
      // candidates. Resolved HERE, before the transaction below opens: the child
      // body, its initial step and its seed data are all in hand, and a resolver
      // must not run while a connection and a row lock are held.
      const childInitial = childBody.workflow.steps.find((s) => s.id === childBody.workflow.initialStep);
      const childResolved = childInitial
        ? await resolveStepAssignment(childInitial, assignmentRegistry, {
            id: childId,
            startedBy: undefined,
            data: childData as Instance["data"],
          })
        : undefined;
      // A resolution that produced no candidate is the CHILD's fact, so this
      // event carries the child's id, the child's version and seq 0. It rides
      // createInstance's own event list rather than the parent-scoped dropEvents
      // above, whose entries all carry `instanceId: parent.instanceId`.
      const childEvents: InstanceEvent[] = childResolved?.unresolved && childInitial
        ? [makeAssignmentUnresolvedEvent({
            instanceId: childId as Instance["instanceId"],
            transitionSeq: 0,
            version: childVersion,
            stepId: childInitial.id,
            reason: childResolved.unresolved,
            at: droppedAt,
          })]
        : [];

      // The drop events land on the parent in the same transaction as the
      // child's creation: withTransaction nests as a savepoint inside
      // createInstance's own transaction when `db` is already one (see
      // store.ts::withTransaction), so both commit or roll back together.
      child = await withTransaction(db, async (tx) => {
        const created = await createInstance(
          childBody,
          { processId: spec.processId, version: childVersion, instanceId: childId, data: childData as Instance["data"], parent: { instanceId: parentId, stepId: subprocessStepId as StepId }, assignment: childResolved?.assignment, events: childEvents },
          tx,
        );
        for (const event of dropEvents) await appendInstanceEvent(tx, event);
        return created;
      });
    }

    // Run the child to rest — it may immediately reach a terminal outcome, which
    // enqueues its own return action. Unconditional: a redelivery that finds the
    // child already created still reaches this, completing a drive-to-rest a
    // prior delivery started but crashed before finishing. Already-rested state
    // (terminal, or parked at a non-automatic/wait-state step) makes this a no-op.
    await resolveAutomatic(child, childBody, SYSTEM_ACTOR, db, assignmentRegistry);

    // Cancel/spawn race backstop: if the parent was cancelled after our status
    // check — or, on redelivery, before an earlier delivery reached this point —
    // its cascade may have queried children before this child existed or before
    // this check ran. Self-cancel the still-running child so nothing is orphaned.
    // Unconditional for the same reason as the drive-to-rest above.
    const parentNow = await loadInstance(db, parentId);
    if (parentNow && parentNow.status !== "running") {
      const childNow = await loadInstance(db, childId);
      if (childNow && childNow.status === "running") await cancelInstance(childNow, childBody, SYSTEM_ACTOR, db, resolveBody);
    }
    return {};
  };
}

/** core.returnSubprocess handler. */
export function makeReturnHandler(
  db: SQL,
  resolveBody: ResolveBody,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): (ctx: HandlerContext) => Promise<unknown> {
  return async (ctx) => {
    // The config names the parent instance and the outcome only. Which step of the
    // parent is expected to be parked comes from this child's own `parent` link,
    // read below under the lock; a `parentStepId` left in an older row's config is
    // ignored, so rows enqueued before this handler changed drain unshimmed.
    const { parentInstanceId, childOutcome } = ctx.config as {
      parentInstanceId: string;
      childOutcome: string | null;
    };
    const childId = ctx.instanceId;

    // Both bodies are resolved inside the transaction, from the locked rows. A pin
    // is not known before its row is read, so there is nothing to hoist: a warm-up
    // pre-read would double this handler's row reads on every delivery to shorten a
    // definition-cache miss that, versions being immutable and cached per process,
    // happens about once per (process, version) per process lifetime.
    //
    // One transaction holding the parent row: the parked check, the outputMapping
    // writeback, and the advance off the wait-state all refer to a state nothing
    // else can move between them. A sequence of independent reads cannot give this
    // — a re-check is not a lock, and its residual race resolves to a silent
    // success that marks the row delivered and loses the child's result.
    const advance = await withTransaction(db, async (tx) => {
      const rows = (await tx`SELECT body FROM instances WHERE instance_id = ${parentInstanceId} LIMIT 1 FOR UPDATE`) as { body: unknown }[];
      if (rows.length === 0) return null;
      const parent = parseInstance(rows[0].body);
      if (parent.status !== "running") return null;

      // The child row is the authority on which step spawned it — only the child
      // knows that. Resolving the parent's current step and assuming it is the
      // right one answers a different question, and would apply a *different*
      // subprocess step's outputMapping to this child's result.
      const childInst = await loadInstance(tx, childId);
      if (!childInst?.parent) return null; // child gone, or no link: nothing to return to
      const parentStepId = childInst.parent.stepId;
      // Under the lock this is a fact, not a possibly-stale reading: the parent
      // legitimately moved on (an authored path, a cancel). A no-op, not a failure.
      if (parent.currentStepId !== parentStepId) return null;

      const parentBody = await resolveBody(parent.processId, parent.version);
      if (!parentBody) throw new Error(`return: parent body unresolved: ${parent.processId}@${parent.version}`);
      const step = parentBody.workflow.steps.find((s) => s.id === parentStepId);
      // Parked at the linked step, and that step is not a subprocess step: a
      // contradiction the engine surfaces rather than swallows.
      if (!step?.subprocess) throw new Error(`return: not a subprocess step: ${parentStepId}`);

      // child namespace: outcome + child data re-keyed fieldId -> key (reuse the
      // guard-context re-keying against the child's own body).
      const childBody = await resolveBody(childInst.processId, childInst.version);
      if (!childBody) throw new Error(`return: child body unresolved: ${childInst.processId}@${childInst.version}`);
      const child = { outcome: childOutcome, data: buildGuardContext(childBody, childInst, SYSTEM_ACTOR).data };

      // outputMapping: parent context + child namespace -> parent data patch.
      // Total per entry, like inputMapping: a raising entry is omitted, not
      // fatal, and recorded on the parent in this same locked transaction.
      const { patch, drops: outputDrops } = evalFieldMap(step.subprocess.outputMapping, { ...buildGuardContext(parentBody, parent, SYSTEM_ACTOR), child });
      if (outputDrops.length > 0) {
        const droppedAt = new Date().toISOString();
        for (const d of outputDrops) {
          await appendInstanceEvent(tx, {
            id: newInstanceEventId(),
            instanceId: parent.instanceId,
            transitionSeq: parent.transitionSeq,
            version: parent.version,
            kind: "mapping.entry-dropped",
            payload: { fieldId: d.fieldId, direction: "output", reason: d.reason },
            at: droppedAt,
          });
        }
      }

      // Persist the writeback into parent data. The `currentStepId` gate is
      // redundant under the lock and kept as a belt — it costs nothing.
      const upd = (await tx`UPDATE instances
        SET body = jsonb_set(body, '{data}', coalesce(body->'data', '{}'::jsonb) || ((${[patch]}::jsonb) -> 0))
        WHERE instance_id = ${parentInstanceId} AND body->>'status' = 'running' AND body->>'currentStepId' = ${parentStepId}
        RETURNING instance_id`) as unknown[];
      if (upd.length === 0) return null;

      // Advance off the subprocess step. The exit guards read child.outcome, absent
      // from the standard guard context, so select the first hop here with child in
      // context and commit it directly. The written-back data is merged in locally
      // — the same shallow merge the UPDATE applied — so the guards and any deadline
      // timer armed on entry see it.
      const parked: Instance = { ...parent, data: { ...parent.data, ...patch } as Instance["data"] };
      const path = selectAutomaticPath(step, { ...buildGuardContext(parentBody, parked, SYSTEM_ACTOR), child });
      if (!path) {
        // No outcome path matched: the writeback above already committed, but
        // nothing advances the parent off this step. The `child` namespace is
        // scoped to this one delivery — no later re-resolution can ever
        // recompute it and retry the match — so record the fact rather than
        // let it disappear silently (the timer.unarmed precedent).
        const event: InstanceEvent = {
          id: newInstanceEventId(),
          instanceId: parent.instanceId,
          transitionSeq: parent.transitionSeq,
          version: parent.version,
          kind: "subprocess.outcome-unmatched",
          payload: { stepId: parentStepId, outcome: childOutcome },
          at: new Date().toISOString(),
        };
        await appendInstanceEvent(tx, event);
        return null; // stay parked (bounded by a step timer, if declared)
      }
      // The one path that resolves under a row lock: the parked step and the
      // matched path are both derived from the row read `FOR UPDATE` above, so
      // hoisting resolution above the lock would need an optimistic pre-read
      // plus a sequence re-check on entry. No resolver shipped today performs
      // I/O, so the lock is held no longer than before.
      const committed = await executeAutomaticTransition(parked, path, parentBody, tx, assignmentRegistry);
      return { committed, parentBody };
    });

    // The remaining cascade runs to rest on committed state, off the lock: it is
    // guard-driven over data no longer in flux, and holding the row across it would
    // extend the lock for no gain.
    if (advance) await resolveAutomatic(advance.committed, advance.parentBody, SYSTEM_ACTOR, db, assignmentRegistry);
    return {};
  };
}

// Config shapes the engine itself synthesizes at transition.ts:251 and :276 —
// declared so a forged config reaching either handler (defense in depth behind
// the write-path reserved-prefix ban; see compile.ts::checkReservedActionPrefix
// and registry-check.ts::checkActionRegistry) is rejected on shape rather than
// accepted as author-controlled `unknown`.
const spawnConfigSchema = z.object({ subprocessStepId: z.string(), parentSeq: z.number() });
const returnConfigSchema = z.object({ parentInstanceId: z.string(), childOutcome: z.string().nullable() });

/** Register both internal handlers into a registry (used by startEngine). */
export function registerSubprocessHandlers(
  registry: Registry,
  db: SQL,
  resolveBody: ResolveBody,
  resolveLatestByContract: ResolveLatestByContract,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): void {
  register(registry, SPAWN_ACTION_TYPE, {
    handler: makeSpawnHandler(db, resolveBody, resolveLatestByContract, assignmentRegistry),
    configSchema: spawnConfigSchema,
  });
  register(registry, RETURN_ACTION_TYPE, {
    handler: makeReturnHandler(db, resolveBody, assignmentRegistry),
    configSchema: returnConfigSchema,
  });
}
