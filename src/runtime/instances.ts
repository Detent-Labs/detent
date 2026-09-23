/**
 * Instance lifecycle for the Runtime API Layer: create an instance, resolve
 * its participant-facing view, submit data through a manual path, save a
 * draft, and cancel.
 */

import type { SQL } from "bun";
import { sql, createInstance, createDraftSnapshot, withTransaction, newInstanceEventId, PinMismatch } from "../engine/store.js";
import { getDraft } from "../engine/drafts.js";
import { commitManualTransition, resolveAutomatic, cancelInstance as engineCancelInstance, NotClaimedError, NotClaimantError } from "../engine/transition.js";
import type { Actor } from "../cel/eval.js";
import { requireRole, can, CANCEL_ANY_ROLE, ADMIN_ROLE, AuthorizationError } from "../auth/authorize.js";
import { definitionHash } from "../schema/hash.js";
import { NotFoundError, InstanceNotRunningError } from "../errors.js";
import { saveInstanceDraft as engineSaveInstanceDraft, getInstanceDraft, type InstanceDraft } from "../engine/instance-drafts.js";
import { processBody as processBodySchema, collectFieldsDeep } from "../schema/definition.js";
import type {
  ProcessId,
  InstanceId,
  PathId,
  Literal,
  Instance,
  InstanceStatus,
  AssignmentState,
  ProcessBody,
  Step,
  StepId,
  StepType,
  LocalizedText,
  LocaleCode,
  InstanceEvent,
} from "../schema/definition.js";
import { createDefaultAssignmentRegistry, resolveStepAssignment, type DataSourceRegistry, type AssignmentRegistry } from "../engine/registry.js";
import { getStore, parseInstance, loadInstanceForRead, loadInstanceForActor, findStep, resolveCollaboration } from "./internal.js";
import {
  resolveFields,
  resolveAvailablePaths,
  applyColumnMapping,
  droppedAttributeEvents,
  applyFieldDefaults,
  validateSubmissionData,
  type ResolvedViewEntry,
  type ResolvedViewTab,
  type AvailablePath,
} from "./fields.js";

export type InstanceView = {
  instanceId: InstanceId;
  processId: ProcessId;
  version: number;
  status: InstanceStatus;
  // Mirrors the underlying instance's own `kind`, so a caller renders a test
  // instance distinctly without a separate lookup.
  kind: Instance["kind"];
  // The resolved body's own `baseLocale`. A caller resolving a field's
  // `LocalizedText` label falls back to this, not to the active locale
  // twice. Reported for every status, since it describes the process
  // rather than transient instance state.
  baseLocale: LocaleCode;
  step: { id: StepId; key: string; label: LocalizedText; type: StepType };
  fields: ResolvedViewEntry[];
  // The current step's `view.columns`, or 1 when the view declares none.
  // Reported for every status, the same way `step` is: it describes the step's
  // declared layout rather than instance state.
  columns: 1 | 2;
  // The current step's `view.tabs`, in declaration order, or an empty array
  // when the view declares none. Reported for every status, the same way
  // `columns` is: it describes the step's declared layout rather than
  // instance state.
  tabs: ResolvedViewTab[];
  // The current step's resolved collaboration settings — always fully
  // resolved booleans, never undefined. Reported for every status, the same
  // way baseLocale/columns/tabs are: it describes the step's declared
  // configuration rather than instance state.
  collaboration: { comments: boolean; attachments: boolean };
  availablePaths: AvailablePath[];
  // Whether the CALLING actor's own next call to cancelInstance would
  // succeed right now — never whether some other actor could cancel the
  // instance. False whenever `status` is not "running", mirroring
  // availablePaths; resolved through the same predicate cancelInstance
  // itself enforces (canActorCancelInstance), so the two cannot disagree.
  canCancel: boolean;
  // The instance's persisted claim state, in the shape InstanceSummary
  // carries. Absent when the current step declares no assignment: there is
  // nothing to claim, which is what a caller rendering claim controls needs
  // to know. Reported for every status, unlike availablePaths — a completed
  // instance still shows who held the final claim.
  assignment?: AssignmentState | null;
  // Absent unless redactInstance has run. The admin area's instance detail
  // screen uses this to show/disable the redact action and its badge.
  redactedAt?: string;
  // The participant's saved form draft, present only when a stored draft's
  // recorded step matches the current step — see
  // instance-form-drafts's "step_id gating" decision.
  draft?: { stepId: StepId; data: Record<string, unknown>; updatedBy: string; updatedAt: string };
};

// ============================================================
// Public operations
// ============================================================

/**
 * Create a new instance of the newest published version of `processId` (or
 * `opts.version`), optionally seeded with `opts.data`. `opts.data` is
 * validated against the initial step's resolved view before creation —
 * field-set boundary, type, option membership, constraints, and
 * `validation.rule`, against a stub Instance (minted id, transitionSeq 0,
 * the initial step, status derived the same way `store.ts::createInstance`
 * derives it) — and that same minted id is what actually gets created, so
 * the instance created is exactly the one that was validated. The required
 * check does NOT run here: requiredness is a transition-time gate (see
 * `validateSubmissionData`), so an instance may be created at a step with
 * required-but-unfilled fields and have them filled in later via
 * `submitAndTransition` — the ordinary "create empty, fill the first form"
 * flow.
 */
export async function createProcessInstance(
  processId: ProcessId,
  actor: Actor,
  registry: DataSourceRegistry,
  opts?: { version?: number; data?: Instance["data"]; fromDraft?: boolean },
  db: SQL = sql,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<Instance> {
  const store = getStore(db);
  let version: number;
  let body: ProcessBody;
  const kind: Instance["kind"] = opts?.fromDraft ? "test" : "published";
  if (opts?.fromDraft) {
    // draft-test-instances: run the process's CURRENT draft body, frozen at
    // this moment into draft_snapshots under a fresh negative sentinel — no
    // published version required. `processBody.parse` is the same structural
    // gate `resolveBody` applies on read (and the only one: no `compileProcessBody`/
    // `authoredProcessBody` invariant pass runs here, deliberately — see
    // draft-test-instances' "no dedicated pre-play validation" requirement).
    // An unresolvable reference the base schema already refines against
    // unconditionally (e.g. `workflow.initialStep` naming an absent step)
    // surfaces here as a diagnostic ZodError, not a crash.
    const draft = await getDraft(processId, db);
    if (!draft) throw new NotFoundError(`no draft: ${processId}`);
    body = processBodySchema.parse(draft.body);
    version = await createDraftSnapshot(processId, definitionHash(body), body, db);
  } else if (opts?.version !== undefined) {
    const resolved = await store.resolveBody(processId, opts.version);
    if (!resolved) throw new NotFoundError(`no published body for process ${processId} version ${opts.version}`);
    version = opts.version;
    body = resolved;
  } else {
    const latest = await store.resolveLatest(processId);
    if (!latest) throw new NotFoundError(`no published version for process ${processId}`);
    version = latest.version;
    body = latest.body;
  }

  const initial = findStep(body, body.workflow.initialStep as string);
  const submitted: Record<string, Literal> = (opts?.data as Record<string, Literal> | undefined) ?? {};
  const mintedId = `inst_${crypto.randomUUID()}` as InstanceId;
  const stub: Instance = {
    instanceId: mintedId,
    processId,
    version,
    definitionHash: definitionHash(body),
    currentStepId: initial.id,
    transitionSeq: 0,
    // The stub carries `submitted` directly, not `{}`: unlike
    // submitAndTransition (where "pre-submission" data is meaningful — an
    // existing instance's prior state), there is no earlier state here to
    // distinguish from. Field-set-boundary resolution (resolveFields, inside
    // validateSubmissionData) builds its guard context from this instance,
    // so a CEL-based `visible`/`required`/`readonly` on the initial step
    // must see the data being seeded, not an empty stand-in.
    data: submitted as Instance["data"],
    timers: [],
    status: initial.terminal ? "completed" : "running",
    startedAt: new Date().toISOString(),
    kind,
  };

  // Seeds the catalog's own `default` values into any slot `opts.data` left
  // open, before validation runs. `stub.data` and `submitted` are the same
  // object, so this mutates `submitted` in place — an explicitly submitted
  // value already there is never overwritten.
  const defaultedIds = applyFieldDefaults(body, stub, actor);

  // `committedData: {}` — nothing is committed yet. The stub's own `data` is
  // the seed payload `applyFieldDefaults` just wrote into, so reading held
  // values off it would let a seeded value (or a catalog `default`) appear in
  // its own resolved options and validate itself.
  const resolvedInitial = await validateSubmissionData(body, initial, stub, actor, submitted, registry, db, { checkRequired: false, defaultedIds, committedData: {} });

  // The write-back lands before the assignment resolves, so a strategy on the
  // initial step reads the final seed data, mapped values included. `submitted`
  // is the object `stub.data` aliases and `createInstance` writes, so mutating
  // it here is what carries the values onto the created instance.
  const mapped = applyColumnMapping(resolvedInitial, submitted, new Map(collectFieldsDeep(body.fields).map((f) => [f.id as string, f])));
  Object.assign(submitted, mapped.writes);

  // Creation is a step entry, so the initial step's candidates resolve here —
  // before `createInstance`, which calls no resolver — over the same minted id
  // and validated seed data the instance is actually created with.
  const { assignment, unresolved } = await resolveStepAssignment(
    initial,
    assignmentRegistry,
    { id: mintedId, startedBy: actor.id, data: submitted as Instance["data"] },
    db,
  );
  // Recorded at seq 0, which creation does not advance, and inside
  // createInstance's own transaction so it cannot outlive a rolled-back creation.
  const events: InstanceEvent[] = unresolved
    ? [{
        id: newInstanceEventId(),
        instanceId: mintedId as Instance["instanceId"],
        transitionSeq: 0,
        version,
        kind: "assignment.unresolved" as const,
        payload: { stepId: initial.id, reason: unresolved },
        at: new Date().toISOString(),
      }]
    : [];
  events.push(...droppedAttributeEvents(mapped.dropped, mintedId as Instance["instanceId"], version, 0));

  const created = await createInstance(
    body,
    { processId, version, instanceId: mintedId, data: submitted as Instance["data"], startedBy: actor.id, assignment, events, kind },
    db,
  );
  return resolveAutomatic(created, body, actor, db, assignmentRegistry);
}

/**
 * Resolve a display-ready view of an instance: its current step, resolved
 * fields, currently available manual paths, and claim state — for an instance
 * in any status. Uses the ordinary (unlocked) rehydrate path: a view is
 * read-only, so there is no concurrent writeback for it to race.
 *
 * `assignment` costs no extra read: loadInstanceForActor already consults it
 * to authorize the caller, so every caller reaching this return has passed
 * the claimant/candidate test against the value it now receives.
 */
export async function getInstanceView(instanceId: InstanceId, actor: Actor, registry: DataSourceRegistry, db: SQL = sql): Promise<InstanceView> {
  const { instance, body } = await loadInstanceForActor(instanceId, actor, db);
  const step = findStep(body, instance.currentStepId as string);
  const storedDraft = await getInstanceDraft(instanceId, db);
  return {
    instanceId: instance.instanceId,
    processId: instance.processId,
    version: instance.version,
    status: instance.status,
    kind: instance.kind,
    baseLocale: body.baseLocale,
    step: { id: step.id, key: step.key, label: step.label, type: step.type },
    fields: await resolveFields(body, step, instance, actor, registry, db),
    columns: step.view?.columns ?? 1,
    tabs: (step.view?.tabs ?? []).map((t) => ({ key: t.key, label: t.label })),
    collaboration: { comments: resolveCollaboration(body, step, "comments"), attachments: resolveCollaboration(body, step, "attachments") },
    availablePaths: instance.status === "running" ? resolveAvailablePaths(body, step, instance, actor) : [],
    canCancel: instance.status === "running" ? await canActorCancelInstance(actor, instance, body, db) : false,
    assignment: instance.assignment,
    redactedAt: instance.redactedAt,
    ...(storedDraft && storedDraft.stepId === step.id
      ? { draft: { stepId: storedDraft.stepId, data: storedDraft.data, updatedBy: storedDraft.updatedBy, updatedAt: storedDraft.updatedAt } }
      : {}),
  };
}

/**
 * Shared submit-authorization predicate, extracted so `submitAndTransition`
 * and `saveInstanceDraft` cannot drift. On a step with an assignment, only
 * the current claimant may act. On a step without one, the instance starter
 * or an `ADMIN_ROLE` holder may act. Throws `InstanceNotRunningError` first,
 * ahead of either authorization branch.
 */
function requireSubmitAuthority(instance: Instance, actor: Actor, instanceId: InstanceId): void {
  if (instance.status !== "running") throw new InstanceNotRunningError(instance.instanceId, instance.status);
  if (instance.assignment) {
    if (instance.assignment.claimedBy === undefined) throw new NotClaimedError(instanceId);
    if (instance.assignment.claimedBy !== actor.id) throw new NotClaimantError(instanceId, actor.id);
  } else if (instance.startedBy !== actor.id && !actor.roles.includes(ADMIN_ROLE)) {
    throw new AuthorizationError(`actor '${actor.id}' may not submit instance '${instanceId}'`);
  }
}

/**
 * Submit data and trigger a manual transition atomically. Reads the instance
 * row under a row lock (`SELECT ... FOR UPDATE`) inside its own transaction,
 * resolves and hash-verifies its pinned body, validates `data`, and — on
 * success — commits via `commitManualTransition` inside that same locked
 * transaction. The row lock exists because a wholesale `data` patch is not
 * protected by the `transitionSeq` OCC predicate: a concurrent
 * `Action.output` writeback patches a single field without advancing or
 * checking `transitionSeq`, so an unlocked read taken before such a
 * writeback lands, but committed after, would silently discard it.
 *
 * After that transaction commits, `resolveAutomatic` runs separately, with
 * the plain (unlocked) `db` — deliberately outside the lock, matching every
 * other automatic-cascade caller's transactional granularity. If that
 * cascade raises `AutomaticCascadeLoop`, the submitted data and manual
 * transition have already committed; this is not a rejected submission.
 */
export async function submitAndTransition(
  instanceId: InstanceId,
  pathId: PathId,
  data: Instance["data"],
  actor: Actor,
  registry: DataSourceRegistry,
  db: SQL = sql,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<Instance> {
  const store = getStore(db);
  const submitted = data as Record<string, Literal>;

  const committed = await withTransaction(db, async (tx) => {
    const rows = (await tx`SELECT body FROM instances WHERE instance_id = ${instanceId} FOR UPDATE`) as { body: unknown }[];
    if (rows.length === 0) throw new NotFoundError(`instance not found: ${instanceId}`);
    const instance = parseInstance(rows[0].body);

    // Exact, not optimistic: checked right after the locked read, before any
    // further work (body resolution, claim enforcement, validation). A
    // cancelled/completed/faulted instance answers InstanceNotRunningError
    // instead of silently discarding the submission and reporting success —
    // see runtime-api spec "An operation targeting a non-running instance is
    // rejected at the boundary". The engine-level no-op in
    // commitManualTransition stays, for internal idempotent re-entry.
    if (instance.status !== "running") throw new InstanceNotRunningError(instance.instanceId, instance.status);

    const body = await store.resolveBody(instance.processId, instance.version);
    if (!body) throw new NotFoundError(`no published body for process ${instance.processId} version ${instance.version}`);
    const gotHash = definitionHash(body);
    if (gotHash !== instance.definitionHash) throw new PinMismatch(instance.instanceId, instance.definitionHash, gotHash);

    const step = findStep(body, instance.currentStepId as string);

    requireSubmitAuthority(instance, actor, instanceId);

    const resolved = await validateSubmissionData(body, step, instance, actor, submitted, registry, tx);

    // After validation, never inside it: a `SubmissionValidationError` blames a
    // field on the participant's form, and a mismatching attribute is the
    // operator's data, not theirs. Before the commit, so a guard on the
    // outgoing path reads the mapped value.
    const mapped = applyColumnMapping(resolved, submitted, new Map(collectFieldsDeep(body.fields).map((f) => [f.id as string, f])));
    const patch = Object.keys(mapped.writes).length > 0 ? { ...(data ?? {}), ...mapped.writes } : data;
    // The drops share the seq the entry lands on, the way
    // `assignment.unresolved` already does for an event accompanying a hop.
    const events = droppedAttributeEvents(mapped.dropped, instance.instanceId, instance.version, instance.transitionSeq + 1);

    return commitManualTransition(instance, pathId, body, actor, tx, patch, assignmentRegistry, events);
  });

  const body = await store.resolveBody(committed.processId, committed.version);
  if (!body) throw new NotFoundError(`no published body for process ${committed.processId} version ${committed.version}`);
  return resolveAutomatic(committed, body, actor, db, assignmentRegistry);
}

/**
 * Save a participant's unfinished form input for a running instance, apart
 * from `instance.data`. Reads the instance unlocked — no `FOR UPDATE`, unlike
 * `submitAndTransition` — since the draft is a single-writer scratchpad with
 * no OCC token of its own (see design.md's accepted concurrent-transition
 * race). Shares `requireSubmitAuthority` with `submitAndTransition`, so the
 * two predicates cannot drift. `step_id` is derived from the instance's
 * current step, never accepted from the caller.
 */
export async function saveInstanceDraft(instanceId: InstanceId, data: unknown, actor: Actor, db: SQL = sql): Promise<InstanceDraft> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  if (rows.length === 0) throw new NotFoundError(`instance not found: ${instanceId}`);
  const instance = parseInstance(rows[0].body);
  requireSubmitAuthority(instance, actor, instanceId);
  return engineSaveInstanceDraft(instanceId, instance.currentStepId, data, actor.id, db);
}

/**
 * Whether `step`'s effective `cancellable` resolves to true: the step's own
 * value if declared, else the process's, else true when neither declares
 * one. Pure and synchronous — no DB access — so it is trivially unit
 * testable on its own, and safe to call from both the write path
 * (`cancelInstance`, via `canActorCancelInstance`) and the read path
 * (`getInstanceView`, via the same predicate).
 */
export function isCancellableAtStep(body: ProcessBody, step: Step): boolean {
  return step.cancellable ?? body.cancellable ?? true;
}

/**
 * Shared cancel-authorization predicate: `cancelInstance` calls it to
 * enforce (throwing on false), `getInstanceView` calls it to report
 * (`canCancel`) — parallel to `requireSubmitAuthority`, extracted so the two
 * cannot drift. `can(actor, "cancel", ...)` already composes the
 * `CANCEL_ANY_ROLE` role check and a stored per-process grant, and
 * short-circuits to true before `isCancellableAtStep` is ever consulted: the
 * cancellable gate binds the starter path alone, never the role or grant
 * path.
 *
 * ponytail: only starter-vs-operator is distinguished here; no
 * plugin/resolver for "who besides the starter may cancel" ships in v1 (see
 * instance-cancel-behavior's design.md Non-Goals) — extend here if that need
 * appears.
 */
async function canActorCancelInstance(actor: Actor, instance: Instance, body: ProcessBody, db: SQL): Promise<boolean> {
  if (await can(actor, "cancel", instance.processId, db)) return true;
  if (instance.startedBy !== actor.id) return false;
  // The fields govern a running instance only (specs/cancellation/spec.md);
  // the engine's own cancel primitive already no-ops on a non-running one,
  // so this predicate must defer to that rather than gate it.
  if (instance.status !== "running") return true;
  // findStep can throw on a body/step mismatch — safe only because the
  // starter and status checks above already ran, so only a starter of a
  // known, running instance reaches here.
  const step = findStep(body, instance.currentStepId as string);
  return isCancellableAtStep(body, step);
}

/**
 * Cancel a running instance, loading its instance/body pair the same way
 * `getInstanceView` does. Delegation to `engine/transition.ts::cancelInstance`
 * for the actual semantics — skip onExit, enqueue `[onCancel, sink.onEntry]`,
 * one cancel `HistoryEntry`, cascade to running children. A non-running
 * instance is returned unchanged, matching the engine's own no-op there.
 *
 * Two independent tests admit a caller (`src/auth/authorize.ts`). The
 * load-free one is `CANCEL_ANY_ROLE`, checked before the instance is loaded —
 * a holder is admitted regardless of whether the target instance exists, is
 * running, or is already terminal. The loaded one is `await can(actor,
 * "cancel", instance.processId, db)` beside the `startedBy` test.
 *
 * A grant names a process, and the process id only arrives with the
 * instance, which is why `can` sits in the loaded branch rather than the fast
 * path. A `system:cancel-any` holder never pays that load; a grant holder
 * does, because the fast path already put the global question and lost. The
 * two tests stay independent so neither can mask the other.
 *
 * A third, narrower test gates the starter path alone: the current step's
 * effective `cancellable` (`isCancellableAtStep`) must also resolve true.
 * `canActorCancelInstance` composes all three — the loaded branch below
 * calls it in place of a bare `can`/`startedBy` check. A `system:cancel-any`
 * holder or a grant holder short-circuits inside that predicate before the
 * cancellable gate is ever consulted, so declaring a process or step not
 * participant-cancellable can never strand a running instance no one is able
 * to cancel.
 */
export async function cancelInstance(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<Instance> {
  // Fast, load-free path: a system:cancel-any caller is authorized before any
  // instance lookup, exactly as before this function also accepted a case's
  // own starter.
  try {
    requireRole(actor, CANCEL_ANY_ROLE);
    const { instance, body } = await loadInstanceForRead(instanceId, db);
    const store = getStore(db);
    return engineCancelInstance(instance, body, actor, db, store.resolveBody);
  } catch (err) {
    if (!(err instanceof AuthorizationError)) throw err;
  }
  // Role-less path: authorizing requires loading the instance to check
  // startedBy. A caller lacking the role must learn nothing about the
  // instance from a failed attempt — an unresolvable instance and a
  // resolvable-but-not-mine one both collapse to the same AuthorizationError,
  // preserving the pre-existing "no role -> opaque 403, regardless of
  // whether the target exists" guarantee.
  let instance: Instance;
  let body: ProcessBody;
  try {
    ({ instance, body } = await loadInstanceForRead(instanceId, db));
  } catch {
    throw new AuthorizationError(`actor '${actor.id}' may not cancel instance '${instanceId}'`);
  }
  if (!(await canActorCancelInstance(actor, instance, body, db))) {
    throw new AuthorizationError(`actor '${actor.id}' may not cancel instance '${instanceId}'`);
  }
  const store = getStore(db);
  return engineCancelInstance(instance, body, actor, db, store.resolveBody);
}
