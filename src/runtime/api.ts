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
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
} from "../engine/transition.js";
import { buildGuardContext, evalGuard, type Actor } from "../cel/eval.js";
import { definitionHash } from "../schema/hash.js";
import { instance as instanceSchema, collectFieldsDeep } from "../schema/definition.js";
import type {
  ProcessId,
  InstanceId,
  PathId,
  FieldId,
  Literal,
  Instance,
  InstanceStatus,
  ProcessBody,
  Step,
  StepId,
  StepType,
  LocalizedText,
  FieldDef,
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
 * Resolve a step's ViewFields against the field catalog and current data.
 * Invisible fields are omitted. A group-container FieldDef (never a leaf
 * value in `instance.data`) is still included when visible, so a UI can
 * render its label/grouping, but its `value` is always `undefined` and its
 * `required`/`readonly` are always reported `false` regardless of the view's
 * own declaration — it is never part of the required or editable sets.
 */
function resolveFields(body: ProcessBody, step: Step, instance: Instance, actor: Actor): ResolvedViewField[] {
  const ctx = buildGuardContext(body, instance, actor);
  const fieldsById = new Map(collectFieldsDeep(body.fields).map((f) => [f.id as string, f]));
  const out: ResolvedViewField[] = [];
  for (const vf of step.view?.fields ?? []) {
    const field = fieldsById.get(vf.ref as string);
    if (!field) continue; // publish-time invariant guarantees resolution; defensive only
    if (!resolveFlag(vf.visible, ctx, true)) continue;
    const group = isGroupField(field);
    const required = group ? false : resolveFlag(vf.required, ctx, false);
    const readonly = group ? false : resolveFlag(vf.readonly, ctx, false);
    const value = group ? undefined : (instance.data[field.id] as Literal | undefined);
    out.push({ field, value, required, readonly, group: vf.group });
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

/** Baseline JS-shape check per FieldDef.type, mirroring check.ts::celType's mapping. */
function typeMatches(fieldType: FieldDef["type"], value: Literal): boolean {
  if (typeof fieldType !== "string") return true; // plugin type: opaque, accept
  switch (fieldType) {
    case "string":
    case "date":
    case "datetime":
    case "select":
    case "reference":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "multiselect":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "file":
    case "group":
      return true; // opaque / unreachable (group refs are excluded before this is called)
    default:
      return true;
  }
}

function expectedTypeLabel(fieldType: FieldDef["type"]): string {
  if (typeof fieldType !== "string") return "any";
  switch (fieldType) {
    case "string":
    case "date":
    case "datetime":
    case "select":
    case "reference":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "multiselect":
      return "string[]";
    default:
      return "any";
  }
}

function optionValuesValid(field: FieldDef, value: Literal): boolean {
  if (!field.options || field.options.length === 0) return true;
  const allowed = new Set(field.options.map((o) => o.value));
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
function validateSubmissionData(
  body: ProcessBody,
  step: Step,
  instance: Instance,
  actor: Actor,
  data: Record<string, Literal>,
  opts: { checkRequired: boolean } = { checkRequired: true },
): void {
  const resolved = resolveFields(body, step, instance, actor);
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
    if (!optionValuesValid(rf.field, value)) {
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

  validateSubmissionData(body, initial, stub, actor, submitted, { checkRequired: false });

  const created = await createInstance(body, { processId, version, instanceId: mintedId, data: submitted as Instance["data"] }, db);
  return resolveAutomatic(created, body, actor, db);
}

/**
 * Resolve a display-ready view of an instance: its current step, resolved
 * fields, and currently available manual paths — for an instance in any
 * status. Uses the ordinary (unlocked) rehydrate path: a view is read-only,
 * so there is no concurrent writeback for it to race.
 */
export async function getInstanceView(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<InstanceView> {
  const { instance, body } = await loadInstanceForRead(instanceId, db);
  const step = findStep(body, instance.currentStepId as string);
  return {
    instanceId: instance.instanceId,
    processId: instance.processId,
    version: instance.version,
    status: instance.status,
    step: { id: step.id, key: step.key, label: step.label, type: step.type },
    fields: resolveFields(body, step, instance, actor),
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

    // Claimant-only enforcement: before any submission validation. A step with
    // no declared assignment is unaffected — identical to today's behavior.
    if (instance.assignment) {
      if (instance.assignment.claimedBy === undefined) throw new NotClaimedError(instanceId);
      if (instance.assignment.claimedBy !== actor.id) throw new NotClaimantError(instanceId, actor.id);
    }

    validateSubmissionData(body, step, instance, actor, submitted);

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
