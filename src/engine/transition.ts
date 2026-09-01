/**
 * Transition executor. A transition — manual or automatic — runs its triggers
 * onExit(source) -> onPath -> onEntry(target), commits {currentStepId,
 * transitionSeq, status, timers} atomically with transitionSeq as the
 * optimistic-concurrency token, and appends one HistoryEntry. Each ordered
 * trigger action is enqueued into the outbox in the same commit transaction, so
 * an action exists iff its transition committed; the outbox worker delivers
 * them.
 *
 * A manual transition advances one path; the engine then runs the instance to
 * rest via resolveAutomatic (automatic-path evaluation), so a returned instance
 * always sits on a manual step, an automatic wait-state, or a terminal step.
 *
 * The commit itself is split into a plan/apply seam (planStepEntry /
 * applyStepEntry), exported so a caller whose commit is not an authored hop —
 * cancelInstance today, instance migration next — can extend the transaction
 * and the written field set instead of forking the commit and silently
 * dropping whichever consequence it does not reproduce. `commitTransition`
 * composes the two and remains the ordinary entry point, unchanged in
 * behaviour when nothing is overridden.
 */

import type { SQL } from "bun";
import {
  sql,
  createInstance,
  appendInstanceEvent,
  appendInstanceEvents,
  appendInstancePrincipals,
  newInstanceEventId,
  withTransaction,
  makeAssignmentUnresolvedEvent,
  setAuditAttribution,
} from "./store.js";
import { idempotencyKey } from "./idempotency.js";
import {
  SPAWN_ACTION_TYPE,
  RETURN_ACTION_TYPE,
  createDefaultAssignmentRegistry,
  outboxActorsOf,
  resolveStepAssignment,
  type AssignmentRegistry,
} from "./registry.js";
import { armStepTimers, minFireAt, type TimerDrop } from "./duration.js";
import { deleteInstanceDraft } from "./instance-drafts.js";
import { buildGuardContext, evalGuard, SYSTEM_ACTOR, type Actor } from "../cel/eval.js";
import { CANCEL_SINK_STEP_ID, instance as instanceSchema } from "../schema/definition.js";
import type { ProcessBody, Instance, HistoryEntry, InstanceEvent, Action, Step, Path, AssignmentState } from "../schema/definition.js";
import { log } from "../log.js";

/**
 * Re-exported from registry.ts, their home (a leaf module store.ts can import
 * too — this module imports store.ts, so homing them here would cycle). Existing
 * importers name them from here unchanged.
 */
export { SPAWN_ACTION_TYPE, RETURN_ACTION_TYPE } from "./registry.js";

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

/** An actor is an eligible candidate if their id, or any of their roles, is listed. */
export function isEligibleCandidate(actor: Actor, candidates: readonly string[]): boolean {
  return candidates.includes(actor.id) || actor.roles.some((r) => candidates.includes(r));
}

/** Narrows `StepEntryOpts.assignment`'s union: a carry marker, not a resolved set. */
function isCarry(a: StepEntryOpts["assignment"]): a is { carry: true } {
  return a !== null && a !== undefined && "carry" in a;
}

/** The resolver context an instance about to enter a step supplies (see registry.ts::AssignmentContext). */
function assignmentContextFor(instance: Instance): { id: string; startedBy: string | undefined; data: Instance["data"] } {
  return { id: instance.instanceId, startedBy: instance.startedBy, data: instance.data };
}

/** One outbox row a step entry implies, in the shape `applyStepEntry` inserts. */
export type OutboxRow = {
  idempotencyKey: string;
  instanceId: string;
  transitionSeq: number;
  actionId: string;
  action: { id: string; type: string; config: unknown };
};

/**
 * Inputs a step entry cannot be planned without, plus the overrides a
 * synthesized caller may supply. `pathId`, `cause`, `actorId` and `actions` are
 * not optional extras — without them the HistoryEntry and the enqueued action
 * rows are unconstructible. The rest default to today's behaviour:
 *
 * - `status`: derived (`target.terminal ? "completed" : instance.status`) unless
 *   overridden. Only a cancellation overrides it.
 * - `timers`: a pre-computed armed set, replacing the `armStepTimers` call
 *   against the target step. A supplied set produces no drops of the planner's
 *   own — see `events`.
 * - `entryVersion`: the version recorded on the HistoryEntry and on any
 *   `timer.unarmed` events, defaulting to the instance's version.
 * - `suppressSpawn`: omit the `core.spawnSubprocess` enqueue, for a commit
 *   re-entering the step the instance is already parked on (an unsuppressed
 *   re-entry advances the sequence and derives a *different* deterministic
 *   child id, creating a duplicate child). Never inferred from
 *   `target.id === instance.currentStepId`: a genuine self-loop must spawn, and
 *   only the caller knows which this is.
 * - `events`: additional events appended to the plan's event list, so a caller
 *   supplying its own timer set can still record what it dropped while
 *   deriving that set.
 *
 * `assignment` is the one required field that is not an input the entry is
 * unconstructible without: it is the caller's already-resolved candidate set
 * (`registry.ts::resolveStepAssignment`), or `{ carry: true }` to carry
 * `instance.assignment` forward byte-for-byte instead — migration's only use
 * (`migration.ts::migrateOne`), where an in-flight claim deliberately survives
 * untouched and is not re-validated against the target step's declaration
 * (joining the existing "reconcile in-flight action writebacks across a
 * migration" item as a known, deferred gap). It is required rather than an
 * optional override like `timers` because an omitted set and a deliberate carry
 * are indistinguishable to the planner: a missed caller would silently leave an
 * assignment-bearing step unassigned, falling back to the
 * starter-or-`system:admin` floor in `api.ts::submitAndTransition` with no
 * compiler diagnostic. Carrying skips the resolver call entirely rather than
 * calling it and discarding the result, so a migration pays for no lookup.
 */
export type StepEntryOpts = {
  pathId: HistoryEntry["pathId"];
  cause: HistoryEntry["cause"];
  actorId: string | undefined;
  actions: Action[];
  assignment: Instance["assignment"] | { carry: true };
  status?: Instance["status"];
  timers?: Instance["timers"];
  entryVersion?: number;
  suppressSpawn?: boolean;
  events?: InstanceEvent[];
};

/**
 * What a step entry implies: the resulting Instance, its HistoryEntry, the
 * events to append, the outbox rows to insert, and the derived scheduling
 * column. `applyStepEntry` writes exactly this and nothing else.
 */
export type StepEntryPlan = {
  instance: Instance;
  entry: HistoryEntry;
  events: InstanceEvent[];
  outbox: OutboxRow[];
  nextTimerAt: string | null;
};

/**
 * Plan one step entry: no I/O. Not pure — it mints the HistoryEntry id and any
 * event ids via `crypto.randomUUID()`, and reads the clock once for `at` — so
 * plans are not comparable by value without masking `entry.id`, `events[].id`
 * and `at`. Not total either: arming the target step's timers (when `opts.timers`
 * is not supplied) can raise on the duration-width assertion in
 * `armStepTimers`; a caller supplying its own timer set inherits that raise
 * outside the planner instead.
 *
 * Every consequence of entering `target` is derived here from `target` alone
 * (status, the armed set, the subprocess spawn, the subprocess return) — never
 * re-implemented by a caller — except the five explicit overrides above, which
 * exist because a synthesized caller sometimes has to vary exactly one of them,
 * and `opts.assignment`, which the caller resolves because a resolver is
 * asynchronous and this function is not.
 */
export function planStepEntry(
  instance: Instance,
  target: Step,
  body: ProcessBody,
  opts: StepEntryOpts,
): StepEntryPlan {
  const nextSeq = instance.transitionSeq + 1;
  const at = new Date().toISOString();
  const version = opts.entryVersion ?? instance.version;
  const status = opts.status ?? (target.terminal ? "completed" : instance.status);

  // Arm the target step's timers at entry (replacing the source step's, disarming
  // them); next_timer_at is the earliest fireAt for the scheduler's poll. A
  // deadline timer is armed from the instance as it stands at this entry — the
  // target step and the new seq, over data unchanged by the commit (this path
  // never writes data; an action writeback is post-commit and asynchronous).
  const entering: Instance = {
    ...instance,
    currentStepId: target.id,
    currentStepEnteredAt: at,
    transitionSeq: nextSeq,
    status,
    timers: [],
  };
  const { armed, drops }: { armed: NonNullable<Instance["timers"]>; drops: TimerDrop[] } =
    opts.timers !== undefined ? { armed: opts.timers, drops: [] } : armStepTimers(target, at, body, entering);
  const nextTimerAt = minFireAt(armed);
  // The caller's fresh resolution, never carried from the source step: a target
  // with no declared assignment resolves to undefined (unrestricted), clearing
  // whatever the instance carried before. Except migration (`{ carry: true }`),
  // which deliberately leaves it untouched. No resolver runs here — the planner
  // stays pure and synchronous.
  const assignment = isCarry(opts.assignment) ? instance.assignment : opts.assignment;
  const next: Instance = { ...entering, timers: armed, assignment };
  // Timers the target step declared that arming could not compute a fireAt for
  // (empty when a caller supplied its own armed set). Written in the commit, so
  // a dropped timer cannot be recorded without its entry nor an entry land
  // without its drops. Arming stays total: a drop is recorded, never raised, so
  // it does not fail the entry.
  const dropEvents: InstanceEvent[] = drops.map((d) => ({
    id: newInstanceEventId(),
    instanceId: instance.instanceId,
    transitionSeq: nextSeq,
    version,
    kind: "timer.unarmed" as const,
    payload: { timerId: d.timerId, reason: d.reason },
    at,
  }));
  const events: InstanceEvent[] = [...dropEvents, ...(opts.events ?? [])];
  const entry: HistoryEntry = {
    id: `hist_${crypto.randomUUID()}` as HistoryEntry["id"],
    instanceId: instance.instanceId,
    transitionSeq: nextSeq,
    version,
    pathId: opts.pathId,
    fromStepId: instance.currentStepId,
    toStepId: target.id,
    cause: opts.cause,
    ...(opts.actorId !== undefined ? { actorId: opts.actorId } : {}),
    at,
  };

  const outbox: OutboxRow[] = opts.actions.map((a) => ({
    idempotencyKey: idempotencyKey(instance.instanceId, nextSeq, a.id),
    instanceId: instance.instanceId,
    transitionSeq: nextSeq,
    actionId: a.id,
    action: a,
  }));
  // Subprocess spawn: entering a subprocess step enqueues a spawn action,
  // dispatched post-commit by the internal handler (child-body resolution +
  // inputMapping + linked child creation). Idempotent via the deterministic
  // child id the handler derives from (instance, nextSeq, step) — which is
  // exactly why a re-entry onto an already-parked subprocess step must suppress
  // this rather than enqueue a second, differently-keyed spawn.
  if (target.type === "subprocess" && !opts.suppressSpawn) {
    const spawn = { id: `action_spawn_${target.id}`, type: SPAWN_ACTION_TYPE, config: { subprocessStepId: target.id, parentSeq: nextSeq } };
    outbox.push({
      idempotencyKey: idempotencyKey(instance.instanceId, nextSeq, spawn.id),
      instanceId: instance.instanceId,
      transitionSeq: nextSeq,
      actionId: spawn.id,
      action: spawn,
    });
  }
  // Subprocess return: a child reaching a terminal step enqueues a return action
  // that wakes the parked parent (outputMapping writeback + advance). The config
  // names the parent instance and the outcome, never the parent's step: the
  // handler reads that from this child's own `parent` link when the row is
  // delivered. A step id frozen here is a snapshot of another instance's state
  // read an unbounded interval later — across backoff, a claim lease, or a
  // worker restart — and a parent that moved in that window is indistinguishable
  // from one that legitimately moved on, which is a silent, never-retried loss.
  // Unconditional — not because the idempotency key is sequence-free (it is not,
  // exactly like the spawn's) but because entering a terminal step derives
  // `completed` and no path transitions a non-running instance, so an instance
  // reaches a terminal step at most once. `opts.status` can break that chain
  // (cancelInstance does), so any future status override must re-examine this.
  if (target.terminal && instance.parent) {
    const ret = {
      id: `action_return_${instance.instanceId}`,
      type: RETURN_ACTION_TYPE,
      config: { parentInstanceId: instance.parent.instanceId, childOutcome: target.outcome ?? null },
    };
    outbox.push({
      idempotencyKey: idempotencyKey(instance.instanceId, nextSeq, ret.id),
      instanceId: instance.instanceId,
      transitionSeq: nextSeq,
      actionId: ret.id,
      action: ret,
    });
  }

  return { instance: next, entry, events, outbox, nextTimerAt };
}

/**
 * Write a planned step entry inside the caller's transaction — never its own.
 * `extraFields` is merged into the instance row alongside the plan's own
 * {currentStepId, transitionSeq, status, timers}, under the same
 * optimistic-concurrency predicate: applying from a stale sequence writes none
 * of it. The ordinary path writes only those four fields plus `resolve_state`;
 * a caller that must also rewrite the instance's pin or payload supplies them
 * here rather than issuing a second statement.
 *
 * Every commit landing the instance on a `running` step also durably marks it
 * `resolve_state = 'pending'`, in the same statement as the commit. The
 * caller's own cascade (resolveAutomatic, run inline by every current caller)
 * may complete before anything else observes the mark, in which case the
 * re-resolution worker's next pass finds nothing left to do and clears it — a
 * cheap no-op. But if the caller's process ends between this commit and
 * completing that cascade, the mark survives and the worker finishes the
 * cascade instead of the instance resting on an intermediate step with
 * nothing to re-drive it. This generalizes the pattern migration already used
 * for its own commit (flag and defer, rather than cascade inline) to every
 * step entry.
 *
 * Conditioned on the *resulting* status being `running` — not unconditional —
 * for two reasons. First, a commit onto a terminal step, or a `cancelled`
 * override, would otherwise flag an instance the re-resolution worker's own
 * claim query (`WHERE body->>'status' = 'running'`) never selects again: the
 * mark would sit `'pending'` forever, dead weight with no reader. Second, and
 * more subtly, the re-resolution worker's own resolveAutomatic call commits
 * its cascade hops through this same function while the row is `'claimed'`;
 * an unconditional write would stomp that claim back to `'pending'` on every
 * such hop, so the worker's own end-of-pass `WHERE resolve_state = 'claimed'`
 * clear would match nothing and the row would need a second, purely
 * confirmatory pass to settle at `'idle'`. A cascade whose last hop lands on
 * a terminal step (the common case) now converges in the same pass that did
 * the work; one whose last hop lands on a non-terminal wait-state still takes
 * one extra pass to settle, which is safe — the mark is never lost, only
 * revisited once more than strictly necessary.
 *
 * A caller patching `data` must hold the instance row locked (`SELECT ... FOR
 * UPDATE`) across its read and this commit: the predicate does not protect
 * `data`, since a post-commit action writeback jsonb_sets a disjoint
 * {data,<fieldId>} path without advancing or checking transitionSeq, and a
 * wholesale `data` patch computed from an earlier read would erase such a
 * writeback silently even though the predicate still matches.
 *
 * A commit whose resulting status is `cancelled` also durably marks
 * `cancel_sweep_state = 'pending'`, in the same statement, for the same
 * reason `resolve_state` is flagged here rather than by the caller:
 * `cancelInstance` is the only caller that ever overrides `status` to
 * `"cancelled"`, so this flags exactly a cancel commit. Unlike
 * `resolve_state`, this column has no worker scanning it — `cancelInstance`
 * itself reads it, by instance id, when re-invoked on an instance it finds is
 * already `cancelled`, to decide whether an incomplete child-cancellation
 * sweep needs resuming (see `cancelInstance`/`sweepCancelledChildren` below).
 *
 * Throws ConcurrencyConflict on a zero-row update, exactly as commitTransition
 * did before the split.
 */
export async function applyStepEntry(tx: SQL, plan: StepEntryPlan, extraFields?: Record<string, unknown>): Promise<Instance> {
  const { instance: next, entry, events, outbox, nextTimerAt } = plan;
  const prevSeq = entry.transitionSeq - 1;
  // extraFields first: the plan's four fields win a key collision. A caller that
  // patches `transitionSeq` would otherwise write a body sequence disagreeing with
  // the promoted `transition_seq` column and the OCC predicate below, both of which
  // take the plan's value — and rehydrate reads the body. The patch is written
  // *alongside* the plan's fields, never over them.
  const patch = {
    ...(extraFields ?? {}),
    currentStepId: next.currentStepId,
    currentStepEnteredAt: next.currentStepEnteredAt,
    transitionSeq: next.transitionSeq,
    status: next.status,
    timers: next.timers,
    // Explicit null (not an omitted key) when the target declares no
    // assignment: the merge below is a shallow `||`, so an omitted key would
    // leave whatever the source step's assignment carried in place instead of
    // clearing it.
    assignment: next.assignment ?? null,
  };
  const updated = (await tx`UPDATE instances
    SET body = body || ${patch}::jsonb,
        transition_seq = ${next.transitionSeq},
        next_timer_at = ${nextTimerAt},
        resolve_state = CASE WHEN ${next.status} = 'running' THEN 'pending' ELSE resolve_state END,
        cancel_sweep_state = CASE WHEN ${next.status} = 'cancelled' THEN 'pending' ELSE cancel_sweep_state END
    WHERE instance_id = ${entry.instanceId} AND transition_seq = ${prevSeq}
    RETURNING instance_id`) as unknown[];
  if (updated.length === 0) throw new ConcurrencyConflict(entry.instanceId, prevSeq);
  await tx`INSERT INTO history_entries (id, instance_id, transition_seq, entry)
    VALUES (${entry.id}, ${entry.instanceId}, ${entry.transitionSeq}, ${entry})`;
  // instance-visibility-set: the entered step's resolved candidates, plus the
  // actor who drove this entry. One insert, this transaction, so the migration
  // path (migration.ts::migrateOne) inherits it with no code of its own.
  await appendInstancePrincipals(tx, entry.instanceId, [
    ...(next.assignment?.candidates ?? []),
    ...(entry.actorId ? [entry.actorId] : []),
  ]);
  await appendInstanceEvents(tx, events);
  for (const row of outbox) {
    // field_version: the instance's version at this entry, i.e. entry.version
    // (opts.entryVersion ?? instance.version) — the same value migration passes as
    // entryVersion when it enqueues a relocation's onEntry actions, so a row
    // enqueued by that commit is already stamped with the target version rather
    // than needing a separate bump.
    // actors: read off `next`, the instance this commit is writing. All three
    // trigger positions (onExit, onPath, onEntry) therefore carry the ENTERED
    // step's candidates, not the left step's — one stamp per commit, stated in
    // the notification-email spec so an author reads one rule rather than two.
    await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, field_version, actors)
      VALUES (${row.idempotencyKey}, ${row.instanceId}, ${row.transitionSeq}, ${row.actionId}, ${row.action}, ${entry.version}, ${outboxActorsOf(next)})`;
  }
  return next;
}

/**
 * Commit one transition atomically: plan the step entry, then apply it —
 * opening its own transaction unless already inside one (the subprocess return
 * holds the parent row locked across its advance, so this joins that
 * transaction rather than independently committing a second one within it).
 * Shared by the authored (manual/automatic/timer) paths and the synthesized
 * cancel path. The caller supplies `target` (the step entered — its timers are
 * armed against `body`), the HistoryEntry `pathId` (null for a synthesized
 * transition with no authored path), the `cause`, an optional `actorId`, and
 * any of the `StepEntryOpts` overrides (`cancelInstance` overrides `status`).
 *
 * The target step's candidates resolve here, before the plan and so before
 * `withTransaction` opens — the resolver is asynchronous and must not run while
 * a connection and the instance's row lock are held. `withTransaction` joins an
 * already-open transaction through a savepoint rather than starting a second
 * one, so "outside the transaction" holds only where `db` is a plain
 * connection. The subprocess return is the one caller that passes a transaction
 * handle instead: it derives the step it enters from the row it read under
 * `SELECT ... FOR UPDATE`, so hoisting resolution above that lock would need an
 * optimistic pre-read plus a sequence re-check that must still fall back to
 * resolving under the lock when the re-check fails. The resolution deadline
 * bounds that hold instead (`registry.ts::resolveStepAssignment`), so a fallible
 * resolver cannot keep the parent's row locked past it.
 *
 * A resolution that produced no candidate is recorded as an
 * `assignment.unresolved` event here, in the same transaction as the entry —
 * resolution is total, so the entry commits either way.
 */
async function commitTransition(
  instance: Instance,
  target: Step,
  body: ProcessBody,
  pathId: HistoryEntry["pathId"],
  actions: Action[],
  cause: HistoryEntry["cause"],
  actorId: string | undefined,
  db: SQL,
  overrides?: Pick<StepEntryOpts, "status" | "timers" | "entryVersion" | "suppressSpawn" | "events">,
  extraFields?: Record<string, unknown>,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<Instance> {
  const { assignment, unresolved } = await resolveStepAssignment(target, assignmentRegistry, assignmentContextFor(instance), db);
  // The seq and version this entry lands on, mirroring planStepEntry's own
  // derivation so the event and the entry's HistoryEntry agree.
  const events = unresolved
    ? [
        ...(overrides?.events ?? []),
        makeAssignmentUnresolvedEvent({
          instanceId: instance.instanceId,
          transitionSeq: instance.transitionSeq + 1,
          version: overrides?.entryVersion ?? instance.version,
          stepId: target.id,
          reason: unresolved,
          at: new Date().toISOString(),
        }),
      ]
    : overrides?.events;
  const plan = planStepEntry(instance, target, body, { pathId, cause, actorId, actions, assignment, ...overrides, ...(events ? { events } : {}) });
  return withTransaction(db, async (tx) => {
    // Only a participant's own submit carries field data (timer/automatic/cancel
    // pass no extraFields, so their applyStepEntry writes no instance_audit row —
    // instance-audit-log-chain design.md "Actor and source arrive through
    // set_config"). migrateOne's own "migration" source is set on its own call to
    // applyStepEntry, never reached through commitTransition.
    if (cause === "user") await setAuditAttribution(tx, actorId ?? null, "submit");
    const next = await applyStepEntry(tx, plan, extraFields);
    await deleteInstanceDraft(instance.instanceId, tx);
    return next;
  });
}

/**
 * Commit a single manual transition — guard check plus commit — with no
 * automatic-path cascade. Rejects if the path is not on the current step, is
 * not manual, or its guard is false. A concurrent transition that already
 * advanced the instance makes this lose (ConcurrencyConflict), leaving no
 * partial write. A no-op on an instance that is not `running` (e.g.
 * `faulted`), matching cancelInstance's non-running no-op.
 *
 * `dataPatch`, when supplied, is merged over `instance.data` — the FULL
 * merged object, not the raw patch — and used consistently in three places:
 * as the data the guard is evaluated against, as the `instance` handed to
 * the underlying step-entry plan (so target-step timer arming and the
 * returned in-memory Instance both reflect the merged data), and as the
 * field patch threaded to the commit as `extraFields.data`. Passing the raw
 * `dataPatch` alone as `extraFields.data` would be wrong: `applyStepEntry`'s
 * merge is a shallow `body || extraFields::jsonb` at the top level of the
 * persisted row, so a partial `data` value would replace, not extend, the
 * instance's stored `data`.
 */
export async function commitManualTransition(
  instance: Instance,
  pathId: string,
  body: ProcessBody,
  actor: Actor,
  db: SQL = sql,
  dataPatch?: Instance["data"],
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
  events?: InstanceEvent[],
): Promise<Instance> {
  // Deliberately a no-op, not a throw: internal idempotent re-entry (e.g. a
  // timer firing against an instance a cascade already completed) must not
  // throw. A caller-initiated rejection lives one layer up, at the
  // runtime-API boundary (`submitAndTransition`'s own status check) — see
  // correct-api-error-responses's design.md.
  if (instance.status !== "running") return instance;

  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const path = (source.paths ?? []).find((p) => p.id === pathId);
  if (!path) throw new Error(`path not on current step: ${pathId}`);
  if (path.trigger !== "manual") throw new Error(`not a manual path: ${pathId}`);

  const mergedData = dataPatch ? { ...instance.data, ...dataPatch } : instance.data;
  const evalInstance: Instance = dataPatch ? { ...instance, data: mergedData } : instance;

  if (!evalGuard(path.guard, buildGuardContext(body, evalInstance, actor))) throw new GuardRefused(pathId);

  const target = body.workflow.steps.find((s) => s.id === path.to);
  if (!target) throw new Error(`path target not in body: ${path.to}`);

  const actions = orderedTriggerActions(source, path, target);
  return commitTransition(
    evalInstance,
    target,
    body,
    path.id,
    actions,
    "user",
    actor.id,
    db,
    // `events` rides the same overrides slot `assignment.unresolved` already
    // uses, so a caller-supplied event lands in the commit's own transaction
    // and cannot outlive a rolled-back one.
    events && events.length > 0 ? { events } : undefined,
    dataPatch ? { data: mergedData } : undefined,
    assignmentRegistry,
  );
}

/**
 * Execute a single manual transition, then run the instance to rest —
 * `commitManualTransition` followed by `resolveAutomatic`. Unchanged
 * signature and behavior for every caller that supplies no `dataPatch`; both
 * functions accept the same optional `dataPatch` and the same optional
 * `events`.
 */
export async function executeManualTransition(
  instance: Instance,
  pathId: string,
  body: ProcessBody,
  actor: Actor,
  db: SQL = sql,
  dataPatch?: Instance["data"],
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
  events?: InstanceEvent[],
): Promise<Instance> {
  if (instance.status !== "running") return instance;
  const committed = await commitManualTransition(instance, pathId, body, actor, db, dataPatch, assignmentRegistry, events);
  return resolveAutomatic(committed, body, actor, db, assignmentRegistry);
}

/** Outcome of one direct-child cancellation sweep pass (see `sweepCancelledChildren`). */
export type CancelSweepResult = {
  cancelled: string[];
  conflicted: string[];
  failed: string[];
};

/**
 * Attempt to cancel every currently active (running) direct child of
 * `parentInstanceId`, isolating each child's failure from its siblings —
 * mirroring `migrateInstances`' per-instance fault isolation, at the scale of
 * one parent's direct children. A child whose own cancel commit loses a
 * concurrency race is bucketed `conflicted`, not `failed`: that means a
 * concurrent commit (a racing sweep, the child's own independent progress)
 * already moved it, not that its cancellation is broken — and it drops out of
 * this same query on a later pass once it does. Sets the parent's
 * `cancel_sweep_state = 'done'` only when this pass finds zero
 * conflicted/failed children; otherwise leaves it `'pending'` (as
 * `applyStepEntry` set it on the parent's own cancel commit) so a later call
 * to `cancelInstance` resumes it. Both a fresh cancel and `cancelInstance`'s
 * resume branch below call this same helper, so there is exactly one sweep
 * implementation whether this is the first attempt or a retry.
 */
async function sweepCancelledChildren(
  parentInstanceId: string,
  actor: Actor,
  db: SQL,
  resolveBody: ResolveBodyFn,
): Promise<CancelSweepResult> {
  const rows = (await db`SELECT instance_id, body FROM instances
    WHERE body->'parent'->>'instanceId' = ${parentInstanceId} AND body->>'status' = 'running'`) as
    { instance_id: string; body: unknown }[];
  const result: CancelSweepResult = { cancelled: [], conflicted: [], failed: [] };
  for (const row of rows) {
    try {
      const child = instanceSchema.parse(typeof row.body === "string" ? JSON.parse(row.body) : row.body);
      const childBody = await resolveBody(child.processId, child.version);
      if (!childBody) {
        result.failed.push(child.instanceId);
        continue;
      }
      await cancelInstance(child, childBody, actor, db, resolveBody);
      result.cancelled.push(child.instanceId);
    } catch (e) {
      if (e instanceof ConcurrencyConflict) result.conflicted.push(row.instance_id);
      else result.failed.push(row.instance_id);
    }
  }
  if (result.conflicted.length === 0 && result.failed.length === 0) {
    await db`UPDATE instances SET cancel_sweep_state = 'done' WHERE instance_id = ${parentInstanceId}`;
  }
  return result;
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
 *
 * Downward-only subprocess propagation: when `resolveBody` is supplied, after the
 * parent commits its cancel this sweeps its active (running) children via
 * `sweepCancelledChildren` (recursively for nested chains — each child's own
 * cancellation runs through this same function). Omit `resolveBody` to cancel
 * only this instance; its `cancel_sweep_state` is still flagged `'pending'` by
 * the commit (see `applyStepEntry`), so a later call that does supply
 * `resolveBody` still attempts the sweep.
 *
 * The child sweep is fault-isolated (one child's failure does not stop its
 * siblings) and resumable: if a prior sweep left `cancel_sweep_state`
 * `'pending'` (a conflicted or failed child, a crash mid-sweep, or a first
 * call that omitted `resolveBody`), re-invoking this function on the
 * already-`cancelled` instance — the `instance.status !== "running"` branch
 * below — re-attempts the sweep instead of no-opping outright. That resume
 * never re-commits the instance's own cancel transition: no `HistoryEntry` is
 * appended and `transitionSeq` does not change, exactly as for any other
 * non-running instance; only the child cascade is resumed.
 *
 * Takes no `AssignmentRegistry`, unlike every other step-entry caller. The one
 * step this ever enters is the publish-injected cancel sink, which
 * `compile.ts` synthesizes with no `assignment` field, so
 * `resolveStepAssignment` returns before consulting any registry and no
 * resolver can run on this path. The omission is the absence of a call, not a
 * missed link in the threading.
 */
export async function cancelInstance(
  instance: Instance,
  body: ProcessBody,
  actor: Actor = SYSTEM_ACTOR,
  db: SQL = sql,
  resolveBody?: ResolveBodyFn,
): Promise<Instance> {
  if (instance.status !== "running") {
    if (instance.status === "cancelled" && resolveBody) {
      const rows = (await db`SELECT cancel_sweep_state FROM instances WHERE instance_id = ${instance.instanceId}`) as
        { cancel_sweep_state: string }[];
      if (rows[0]?.cancel_sweep_state === "pending") await sweepCancelledChildren(instance.instanceId, actor, db, resolveBody);
    }
    return instance;
  }

  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const sink = body.workflow.steps.find((s) => s.id === CANCEL_SINK_STEP_ID);
  if (!sink) throw new Error("cancel-sink not in body (uncompiled definition?)");

  const actions = [...(source.onCancel ?? []), ...(sink.onEntry ?? [])];
  const cancelled = await commitTransition(instance, sink, body, null, actions, "cancel", actor.id, db, { status: "cancelled" }, undefined);

  if (resolveBody) await sweepCancelledChildren(instance.instanceId, actor, db, resolveBody);
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
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<Instance> {
  // The initial step's timers are armed atomically inside createInstance (a crash
  // between INSERT and a separate arming UPDATE would strand them). If resolveAutomatic
  // transitions off the initial step, the first commit re-arms the resting step.
  // Creation is a step entry, so its candidates resolve here and are passed in:
  // createInstance calls no resolver, keeping its persistence-only remit.
  // The id is minted here rather than inside createInstance so the resolver sees
  // the id of the instance it is resolving for — the same reason
  // `api.ts::createProcessInstance` mints its own.
  const instanceId = `inst_${crypto.randomUUID()}`;
  const initial = body.workflow.steps.find((s) => s.id === body.workflow.initialStep);
  const resolved = initial
    ? await resolveStepAssignment(initial, assignmentRegistry, { id: instanceId, startedBy: undefined, data: {} }, db)
    : undefined;
  // Recorded at seq 0, which creation does not advance, and inside
  // createInstance's own transaction (the `subprocess.spawn-enqueued` placement).
  const events: InstanceEvent[] = resolved?.unresolved && initial
    ? [makeAssignmentUnresolvedEvent({
        instanceId: instanceId as Instance["instanceId"],
        transitionSeq: 0,
        version: opts.version,
        stepId: initial.id,
        reason: resolved.unresolved,
        at: new Date().toISOString(),
      })]
    : [];
  const created = await createInstance(body, { ...opts, instanceId, assignment: resolved?.assignment, events }, db);
  return resolveAutomatic(created, body, actor, db, assignmentRegistry);
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
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<Instance> {
  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const target = body.workflow.steps.find((s) => s.id === path.to);
  if (!target) throw new Error(`path target not in body: ${path.to}`);
  const actions = orderedTriggerActions(source, path, target);
  return commitTransition(instance, target, body, path.id, actions, "automatic", undefined, db, undefined, undefined, assignmentRegistry);
}

/**
 * Park a looped instance in an error state: flip status to `faulted` at its
 * current seq and append the `instance.faulted` event recording why. Not a
 * transition — no seq bump, no HistoryEntry — so flip and event are written in
 * one transaction guarded by the same OCC predicate: if the instance moved
 * concurrently the UPDATE matches no row and neither the flip nor the event is
 * written. The thrown AutomaticCascadeLoop still names the repeated step to the
 * caller; this is the durable copy of that fact.
 */
async function markFaulted(instance: Instance, repeatedStepId: Step["id"], db: SQL): Promise<void> {
  await withTransaction(db, async (tx) => {
    const upd = (await tx`UPDATE instances
      SET body = jsonb_set(body, '{status}', (${["faulted"]}::jsonb) -> 0)
      WHERE instance_id = ${instance.instanceId} AND transition_seq = ${instance.transitionSeq}
      RETURNING instance_id`) as unknown[];
    if (upd.length === 0) return; // lost the OCC race: instance moved, nothing to record
    await appendInstanceEvent(tx, {
      id: newInstanceEventId(),
      instanceId: instance.instanceId,
      transitionSeq: instance.transitionSeq,
      version: instance.version,
      kind: "instance.faulted",
      payload: { stepId: repeatedStepId, reason: "automatic-cascade-loop" },
      at: new Date().toISOString(),
    });
    log.error("instance faulted", { instanceId: instance.instanceId, stepId: repeatedStepId, reason: "automatic-cascade-loop" });
  });
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
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
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

    current = await executeAutomaticTransition(current, path, body, db, assignmentRegistry);
    if (seen.has(current.currentStepId)) {
      await markFaulted(current, current.currentStepId, db);
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
 * side effect only, recorded as a `timer.fired` event in the same commit, since the
 * fired flag alone says a fire happened without saying when or what it delivered.
 * Both are idempotent under a redundant fire (two schedulers, a re-scan): the
 * transition via the OCC token, the reminder via a seq + fired guard. A no-op —
 * neither branch runs — on an instance that is not `running` (e.g. `faulted`),
 * matching cancelInstance's non-running no-op.
 */
export async function fireTimer(
  instance: Instance,
  timerId: string,
  body: ProcessBody,
  db: SQL = sql,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<Instance> {
  if (instance.status !== "running") return instance;

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
    const committed = await commitTransition(instance, target, body, path.id, actions, "timer", undefined, db, undefined, undefined, assignmentRegistry);
    return resolveAutomatic(committed, body, SYSTEM_ACTOR, db, assignmentRegistry);
  }

  // Reminder timer: enqueue onFire.actions and mark fired, no transition, no seq
  // bump. The UPDATE is guarded on the observed seq (a moved-off instance whose
  // timers[] was replaced is a no-op) and on this timer not already fired (a later
  // poll does not re-enqueue). next_timer_at drops to the next unfired timer.
  const idx = (instance.timers ?? []).findIndex((t) => t.timerId === timerId);
  if (idx < 0) return instance;
  const nextTimerAt = minFireAt((instance.timers ?? []).filter((t) => t.timerId !== timerId));
  // The fire's own runtime record. It carries the seq in force without advancing
  // it, and the actions below name it so their outcomes land here rather than on
  // whichever HistoryEntry happens to share the seq. Minted outside the
  // transaction, appended inside it behind the same guard as the fired flag, so a
  // redundant fire emits no second event.
  const fired: InstanceEvent = {
    id: newInstanceEventId(),
    instanceId: instance.instanceId,
    transitionSeq: instance.transitionSeq,
    version: instance.version,
    kind: "timer.fired",
    payload: { timerId: timer.id },
    at: new Date().toISOString(),
  };

  await withTransaction(db, async (tx) => {
    const upd = (await tx`UPDATE instances
      SET body = jsonb_set(body, ${`{timers,${idx},fired}`}::text[], 'true'::jsonb),
          next_timer_at = ${nextTimerAt}
      WHERE instance_id = ${instance.instanceId} AND transition_seq = ${instance.transitionSeq}
        AND (body->'timers'->${idx}->>'fired') IS DISTINCT FROM 'true'
      RETURNING instance_id`) as unknown[];
    if (upd.length === 0) return; // moved off the step, or already fired
    // Behind the guard, so a redundant fire records no second event.
    await appendInstanceEvent(tx, fired);
    for (const a of timer.onFire.actions ?? []) {
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, event_id, field_version, actors)
        VALUES (${idempotencyKey(instance.instanceId, instance.transitionSeq, a.id)}, ${instance.instanceId}, ${instance.transitionSeq}, ${a.id}, ${a}, ${fired.id}, ${instance.version}, ${outboxActorsOf(instance)})`;
    }
  });
  return instance;
}

// ============================================================
// Assignment claim / release: not a transition (no step change), so neither
// appends a HistoryEntry nor advances transitionSeq. Exclusive claiming on top
// of the candidates planStepEntry resolves at step entry (above).
// ============================================================

export class NotAssignedError extends Error {
  constructor(instanceId: string) {
    super(`instance ${instanceId} current step has no declared assignment`);
    this.name = "NotAssignedError";
  }
}

export class NotACandidateError extends Error {
  constructor(instanceId: string, actorId: string) {
    super(`actor ${actorId} is not an eligible candidate for instance ${instanceId}`);
    this.name = "NotACandidateError";
  }
}

export class AlreadyClaimedError extends Error {
  constructor(instanceId: string) {
    super(`instance ${instanceId} current step is already claimed`);
    this.name = "AlreadyClaimedError";
  }
}

export class NotClaimedError extends Error {
  constructor(instanceId: string) {
    super(`instance ${instanceId} current step requires a claim, and is unclaimed`);
    this.name = "NotClaimedError";
  }
}

export class NotClaimantError extends Error {
  constructor(instanceId: string, actorId: string) {
    super(`actor ${actorId} does not hold the claim on instance ${instanceId}`);
    this.name = "NotClaimantError";
  }
}

/**
 * A delegation named a target the local account directory does not hold. Only
 * `delegateClaim`'s `validateTarget` callback raises it, and only where the
 * delegating actor resolves in that directory — a deployment on an external
 * identity provider has no directory to check against.
 *
 * Defined here rather than in `src/auth`, beside the other errors a claim
 * operation raises, so `src/http/errors.ts` maps it from the one import it
 * already reads.
 */
export class UnknownDelegateError extends Error {
  constructor(readonly toActorId: string) {
    super(`delegate target is not a known account: ${toActorId}`);
    this.name = "UnknownDelegateError";
  }
}

async function loadForClaim(tx: SQL, instanceId: string): Promise<Instance> {
  const rows = (await tx`SELECT body FROM instances WHERE instance_id = ${instanceId} FOR UPDATE`) as { body: unknown }[];
  if (rows.length === 0) throw new Error(`instance not found: ${instanceId}`);
  return instanceSchema.parse(typeof rows[0].body === "string" ? JSON.parse(rows[0].body) : rows[0].body);
}

/** The kind/payload pairs `updateAssignment` may append — one union member
 * per caller, so each caller's payload shape is checked against its own
 * kind rather than widened to a common shape. */
type AssignmentEventSpec =
  | { kind: "assignment.claimed"; payload: { actorId: string } }
  | { kind: "assignment.released"; payload: { actorId: string } }
  | { kind: "assignment.delegated"; payload: { fromActorId: string; toActorId: string } };

/**
 * Shared claim/release/delegate sequence: row-lock (the same pattern
 * `submitAndTransition` uses to guard against a concurrent writeback),
 * no-op on a non-running instance (matching every other transition entry
 * point's — `cancelInstance`, `commitManualTransition`, … — non-running
 * no-op), run the operation's guard against the current assignment, write
 * the computed next assignment, and append an event carrying the same
 * timestamp as the write — computed once, here, so the assignment's
 * stamped time and the event's `at` can never drift apart. Not a
 * transition: `jsonb_set` replaces the whole `{assignment}` path directly
 * rather than routing through `applyStepEntry`, so no HistoryEntry is
 * appended and `transitionSeq` is untouched.
 */
async function updateAssignment(
  instanceId: string,
  db: SQL,
  // The guard may return a promise, and this function awaits it: `delegateClaim`
  // has a check that reads the account directory, and that check must run under
  // this row lock and after the claimant check. `claimStep` and `releaseClaim`
  // return nothing and are unaffected.
  guard: (assignment: AssignmentState | null | undefined) => void | Promise<void>,
  computeNext: (assignment: AssignmentState, at: string) => AssignmentState,
  eventSpec: AssignmentEventSpec,
): Promise<Instance> {
  return withTransaction(db, async (tx) => {
    const inst = await loadForClaim(tx, instanceId);
    // Deliberately a no-op, not a throw — same reasoning as
    // commitManualTransition's. The runtime-API wrappers (`claimStep`/
    // `releaseClaim`/`delegateClaim` in `runtime/api.ts`) detect this no-op
    // after the fact and reject the caller-initiated request themselves.
    if (inst.status !== "running") return inst;

    await guard(inst.assignment);
    const at = new Date().toISOString();
    const next = computeNext(inst.assignment as AssignmentState, at);
    await tx`UPDATE instances SET body = jsonb_set(body, '{assignment}', (${[next]}::jsonb) -> 0)
      WHERE instance_id = ${instanceId}`;
    // instance-visibility-set: whoever now holds the claim. A release writes
    // no claimant, so the list below is empty and the helper writes nothing.
    // A delegation target never joins `candidates`, so without this the
    // delegate would hold a claim on an instance they cannot list.
    await appendInstancePrincipals(tx, instanceId, next.claimedBy ? [next.claimedBy] : []);

    const event: InstanceEvent = {
      id: newInstanceEventId(),
      instanceId: inst.instanceId,
      transitionSeq: inst.transitionSeq,
      version: inst.version,
      ...eventSpec,
      at,
    };
    await appendInstanceEvent(tx, event);

    return { ...inst, assignment: next };
  });
}

export async function claimStep(instanceId: string, actor: Actor, db: SQL = sql): Promise<Instance> {
  return updateAssignment(
    instanceId,
    db,
    (assignment) => {
      if (!assignment) throw new NotAssignedError(instanceId);
      if (assignment.claimedBy !== undefined) throw new AlreadyClaimedError(instanceId);
      if (!isEligibleCandidate(actor, assignment.candidates)) throw new NotACandidateError(instanceId, actor.id);
    },
    (assignment, at) => ({ candidates: assignment.candidates, claimedBy: actor.id, claimedAt: at }),
    { kind: "assignment.claimed", payload: { actorId: actor.id } },
  );
}

/**
 * Release a claim on the current step of a running instance. Row-locks,
 * requires the calling actor currently holds the claim. Not a transition —
 * same shape as `claimStep`. A no-op on a non-running instance.
 */
export async function releaseClaim(instanceId: string, actor: Actor, db: SQL = sql): Promise<Instance> {
  return updateAssignment(
    instanceId,
    db,
    (assignment) => {
      if (!assignment || assignment.claimedBy !== actor.id) throw new NotClaimantError(instanceId, actor.id);
    },
    (assignment) => ({ candidates: assignment.candidates }),
    { kind: "assignment.released", payload: { actorId: actor.id } },
  );
}

/**
 * Delegate a claim on the current step of a running instance to a named
 * actor. Row-locks, requires the calling actor currently holds the claim
 * (same guard `releaseClaim` uses). The candidate list is untouched — the
 * delegate does not join it, so releasing returns the step to the
 * original candidates, not to the delegate. Not a transition — same shape
 * as `claimStep`/`releaseClaim`. A no-op on a non-running instance.
 *
 * `validateTarget` is an optional check on `toActorId`, supplied by
 * `runtime/api.ts` and holding the account directory this file does not. It
 * runs under the same row lock and only AFTER the claimant check, which orders
 * the two errors deliberately: a caller who does not hold the claim meets
 * `NotClaimantError` whatever target it names, so this route never answers
 * whether an arbitrary account exists. Omitted, the target is unchecked, which
 * is the behavior every caller had before.
 */
export async function delegateClaim(
  instanceId: string,
  actor: Actor,
  toActorId: string,
  db: SQL = sql,
  validateTarget?: (toActorId: string) => Promise<void>,
): Promise<Instance> {
  return updateAssignment(
    instanceId,
    db,
    async (assignment) => {
      if (!assignment || assignment.claimedBy !== actor.id) throw new NotClaimantError(instanceId, actor.id);
      if (validateTarget) await validateTarget(toActorId);
    },
    (assignment, at) => ({ candidates: assignment.candidates, claimedBy: toActorId, claimedAt: at }),
    { kind: "assignment.delegated", payload: { fromActorId: actor.id, toActorId } },
  );
}
