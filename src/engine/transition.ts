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
import { armStepTimers, minFireAt } from "./duration.js";
import { buildGuardContext, evalGuard, SYSTEM_ACTOR, type Actor } from "../cel/eval.js";
import { CANCEL_SINK_STEP_ID, instance as instanceSchema } from "../schema/definition.js";
import type { ProcessBody, Instance, HistoryEntry, Action, Step, Path } from "../schema/definition.js";

/**
 * Engine-owned action types (reserved `core.` prefix, rejected in authored
 * bodies). Enqueued by commitTransition and handled by the registered internal
 * handlers in subprocess.ts. Homed here so subprocess.ts (which imports
 * resolveAutomatic from this module) reuses them without a circular import.
 */
export const SPAWN_ACTION_TYPE = "core.spawnSubprocess";
export const RETURN_ACTION_TYPE = "core.returnSubprocess";

/** Resolve an instance's frozen body from its pin. Injected (see resolution.ts ResolveBody). */
type ResolveBodyFn = (processId: string, version: number) => Promise<ProcessBody | undefined> | ProcessBody | undefined;

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
 * authored (manual/automatic/timer) paths and the synthesized cancel path. The
 * caller supplies `target` (the step entered — its timers are armed), the
 * HistoryEntry `pathId` (null for a synthesized transition with no authored
 * path), the resulting `status`, the `cause`, and an optional `actorId`.
 */
async function commitTransition(
  instance: Instance,
  target: Step,
  pathId: HistoryEntry["pathId"],
  actions: Action[],
  cause: HistoryEntry["cause"],
  status: Instance["status"],
  actorId: string | undefined,
  db: SQL,
): Promise<Instance> {
  const nextSeq = instance.transitionSeq + 1;
  const at = new Date().toISOString();
  // Arm the target step's timers at entry (replacing the source step's, disarming
  // them); next_timer_at is the earliest fireAt for the scheduler's poll.
  const armed = armStepTimers(target, at);
  const nextTimerAt = minFireAt(armed);
  const next: Instance = {
    ...instance,
    currentStepId: target.id,
    transitionSeq: nextSeq,
    status,
    timers: armed,
  };
  const entry: HistoryEntry = {
    id: `hist_${crypto.randomUUID()}` as HistoryEntry["id"],
    instanceId: instance.instanceId,
    transitionSeq: nextSeq,
    version: instance.version,
    pathId,
    fromStepId: instance.currentStepId,
    toStepId: target.id,
    cause,
    ...(actorId !== undefined ? { actorId } : {}),
    at,
  };

  await db.begin(async (tx) => {
    // Path-scoped commit: write {currentStepId, transitionSeq, status, timers} and
    // the next_timer_at column, never {data}. A post-commit action writeback
    // jsonb_sets a disjoint {data,<fieldId>} path, so the row lock serializes the
    // two writers with no lost write. Each scalar/array is wrapped as [v] and read
    // back with ->0 so Bun.sql binds a proper jsonb value (a bare param would land
    // as a jsonb scalar string).
    const updated = (await tx`UPDATE instances
      SET body = jsonb_set(jsonb_set(jsonb_set(jsonb_set(body,
            '{currentStepId}', (${[next.currentStepId]}::jsonb) -> 0),
            '{transitionSeq}', (${[nextSeq]}::jsonb) -> 0),
            '{status}', (${[next.status]}::jsonb) -> 0),
            '{timers}', (${[armed]}::jsonb) -> 0),
          transition_seq = ${nextSeq},
          next_timer_at = ${nextTimerAt}
      WHERE instance_id = ${instance.instanceId} AND transition_seq = ${instance.transitionSeq}
      RETURNING instance_id`) as unknown[];
    if (updated.length === 0) throw new ConcurrencyConflict(instance.instanceId, instance.transitionSeq);
    await tx`INSERT INTO history_entries (id, instance_id, transition_seq, entry)
      VALUES (${entry.id}, ${entry.instanceId}, ${entry.transitionSeq}, ${entry})`;
    for (const a of actions) {
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
        VALUES (${idempotencyKey(instance.instanceId, nextSeq, a.id)}, ${instance.instanceId}, ${nextSeq}, ${a.id}, ${a})`;
    }
    // Subprocess spawn: entering a subprocess step enqueues a spawn action,
    // dispatched post-commit by the internal handler (child-body resolution +
    // inputMapping + linked child creation). Idempotent via the deterministic
    // child id the handler derives from (instance, nextSeq, step).
    if (target.type === "subprocess") {
      const spawn = { id: `action_spawn_${target.id}`, type: SPAWN_ACTION_TYPE, config: { subprocessStepId: target.id, parentSeq: nextSeq } };
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
        VALUES (${idempotencyKey(instance.instanceId, nextSeq, spawn.id)}, ${instance.instanceId}, ${nextSeq}, ${spawn.id}, ${spawn})`;
    }
    // Subprocess return: a child reaching a terminal step enqueues a return
    // action that wakes the parked parent (outputMapping writeback + advance).
    if (target.terminal && instance.parent) {
      const ret = {
        id: `action_return_${instance.instanceId}`,
        type: RETURN_ACTION_TYPE,
        config: { parentInstanceId: instance.parent.instanceId, parentStepId: instance.parent.stepId, childOutcome: target.outcome ?? null },
      };
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
        VALUES (${idempotencyKey(instance.instanceId, nextSeq, ret.id)}, ${instance.instanceId}, ${nextSeq}, ${ret.id}, ${ret})`;
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
  const status = target.terminal ? "completed" : instance.status;
  const committed = await commitTransition(instance, target, path.id, actions, "user", status, actor.id, db);
  return resolveAutomatic(committed, body, actor, db);
}

/**
 * Cancel a running instance: a synthesized hidden-path transition to the
 * publish-injected cancel-sink. Takes an already-rehydrated instance (the caller
 * loads + pin-checks it, as with executeManualTransition/fireTimer). The source
 * step's `onExit` is NOT run; the ordered actions are `[source.onCancel,
 * sink.onEntry]`. Records one HistoryEntry with `cause: "cancel"`, `pathId: null`,
 * `toStepId: CANCEL_SINK_STEP_ID`, flips status to `cancelled`, and advances
 * transitionSeq (the OCC token, so a cancel racing a normal transition from the
 * same seq resolves to exactly one winner — the loser gets ConcurrencyConflict).
 * A no-op — no HistoryEntry, no seq bump — on an instance that is not `running`.
 * Downward-only subprocess propagation: when `resolveBody` is supplied, after the
 * parent commits its cancel this recursively cancels its active (running) children
 * (found by the `parent` link), depth-first for nested chains. Omit `resolveBody`
 * to cancel only this instance.
 */
export async function cancelInstance(
  instance: Instance,
  body: ProcessBody,
  actor: Actor = SYSTEM_ACTOR,
  db: SQL = sql,
  resolveBody?: ResolveBodyFn,
): Promise<Instance> {
  if (instance.status !== "running") return instance;

  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const sink = body.workflow.steps.find((s) => s.id === CANCEL_SINK_STEP_ID);
  if (!sink) throw new Error("cancel-sink not in body (uncompiled definition?)");

  const actions = [...(source.onCancel ?? []), ...(sink.onEntry ?? [])];
  const cancelled = await commitTransition(instance, sink, null, actions, "cancel", "cancelled", actor.id, db);

  if (resolveBody) {
    const rows = (await db`SELECT body FROM instances
      WHERE body->'parent'->>'instanceId' = ${instance.instanceId} AND body->>'status' = 'running'`) as { body: unknown }[];
    for (const row of rows) {
      const child = instanceSchema.parse(typeof row.body === "string" ? JSON.parse(row.body) : row.body);
      const childBody = await resolveBody(child.processId, child.version);
      if (childBody) await cancelInstance(child, childBody, actor, db, resolveBody);
    }
  }
  return cancelled;
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
  // The initial step's timers are armed atomically inside createInstance (a crash
  // between INSERT and a separate arming UPDATE would strand them). If resolveAutomatic
  // transitions off the initial step, the first commit re-arms the resting step.
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
  const status = target.terminal ? "completed" : instance.status;
  return commitTransition(instance, target, path.id, actions, "automatic", status, undefined, db);
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

/**
 * Fire a due timer on the instance's current step. A transition timer
 * (`onFire.targetPath`) forces a transition down that path, bypassing its guard,
 * with `cause: "timer"` and `onFire.actions` ordered ahead of the path's own
 * triggers; the instance is then run to rest. A reminder timer (`onFire.actions`,
 * no `targetPath`) enqueues its actions and marks itself fired without moving — a
 * side effect only. Both are idempotent under a redundant fire (two schedulers, a
 * re-scan): the transition via the OCC token, the reminder via a seq + fired guard.
 */
export async function fireTimer(
  instance: Instance,
  timerId: string,
  body: ProcessBody,
  db: SQL = sql,
): Promise<Instance> {
  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const timer = (source.timers ?? []).find((t) => t.id === timerId);
  if (!timer) return instance; // not on the current step (instance moved): no-op

  // Transition timer: forced transition down onFire.targetPath, guard bypassed.
  // onFire.actions lead the path's own triggers. commitTransition's OCC predicate
  // makes a redundant fire lose with ConcurrencyConflict.
  if (timer.onFire.targetPath) {
    const path = (source.paths ?? []).find((p) => p.id === timer.onFire.targetPath);
    if (!path) throw new Error(`timer targetPath not on current step: ${timer.onFire.targetPath}`);
    const target = body.workflow.steps.find((s) => s.id === path.to);
    if (!target) throw new Error(`timer targetPath target not in body: ${path.to}`);
    const actions = [...(timer.onFire.actions ?? []), ...orderedTriggerActions(source, path, target)];
    const status = target.terminal ? "completed" : instance.status;
    const committed = await commitTransition(instance, target, path.id, actions, "timer", status, undefined, db);
    return resolveAutomatic(committed, body, SYSTEM_ACTOR, db);
  }

  // Reminder timer: enqueue onFire.actions and mark fired, no transition, no seq
  // bump. The UPDATE is guarded on the observed seq (a moved-off instance whose
  // timers[] was replaced is a no-op) and on this timer not already fired (a later
  // poll does not re-enqueue). next_timer_at drops to the next unfired timer.
  const idx = (instance.timers ?? []).findIndex((t) => t.timerId === timerId);
  if (idx < 0) return instance;
  const nextTimerAt = minFireAt((instance.timers ?? []).filter((t) => t.timerId !== timerId));

  await db.begin(async (tx) => {
    const upd = (await tx`UPDATE instances
      SET body = jsonb_set(body, ${`{timers,${idx},fired}`}::text[], 'true'::jsonb),
          next_timer_at = ${nextTimerAt}
      WHERE instance_id = ${instance.instanceId} AND transition_seq = ${instance.transitionSeq}
        AND (body->'timers'->${idx}->>'fired') IS DISTINCT FROM 'true'
      RETURNING instance_id`) as unknown[];
    if (upd.length === 0) return; // moved off the step, or already fired
    for (const a of timer.onFire.actions ?? []) {
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
        VALUES (${idempotencyKey(instance.instanceId, instance.transitionSeq, a.id)}, ${instance.instanceId}, ${instance.transitionSeq}, ${a.id}, ${a})`;
    }
  });
  return instance;
}
