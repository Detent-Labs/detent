/**
 * Runtime API Layer: the library boundary a UI (or, later, an HTTP server) can
 * call to run an instance without touching engine internals — create an
 * instance, resolve "what to display" for one, and submit data while
 * triggering a manual path. Not a transport: plain async TS functions.
 *
 * Callers never touch `ProcessBody` directly — only `processId`/`instanceId`.
 * This module resolves bodies internally via its own `createDefinitionStore`.
 */

import type { SQL } from "bun";
import { sql, createInstance, rehydrate, withTransaction, PinMismatch } from "../engine/store.js";
import { createDefinitionStore } from "../engine/definitions.js";
import {
  commitManualTransition,
  resolveAutomatic,
  claimStep as engineClaimStep,
  releaseClaim as engineReleaseClaim,
  cancelInstance as engineCancelInstance,
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
  isEligibleCandidate,
} from "../engine/transition.js";
import { buildGuardContext, evalGuard, type Actor } from "../cel/eval.js";
import { requireRole, CANCEL_ANY_ROLE, ADMIN_ROLE, AuthorizationError } from "../auth/authorize.js";
import { definitionHash } from "../schema/hash.js";
import { instance as instanceSchema, historyEntry as historyEntrySchema, instanceEvent as instanceEventSchema, collectFieldsDeep, typeMatches, expectedTypeLabel } from "../schema/definition.js";
import { resolveDataSource, type DataSourceRegistry } from "../engine/registry.js";
import type {
  ProcessId,
  InstanceId,
  PathId,
  FieldId,
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
  FieldDef,
  FieldOption,
  DataSourceDef,
  HistoryEntry,
  InstanceEvent,
} from "../schema/definition.js";

export {
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  PinMismatch,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
};

// ============================================================
// Public types
// ============================================================

export type ResolvedViewField = {
  field: FieldDef;
  value: Literal | undefined;
  required: boolean;
  readonly: boolean;
  group?: string;
  options?: FieldOption[];
};

export type AvailablePath = { id: PathId; key: string; label?: string };

export type InstanceView = {
  instanceId: InstanceId;
  processId: ProcessId;
  version: number;
  status: InstanceStatus;
  step: { id: StepId; key: string; label: LocalizedText; type: StepType };
  fields: ResolvedViewField[];
  availablePaths: AvailablePath[];
};

export type SubmissionIssue =
  | { kind: "unknown-field"; fieldId: FieldId }
  | { kind: "readonly-field"; fieldId: FieldId }
  | { kind: "type-mismatch"; fieldId: FieldId; expected: string }
  | { kind: "invalid-option"; fieldId: FieldId }
  | { kind: "constraint"; fieldId: FieldId; constraint: "min" | "max" | "minLength" | "maxLength" | "pattern" }
  | { kind: "rule-failed"; fieldId: FieldId }
  | { kind: "required-missing"; fieldId: FieldId };

export class SubmissionValidationError extends Error {
  constructor(readonly issues: SubmissionIssue[]) {
    super(issues.map((i) => `${i.fieldId}: ${i.kind}`).join("; "));
    this.name = "SubmissionValidationError";
  }
}

// ============================================================
// Instance listing + record reading
// ============================================================

/** Lifecycle state only — never the `data` payload. See design.md "Instance summaries exclude data". */
export type InstanceSummary = {
  instanceId: InstanceId;
  processId: ProcessId;
  version: number;
  status: InstanceStatus;
  currentStepId: StepId;
  transitionSeq: number;
  assignment?: AssignmentState | null;
  startedBy?: string;
  createdAt: string;
  // Absent only for an instance that predates this field; a caller falls
  // back to createdAt/startedAt in that case.
  currentStepEnteredAt?: string;
  // Raw LocalizedText maps (not resolved to one locale) — the caller picks
  // its own active locale with fallback to processBaseLocale.
  processLabel: LocalizedText;
  stepLabel: LocalizedText;
  processBaseLocale: LocaleCode;
};

/**
 * Filters combine conjunctively; `assignedTo` alone is a disjunction (see design.md).
 * `assignedToRoles` extends the unclaimed-candidate half of that disjunction to role
 * membership, not just literal id — `assignment.candidates` holds whichever of the two
 * a step's assignment was authored with. Only meaningful alongside `assignedTo`.
 */
export type InstanceListFilter = {
  processId?: ProcessId;
  status?: InstanceStatus[];
  currentStepId?: StepId;
  startedBy?: string;
  claimedBy?: string;
  assignedTo?: string;
  assignedToRoles?: string[];
};

export type Page<T> = { items: T[]; cursor?: string };

export type InstanceRecordElement = { kind: "transition"; entry: HistoryEntry } | { kind: "event"; event: InstanceEvent };

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_RECORD_LIMIT = 100;
const MAX_RECORD_LIMIT = 500;

function encodeCursor(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}
function decodeCursor(cursor: string): string[] {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as string[];
}

async function toSummary(inst: Instance, createdAt: string, store: DefinitionStore): Promise<InstanceSummary> {
  const body = await store.resolveBody(inst.processId, inst.version);
  if (!body) throw new Error(`no published body for process ${inst.processId} version ${inst.version}`);
  const step = body.workflow.steps.find((s) => s.id === inst.currentStepId);
  if (!step) throw new Error(`current step not in body: ${inst.currentStepId}`);
  return {
    instanceId: inst.instanceId,
    processId: inst.processId,
    version: inst.version,
    status: inst.status,
    currentStepId: inst.currentStepId,
    transitionSeq: inst.transitionSeq,
    assignment: inst.assignment,
    startedBy: inst.startedBy,
    createdAt: new Date(createdAt).toISOString(),
    currentStepEnteredAt: inst.currentStepEnteredAt ? new Date(inst.currentStepEnteredAt).toISOString() : undefined,
    processLabel: body.label,
    stepLabel: step.label,
    processBaseLocale: body.baseLocale,
  };
}

// ============================================================
// Internal: one definition store per distinct `db`, owned by this module.
// ============================================================

type DefinitionStore = ReturnType<typeof createDefinitionStore>;
const stores = new WeakMap<SQL, DefinitionStore>();
function getStore(db: SQL): DefinitionStore {
  let store = stores.get(db);
  if (!store) {
    store = createDefinitionStore(db);
    stores.set(db, store);
  }
  return store;
}

function parseInstance(raw: unknown): Instance {
  return instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

function isGroupField(f: FieldDef): boolean {
  return typeof f.type === "string" && f.type === "group";
}

/** Read-only load: unlocked peek for processId/version, then resolveBody, then rehydrate's pin check. */
async function loadInstanceForRead(instanceId: string, db: SQL): Promise<{ instance: Instance; body: ProcessBody }> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  if (rows.length === 0) throw new Error(`instance not found: ${instanceId}`);
  const peek = parseInstance(rows[0].body);
  const store = getStore(db);
  const body = await store.resolveBody(peek.processId, peek.version);
  if (!body) throw new Error(`no published body for process ${peek.processId} version ${peek.version}`);
  const instance = await rehydrate(peek.instanceId, body, db);
  return { instance, body };
}

/**
 * Resolve a plain `boolean | Expression | undefined` view flag. `evalGuard`
 * only accepts `Expression | undefined`, not a raw boolean, so the union
 * needs this small dispatch.
 */
function resolveFlag(v: boolean | { lang: "cel"; src: string } | undefined, ctx: Record<string, unknown>, defaultWhenAbsent: boolean): boolean {
  if (v === undefined) return defaultWhenAbsent;
  if (typeof v === "boolean") return v;
  return evalGuard(v, ctx);
}

/**
 * Resolve a `dataSource`-bound field's options via the registry, memoized by
 * `DataSourceId` within one `resolveFields` call so fields on the same step
 * sharing a data source resolve it once. A lookup miss here means the
 * registry passed at runtime differs from the one the body was published
 * against — publish-time `data-source-registry-validation` already confirmed
 * every declared type resolves — so it is a "should never happen" canary,
 * matching the project's existing style (e.g. the `definitionHash` pin
 * mismatch).
 */
function resolveDataSourceOptions(
  def: DataSourceDef,
  registry: DataSourceRegistry,
  cache: Map<string, Promise<FieldOption[]>>,
): Promise<FieldOption[]> {
  const dsId = def.id as string;
  let pending = cache.get(dsId);
  if (!pending) {
    const handler = resolveDataSource(registry, def.type);
    if (!handler) throw new Error(`data source type '${def.type}' is not registered in the runtime registry`);
    pending = handler.resolve({ config: def.config });
    cache.set(dsId, pending);
  }
  return pending;
}

/**
 * Resolve a step's ViewFields against the field catalog and current data.
 * Invisible fields are omitted. A group-container FieldDef (never a leaf
 * value in `instance.data`) is still included when visible, so a UI can
 * render its label/grouping, but its `value` is always `undefined` and its
 * `required`/`readonly` are always reported `false` regardless of the view's
 * own declaration — it is never part of the required or editable sets.
 *
 * `options` is populated from static `FieldDef.options` unchanged, or —
 * for a `dataSource`-bound field — resolved at runtime via `registry`. This
 * is the single place downstream code (submission validation, view
 * rendering) reads options from, instead of reading `FieldDef.options`
 * directly.
 */
async function resolveFields(body: ProcessBody, step: Step, instance: Instance, actor: Actor, registry: DataSourceRegistry): Promise<ResolvedViewField[]> {
  const ctx = buildGuardContext(body, instance, actor);
  const fieldsById = new Map(collectFieldsDeep(body.fields).map((f) => [f.id as string, f]));
  const dataSourcesById = new Map((body.dataSources ?? []).map((d) => [d.id as string, d]));
  const dataSourceCache = new Map<string, Promise<FieldOption[]>>();
  const out: ResolvedViewField[] = [];
  for (const vf of step.view?.fields ?? []) {
    const field = fieldsById.get(vf.ref as string);
    if (!field) continue; // publish-time invariant guarantees resolution; defensive only
    if (!resolveFlag(vf.visible, ctx, true)) continue;
    const group = isGroupField(field);
    const required = group ? false : resolveFlag(vf.required, ctx, false);
    const readonly = group ? false : resolveFlag(vf.readonly, ctx, false);
    const value = group ? undefined : (instance.data[field.id] as Literal | undefined);
    let options: FieldOption[] | undefined = field.options;
    if (field.dataSource) {
      const def = dataSourcesById.get(field.dataSource as string);
      if (!def) throw new Error(`data source not found: ${field.dataSource}`); // publish-time invariant guarantees resolution; defensive only
      options = await resolveDataSourceOptions(def, registry, dataSourceCache);
    }
    out.push({ field, value, required, readonly, group: vf.group, options });
  }
  return out;
}

/** Visible-and-editable field ids (`visible && !readonly`), excluding group-container refs. */
function editableFieldIds(resolved: ResolvedViewField[]): Set<string> {
  return new Set(resolved.filter((r) => !isGroupField(r.field) && !r.readonly).map((r) => r.field.id as string));
}

/** Visible-and-required field ids, excluding group-container refs. */
function requiredFieldIds(resolved: ResolvedViewField[]): Set<string> {
  return new Set(resolved.filter((r) => !isGroupField(r.field) && r.required).map((r) => r.field.id as string));
}

/** Manual paths on `step` whose guard currently holds (guardless always qualifies). */
function resolveAvailablePaths(body: ProcessBody, step: Step, instance: Instance, actor: Actor): AvailablePath[] {
  const ctx = buildGuardContext(body, instance, actor);
  return (step.paths ?? [])
    .filter((p) => p.trigger === "manual" && evalGuard(p.guard, ctx))
    .map((p) => ({ id: p.id, key: p.key, label: p.label }));
}

function findStep(body: ProcessBody, stepId: string): Step {
  const step = body.workflow.steps.find((s) => (s.id as string) === stepId);
  if (!step) throw new Error(`current step not in body: ${stepId}`);
  return step;
}

// ============================================================
// Submission validation
// ============================================================

function optionValuesValid(options: FieldOption[] | undefined, value: Literal): boolean {
  if (!options || options.length === 0) return true;
  const allowed = new Set(options.map((o) => o.value));
  if (Array.isArray(value)) return value.every((v) => typeof v === "string" && allowed.has(v));
  return typeof value === "string" && allowed.has(value);
}

function checkConstraints(validation: FieldDef["validation"], value: Literal): ("min" | "max" | "minLength" | "maxLength" | "pattern")[] {
  const violations: ("min" | "max" | "minLength" | "maxLength" | "pattern")[] = [];
  if (!validation) return violations;
  if (typeof value === "number") {
    if (validation.min !== undefined && value < validation.min) violations.push("min");
    if (validation.max !== undefined && value > validation.max) violations.push("max");
  }
  if (typeof value === "string" || Array.isArray(value)) {
    const len = value.length;
    if (validation.minLength !== undefined && len < validation.minLength) violations.push("minLength");
    if (validation.maxLength !== undefined && len > validation.maxLength) violations.push("maxLength");
  }
  if (typeof value === "string" && validation.pattern !== undefined) {
    if (!new RegExp(validation.pattern).test(value)) violations.push("pattern");
  }
  return violations;
}

/**
 * Validate `data` against `step`'s resolved view, over `instance`'s
 * pre-submission committed data. Collects every located issue rather than
 * failing on the first; throws `SubmissionValidationError` if any exist.
 * Used identically by `submitAndTransition` and `createProcessInstance`'s
 * `opts.data` seed (against the initial step, with `instance` a stub with
 * empty `data`) — with `checkRequired: false`: requiredness is a
 * transition-time gate enforced whenever a step is actually *left* via a
 * manual path (exactly what `submitAndTransition` checks on every call,
 * regardless of which path is taken), not an existence-time gate on being
 * created on or resting at a step. Enforcing it at creation would block the
 * ordinary "create an empty instance, then fill in the first step's form via
 * `submitAndTransition`" flow — the same flow the expense-approval example's
 * "capture" step relies on, since it is also the initial step.
 */
async function validateSubmissionData(
  body: ProcessBody,
  step: Step,
  instance: Instance,
  actor: Actor,
  data: Record<string, Literal>,
  registry: DataSourceRegistry,
  opts: { checkRequired: boolean } = { checkRequired: true },
): Promise<void> {
  const resolved = await resolveFields(body, step, instance, actor, registry);
  const fieldsById = new Map(resolved.map((r) => [r.field.id as string, r]));
  const editable = editableFieldIds(resolved);
  const required = requiredFieldIds(resolved);

  const issues: SubmissionIssue[] = [];
  const mergedData: Record<string, Literal> = { ...instance.data, ...data };
  const guardCtx = buildGuardContext(body, { ...instance, data: mergedData }, actor);

  for (const fieldId of Object.keys(data)) {
    const rf = fieldsById.get(fieldId);
    if (!rf || isGroupField(rf.field) || !editable.has(fieldId)) {
      if (rf && !isGroupField(rf.field) && rf.readonly) {
        issues.push({ kind: "readonly-field", fieldId: fieldId as FieldId });
      } else {
        issues.push({ kind: "unknown-field", fieldId: fieldId as FieldId });
      }
      continue;
    }
    const value = data[fieldId] as Literal;
    if (!typeMatches(rf.field.type, value)) {
      issues.push({ kind: "type-mismatch", fieldId: fieldId as FieldId, expected: expectedTypeLabel(rf.field.type) });
      continue; // skip further checks on a value of the wrong shape
    }
    if (!optionValuesValid(rf.options, value)) {
      issues.push({ kind: "invalid-option", fieldId: fieldId as FieldId });
    }
    for (const constraint of checkConstraints(rf.field.validation, value)) {
      issues.push({ kind: "constraint", fieldId: fieldId as FieldId, constraint });
    }
    const rule = rf.field.validation?.rule;
    if (rule && !evalGuard(rule, guardCtx)) {
      issues.push({ kind: "rule-failed", fieldId: fieldId as FieldId });
    }
  }

  if (opts.checkRequired) {
    for (const fieldId of required) {
      if (mergedData[fieldId] === undefined) {
        issues.push({ kind: "required-missing", fieldId: fieldId as FieldId });
      }
    }
  }

  if (issues.length > 0) throw new SubmissionValidationError(issues);
}

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
  opts?: { version?: number; data?: Instance["data"] },
  db: SQL = sql,
): Promise<Instance> {
  const store = getStore(db);
  let version: number;
  let body: ProcessBody;
  if (opts?.version !== undefined) {
    const resolved = await store.resolveBody(processId, opts.version);
    if (!resolved) throw new Error(`no published body for process ${processId} version ${opts.version}`);
    version = opts.version;
    body = resolved;
  } else {
    const latest = await store.resolveLatest(processId);
    if (!latest) throw new Error(`no published version for process ${processId}`);
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
  };

  await validateSubmissionData(body, initial, stub, actor, submitted, registry, { checkRequired: false });

  const created = await createInstance(
    body,
    { processId, version, instanceId: mintedId, data: submitted as Instance["data"], startedBy: actor.id },
    db,
  );
  return resolveAutomatic(created, body, actor, db);
}

/**
 * Resolve a display-ready view of an instance: its current step, resolved
 * fields, and currently available manual paths — for an instance in any
 * status. Uses the ordinary (unlocked) rehydrate path: a view is read-only,
 * so there is no concurrent writeback for it to race.
 *
 * Authorizes `actor` against the loaded instance before resolving anything:
 * `ADMIN_ROLE`, the instance's starter, the current step's claimant, or an
 * eligible candidate on the current step's assignment (`isEligibleCandidate`,
 * shared with `claimStep` so the two predicates cannot drift). Load-failure
 * handling mirrors `cancelInstance`: an `ADMIN_ROLE` caller loads directly (a
 * missing instance surfaces as today's not-found); every other caller loads
 * inside a `try` whose `catch` collapses into `AuthorizationError`, so a
 * nonexistent instance and one the caller may not read are indistinguishable.
 */
export async function getInstanceView(instanceId: InstanceId, actor: Actor, registry: DataSourceRegistry, db: SQL = sql): Promise<InstanceView> {
  let instance: Instance;
  let body: ProcessBody;
  if (actor.roles.includes(ADMIN_ROLE)) {
    ({ instance, body } = await loadInstanceForRead(instanceId, db));
  } else {
    try {
      ({ instance, body } = await loadInstanceForRead(instanceId, db));
    } catch {
      throw new AuthorizationError(`actor '${actor.id}' may not read instance '${instanceId}'`);
    }
    if (
      instance.startedBy !== actor.id &&
      instance.assignment?.claimedBy !== actor.id &&
      !isEligibleCandidate(actor, instance.assignment?.candidates ?? [])
    ) {
      throw new AuthorizationError(`actor '${actor.id}' may not read instance '${instanceId}'`);
    }
  }
  const step = findStep(body, instance.currentStepId as string);
  return {
    instanceId: instance.instanceId,
    processId: instance.processId,
    version: instance.version,
    status: instance.status,
    step: { id: step.id, key: step.key, label: step.label, type: step.type },
    fields: await resolveFields(body, step, instance, actor, registry),
    availablePaths: instance.status === "running" ? resolveAvailablePaths(body, step, instance, actor) : [],
  };
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
): Promise<Instance> {
  const store = getStore(db);
  const submitted = data as Record<string, Literal>;

  const committed = await withTransaction(db, async (tx) => {
    const rows = (await tx`SELECT body FROM instances WHERE instance_id = ${instanceId} FOR UPDATE`) as { body: unknown }[];
    if (rows.length === 0) throw new Error(`instance not found: ${instanceId}`);
    const instance = parseInstance(rows[0].body);

    const body = await store.resolveBody(instance.processId, instance.version);
    if (!body) throw new Error(`no published body for process ${instance.processId} version ${instance.version}`);
    const gotHash = definitionHash(body);
    if (gotHash !== instance.definitionHash) throw new PinMismatch(instance.instanceId, instance.definitionHash, gotHash);

    const step = findStep(body, instance.currentStepId as string);

    // Claimant-only enforcement: before any submission validation. A step
    // with no declared assignment is not thereby open to every authenticated
    // actor — the floor is starter or ADMIN_ROLE, the only relationships an
    // assignment-less step defines.
    if (instance.assignment) {
      if (instance.assignment.claimedBy === undefined) throw new NotClaimedError(instanceId);
      if (instance.assignment.claimedBy !== actor.id) throw new NotClaimantError(instanceId, actor.id);
    } else if (instance.startedBy !== actor.id && !actor.roles.includes(ADMIN_ROLE)) {
      throw new AuthorizationError(`actor '${actor.id}' may not submit instance '${instanceId}'`);
    }

    await validateSubmissionData(body, step, instance, actor, submitted, registry);

    return commitManualTransition(instance, pathId, body, actor, tx, data);
  });

  const body = await store.resolveBody(committed.processId, committed.version);
  if (!body) throw new Error(`no published body for process ${committed.processId} version ${committed.version}`);
  return resolveAutomatic(committed, body, actor, db);
}

/**
 * Claim the current step of a running instance. Thin delegation to the engine
 * implementation — see `engine/transition.ts::claimStep` for the row-lock,
 * candidate-eligibility, and exclusivity semantics.
 */
export async function claimStep(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<Instance> {
  return engineClaimStep(instanceId, actor, db);
}

/**
 * Release a claim on the current step of a running instance. Thin delegation
 * to the engine implementation — see `engine/transition.ts::releaseClaim`.
 */
export async function releaseClaim(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<Instance> {
  return engineReleaseClaim(instanceId, actor, db);
}

/**
 * Cancel a running instance, loading its instance/body pair the same way
 * `getInstanceView` does. Delegation to `engine/transition.ts::cancelInstance`
 * for the actual semantics — skip onExit, enqueue `[onCancel, sink.onEntry]`,
 * one cancel `HistoryEntry`, cascade to running children. A non-running
 * instance is returned unchanged, matching the engine's own no-op there.
 *
 * Requires `CANCEL_ANY_ROLE` on `actor` (`src/auth/authorize.ts`), checked
 * before the instance is loaded — a caller without the role is rejected
 * regardless of whether the target instance exists, is running, or is
 * already terminal.
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
  if (instance.startedBy !== actor.id) {
    throw new AuthorizationError(`actor '${actor.id}' may not cancel instance '${instanceId}'`);
  }
  const store = getStore(db);
  return engineCancelInstance(instance, body, actor, db, store.resolveBody);
}

/**
 * List instance summaries, conjunctively filtered, keyset-paginated
 * newest-first by `(created_at, instance_id)`. `assignedTo` is the single
 * inbox predicate — claimed by that actor, OR unclaimed and that actor is
 * among the current step's assignment candidates — expressed once here
 * rather than as two filters a caller would have to combine correctly. No
 * filter implicitly scopes to the caller; an unfiltered call returns every
 * instance.
 */
export async function listInstances(
  filter: InstanceListFilter = {},
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceSummary>> {
  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorCreatedAt, cursorInstanceId] = page.cursor ? decodeCursor(page.cursor) : [undefined, undefined];
  const statusArr = filter.status && filter.status.length > 0 ? db.array(filter.status, "TEXT") : null;
  const assignedToRolesArr = filter.assignedToRoles && filter.assignedToRoles.length > 0 ? db.array(filter.assignedToRoles, "TEXT") : null;

  const rows = (await db`
    SELECT instance_id, body, created_at FROM instances
    WHERE (${filter.processId ?? null}::text IS NULL OR body->>'processId' = ${filter.processId ?? null})
      AND (${statusArr}::text[] IS NULL OR body->>'status' = ANY(${statusArr}))
      AND (${filter.currentStepId ?? null}::text IS NULL OR body->>'currentStepId' = ${filter.currentStepId ?? null})
      AND (${filter.startedBy ?? null}::text IS NULL OR body->>'startedBy' = ${filter.startedBy ?? null})
      AND (${filter.claimedBy ?? null}::text IS NULL OR body->'assignment'->>'claimedBy' = ${filter.claimedBy ?? null})
      AND (
        ${filter.assignedTo ?? null}::text IS NULL
        OR body->'assignment'->>'claimedBy' = ${filter.assignedTo ?? null}
        OR (body->'assignment'->>'claimedBy' IS NULL AND (
          body->'assignment'->'candidates' @> to_jsonb(${filter.assignedTo ?? null}::text)
          OR (${assignedToRolesArr}::text[] IS NOT NULL AND body->'assignment'->'candidates' ?| ${assignedToRolesArr})
        ))
      )
      AND (
        ${cursorCreatedAt ?? null}::timestamptz IS NULL
        OR (created_at, instance_id) < (${cursorCreatedAt ?? null}::timestamptz, ${cursorInstanceId ?? null})
      )
    ORDER BY created_at DESC, instance_id DESC
    LIMIT ${limit + 1}
  ` as unknown) as { instance_id: string; body: unknown; created_at: string }[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const store = getStore(db);
  const items = await Promise.all(pageRows.map((r) => toSummary(parseInstance(r.body), r.created_at, store)));
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([new Date(last.created_at).toISOString(), last.instance_id]) : undefined;
  return { items, cursor };
}

/**
 * Read one instance's runtime record — its `HistoryEntry` rows merged with
 * its `InstanceEvent` rows into one chronologically ordered, discriminated
 * sequence, ordered `transitionSeq` ascending then `at` ascending (an event
 * never advances the sequence and may share one with a transition or with
 * other events — see CLAUDE.md's runtime-record section). The merge and its
 * ordering rule live here, not with callers: exporting two unmerged arrays
 * would export the ordering rule to every consumer instead. An unknown
 * instance has written nothing, so its record is an empty sequence, not an
 * error — matching `findOrphanKeys`'s and `listInstances`'s choice not to
 * invent a not-found case for a filter that simply matches nothing.
 */
export async function getInstanceRecord(
  instanceId: InstanceId,
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceRecordElement>> {
  const limit = Math.min(page.limit ?? DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT);
  const [cursorSeqRaw, cursorAt, cursorId] = page.cursor ? decodeCursor(page.cursor) : [undefined, undefined, undefined];
  const cursorSeq = cursorSeqRaw !== undefined ? Number(cursorSeqRaw) : null;

  const rows = (await db`
    SELECT id, transition_seq, kind, payload, at FROM (
      SELECT id, transition_seq, 'transition' AS kind, entry AS payload, (entry->>'at') AS at
      FROM history_entries WHERE instance_id = ${instanceId}
      UNION ALL
      SELECT id, transition_seq, 'event' AS kind, event AS payload, (event->>'at') AS at
      FROM instance_events WHERE instance_id = ${instanceId}
    ) record
    WHERE (
      ${cursorSeq}::int IS NULL
      OR (transition_seq, at, id) > (${cursorSeq}::int, ${cursorAt ?? null}::text, ${cursorId ?? null})
    )
    ORDER BY transition_seq ASC, at ASC, id ASC
    LIMIT ${limit + 1}
  ` as unknown) as { id: string; transition_seq: number; kind: "transition" | "event"; payload: unknown; at: string }[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const items: InstanceRecordElement[] = pageRows.map((r) => {
    const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return r.kind === "transition"
      ? { kind: "transition" as const, entry: historyEntrySchema.parse(payload) }
      : { kind: "event" as const, event: instanceEventSchema.parse(payload) };
  });
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([String(last.transition_seq), last.at, last.id]) : undefined;
  return { items, cursor };
}
