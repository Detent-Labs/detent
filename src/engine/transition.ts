/**
 * Transition executor. A transition — manual or automatic — runs its triggers
 * onExit(source) -> onPath -> onEntry(target), commits {currentStepId,
 * transitionSeq, status} atomically with transitionSeq as the optimistic-
 * concurrency token, and appends one HistoryEntry. Each ordered trigger action
 * is enqueued into the outbox in the same commit transaction, so an action
 * exists iff its transition committed; the outbox worker delivers them.
 *
 * A manual transition advances one path; the engine then runs the instance to
 * rest via resolveAutomatic (automatic-path evaluation), so a returned instance
 * always sits on a manual step, an automatic wait-state, or a terminal step.
 */

import type { SQL } from "bun";
import { sql, createInstance } from "./store.js";
import { idempotencyKey } from "./idempotency.js";
import { buildGuardContext, evalGuard, type Actor } from "../cel/eval.js";
import type { ProcessBody, Instance, HistoryEntry, Action, Step, Path } from "../schema/definition.js";

export class GuardRefused extends Error {
  constructor(pathId: string) {
    super(`guard refused path: ${pathId}`);
    this.name = "GuardRefused";
  }
}

export class ConcurrencyConflict extends Error {
  constructor(instanceId: string, seq: number) {
    super(`concurrency conflict: instance ${instanceId} was not at transitionSeq ${seq}`);
    this.name = "ConcurrencyConflict";
  }
}

/**
 * An automatic cascade re-entered a step it already entered in the same advance.
 * Guards are pure and instance data does not change mid-cascade, so a repeat is
 * a non-terminating loop; the instance is parked on its last committed step and
 * marked `faulted` before this is thrown.
 */
export class AutomaticCascadeLoop extends Error {
  constructor(stepId: string) {
    super(`automatic cascade re-entered step: ${stepId}`);
    this.name = "AutomaticCascadeLoop";
  }
}

/** The actions a transition processes, in trigger order. */
export function orderedTriggerActions(source: Step, path: Path, target: Step): Action[] {
  return [...(source.onExit ?? []), ...(path.onPath ?? []), ...(target.onEntry ?? [])];
}

/**
 * Commit one transition atomically: advance {currentStepId, transitionSeq,
 * status}, append its HistoryEntry, enqueue its ordered actions. Shared by the
 * manual and automatic paths — the only differences are `cause` and whether an
 * `actorId` is recorded (automatic transitions have no acting user).
 */
async function commitTransition(
  instance: Instance,
  path: Path,
  target: Step,
  actions: Action[],
  cause: HistoryEntry["cause"],
  actorId: string | undefined,
  db: SQL,
): Promise<Instance> {
  const nextSeq = instance.transitionSeq + 1;
  const next: Instance = {
    ...instance,
    currentStepId: path.to,
    transitionSeq: nextSeq,
    status: target.terminal ? "completed" : instance.status,
  };
  const entry: HistoryEntry = {
    id: `hist_${crypto.randomUUID()}` as HistoryEntry["id"],
    instanceId: instance.instanceId,
    transitionSeq: nextSeq,
    version: instance.version,
    pathId: path.id,
    fromStepId: instance.currentStepId,
    toStepId: path.to,
    cause,
    ...(actorId !== undefined ? { actorId } : {}),
    at: new Date().toISOString(),
  };

  await db.begin(async (tx) => {
    // Path-scoped commit: write only {currentStepId, transitionSeq, status}, never
    // {data}. A post-commit action writeback jsonb_sets a disjoint {data,<fieldId>}
    // path, so the row lock serializes the two writers with no lost write. Each
    // scalar is wrapped as [v] and read back with ->0 so Bun.sql binds a proper
    // jsonb value (a bare string param would land as a jsonb scalar string).
    const updated = (await tx`UPDATE instances
      SET body = jsonb_set(jsonb_set(jsonb_set(body,
            '{currentStepId}', (${[next.currentStepId]}::jsonb) -> 0),
            '{transitionSeq}', (${[nextSeq]}::jsonb) -> 0),
            '{status}', (${[next.status]}::jsonb) -> 0),
          transition_seq = ${nextSeq}
      WHERE instance_id = ${instance.instanceId} AND transition_seq = ${instance.transitionSeq}
      RETURNING instance_id`) as unknown[];
    if (updated.length === 0) throw new ConcurrencyConflict(instance.instanceId, instance.transitionSeq);
    await tx`INSERT INTO history_entries (id, instance_id, transition_seq, entry)
      VALUES (${entry.id}, ${entry.instanceId}, ${entry.transitionSeq}, ${entry})`;
    for (const a of actions) {
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
        VALUES (${idempotencyKey(instance.instanceId, nextSeq, a.id)}, ${instance.instanceId}, ${nextSeq}, ${a.id}, ${a})`;
    }
  });

  return next;
}

/**
 * Execute a single manual transition, then run the instance to rest. Rejects if
 * the path is not on the current step, is not manual, or its guard is false. A
 * concurrent transition that already advanced the instance makes this one lose
 * (ConcurrencyConflict), leaving no partial write.
 */
export async function executeManualTransition(
  instance: Instance,
  pathId: string,
  body: ProcessBody,
  actor: Actor,
  db: SQL = sql,
): Promise<Instance> {
  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const path = (source.paths ?? []).find((p) => p.id === pathId);
  if (!path) throw new Error(`path not on current step: ${pathId}`);
  if (path.trigger !== "manual") throw new Error(`not a manual path: ${pathId}`);

  if (!evalGuard(path.guard, buildGuardContext(body, instance, actor))) throw new GuardRefused(pathId);

  const target = body.workflow.steps.find((s) => s.id === path.to);
  if (!target) throw new Error(`path target not in body: ${path.to}`);

  const actions = orderedTriggerActions(source, path, target);
  const committed = await commitTransition(instance, path, target, actions, "user", actor.id, db);
  return resolveAutomatic(committed, body, actor, db);
}

/**
 * Create an instance and run it to rest. A freshly created instance whose
 * `initialStep` is all-automatic advances through the cascade before returning;
 * one on a manual step is returned as created. Orchestration lives here so the
 * store stays pure to persistence (createInstance takes no actor and never
 * evaluates a guard).
 */
export async function startInstance(
  body: ProcessBody,
  opts: { processId: Instance["processId"]; version: number },
  actor: Actor,
  db: SQL = sql,
): Promise<Instance> {
  const created = await createInstance(body, opts, db);
  return resolveAutomatic(created, body, actor, db);
}

/**
 * Select the automatic path an all-automatic step takes: paths in ascending
 * `priority`, the first whose guard holds wins. A guardless default sorts last
 * (the authoring invariant gives it the highest priority) and its guard is
 * vacuously true, so plain iteration yields it as the else-branch. Returns null
 * when nothing matches (a wait-state). Pure — no I/O.
 */
export function selectAutomaticPath(step: Step, ctx: Record<string, unknown>): Path | null {
  const autos = (step.paths ?? []).filter((p) => p.trigger === "automatic");
  if (autos.length === 0) return null;
  const ordered = [...autos].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (const p of ordered) if (evalGuard(p.guard, ctx)) return p;
  return null;
}

/** Execute a single automatic transition (path already selected by its guard). */
export async function executeAutomaticTransition(
  instance: Instance,
  path: Path,
  body: ProcessBody,
  db: SQL = sql,
): Promise<Instance> {
  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const target = body.workflow.steps.find((s) => s.id === path.to);
  if (!target) throw new Error(`path target not in body: ${path.to}`);
  const actions = orderedTriggerActions(source, path, target);
  return commitTransition(instance, path, target, actions, "automatic", undefined, db);
}

/**
 * Park a looped instance in an error state: flip status to `faulted` at its
 * current seq. ponytail: a status flip, not a transition — no seq bump and no
 * HistoryEntry (a dedicated fault audit event is deferred; the thrown
 * AutomaticCascadeLoop names the repeated step).
 */
async function markFaulted(instance: Instance, db: SQL): Promise<void> {
  await db`UPDATE instances
    SET body = jsonb_set(body, '{status}', (${["faulted"]}::jsonb) -> 0)
    WHERE instance_id = ${instance.instanceId} AND transition_seq = ${instance.transitionSeq}`;
}

/**
 * Advance an instance to rest by taking automatic paths. While the current step
 * is all-automatic and a guard matches, commit that hop; stop at a manual step,
 * an all-automatic step with no match (a wait-state), or a terminal step. Each
 * entered step is recorded; re-entering one is a non-terminating loop, so the
 * instance is marked `faulted` and AutomaticCascadeLoop is thrown. A no-op when
 * the instance already sits on a resting step.
 */
export async function resolveAutomatic(
  instance: Instance,
  body: ProcessBody,
  actor: Actor,
  db: SQL = sql,
): Promise<Instance> {
  let current = instance;
  const seen = new Set<string>([current.currentStepId]);
  while (true) {
    const step = body.workflow.steps.find((s) => s.id === current.currentStepId);
    if (!step) throw new Error(`current step not in body: ${current.currentStepId}`);
    const paths = step.paths ?? [];
    const allAutomatic = paths.length > 0 && paths.every((p) => p.trigger === "automatic");
    if (step.terminal || !allAutomatic) return current;

    const path = selectAutomaticPath(step, buildGuardContext(body, current, actor));
    if (!path) return current; // wait-state: no guard matched

    current = await executeAutomaticTransition(current, path, body, db);
    if (seen.has(current.currentStepId)) {
      await markFaulted(current, db);
      throw new AutomaticCascadeLoop(current.currentStepId);
    }
    seen.add(current.currentStepId);
  }
}
