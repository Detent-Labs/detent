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
import { sql, createInstance, rehydrate, withTransaction, newInstanceEventId, PinMismatch } from "../engine/store.js";
import { createDefinitionStore } from "../engine/definitions.js";
import {
  commitManualTransition,
  resolveAutomatic,
  claimStep as engineClaimStep,
  releaseClaim as engineReleaseClaim,
  delegateClaim as engineDelegateClaim,
  cancelInstance as engineCancelInstance,
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
  UnknownDelegateError,
  isEligibleCandidate,
} from "../engine/transition.js";
import { buildGuardContext, evalGuard, type Actor } from "../cel/eval.js";
import { requireRole, CANCEL_ANY_ROLE, ADMIN_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE, AuthorizationError } from "../auth/authorize.js";
import { knownUserIds } from "../auth/users.js";
import { definitionHash } from "../schema/hash.js";
import { NotFoundError, InstanceNotRunningError } from "../errors.js";
import { encodeCursor, decodeCursor } from "../pagination.js";
import { instance as instanceSchema, historyEntry as historyEntrySchema, instanceEvent as instanceEventSchema, collectFieldsDeep, typeMatches, expectedTypeLabel } from "../schema/definition.js";
import {
  resolveDataSource,
  createDefaultAssignmentRegistry,
  resolveStepAssignment,
  type DataSourceRegistry,
  type AssignmentRegistry,
} from "../engine/registry.js";
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
  UnknownDelegateError,
  NotFoundError,
  InstanceNotRunningError,
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
  // How many of the view's columns this field occupies, resolved from the
  // matching `ViewField.span` and 1 when the view declares none. Presentation
  // only: it reaches no guard and no submission check. The renderer clamps it
  // to the grid it sits in, so this is the declared span, not the drawn one.
  span: 1 | 2;
};

export type AvailablePath = { id: PathId; key: string; label?: string };

export type InstanceView = {
  instanceId: InstanceId;
  processId: ProcessId;
  version: number;
  status: InstanceStatus;
  step: { id: StepId; key: string; label: LocalizedText; type: StepType };
  fields: ResolvedViewField[];
  // The current step's `view.columns`, or 1 when the view declares none.
  // Reported for every status, the same way `step` is: it describes the step's
  // declared layout rather than instance state.
  columns: 1 | 2;
  availablePaths: AvailablePath[];
  // The instance's persisted claim state, in the shape InstanceSummary
  // carries. Absent when the current step declares no assignment: there is
  // nothing to claim, which is what a caller rendering claim controls needs
  // to know. Reported for every status, unlike availablePaths — a completed
  // instance still shows who held the final claim.
  assignment?: AssignmentState | null;
  // Absent unless redactInstance has run. The admin area's instance detail
  // screen uses this to show/disable the redact action and its badge.
  redactedAt?: string;
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
 * Stands in for an `InstanceSummary` a page's caller opted into seeing
 * (`InstanceListFilter.includeDegraded`) when the instance's summary could
 * not be produced — its pinned `(processId, version)` has no resolvable
 * published body, or its `currentStepId` is absent from that body's steps.
 * Omits every field that needs a resolved body (`processLabel`, `stepLabel`,
 * `processBaseLocale`); `degraded: true` is the discriminant against
 * `InstanceSummary`, which never carries that field. See design.md
 * "A sibling type, not a widened InstanceSummary".
 */
export type DegradedInstanceSummary = {
  degraded: true;
  instanceId: InstanceId;
  processId: ProcessId;
  version: number;
  status: InstanceStatus;
  currentStepId: StepId;
  transitionSeq: number;
  startedBy?: string;
  createdAt: string;
  reason: "missing-definition" | "current-step-not-in-body";
};

export type InstanceSummaryItem = InstanceSummary | DegradedInstanceSummary;

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
  // Not a query filter: set by the caller's own authorization context (see
  // http-wrapper's `scope=all` / `ADMIN_ROLE` check), never from raw client
  // input. True degrades an unresolvable instance's item instead of omitting
  // it — see toSummary/listInstances and design.md "Gate visibility with an
  // includeDegraded filter field".
  includeDegraded?: boolean;
};

export type Page<T> = { items: T[]; cursor?: string };

export type InstanceRecordElement = { kind: "transition"; entry: HistoryEntry } | { kind: "event"; event: InstanceEvent };

// Not `Comment` — that name collides with the DOM's own `Comment` node
// interface, in scope wherever a caller's TypeScript config includes the
// `DOM` lib (e.g. packages/web).
export type InstanceComment = {
  id: string;
  instanceId: InstanceId;
  actorId: string;
  text: string;
  createdAt: string;
};

// Metadata only — never `data` — so a list response can never carry file
// bytes by accident. `getAttachment` returns the bytes separately.
export type InstanceAttachment = {
  id: string;
  instanceId: InstanceId;
  actorId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

const DEFAULT_LIST_LIMIT = 50;
/**
 * Exported so `http/routes.ts` clamps to the same bound at the boundary. The
 * `Math.min` calls below stay, so a caller that reaches this layer directly is
 * still bounded. `engine/admin-queries.ts` declares its own pair for the
 * routes it serves; the numbers agree today by coincidence, not by contract.
 */
export const MAX_LIST_LIMIT = 200;
const DEFAULT_RECORD_LIMIT = 100;
export const MAX_RECORD_LIMIT = 500;

/**
 * The instance's `currentStepId` is not among its pinned body's steps — a
 * structural mismatch, not a not-found condition (see findStep). Local to
 * this module: unlike `NotFoundError`, nothing outside `listInstances`
 * catches it, so it does not belong in `src/errors.ts`, which exists to
 * break import cycles between modules that throw and modules that map.
 */
class StepNotInBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepNotInBodyError";
  }
}

async function toSummary(inst: Instance, createdAt: string, store: DefinitionStore): Promise<InstanceSummary> {
  const body = await store.resolveBody(inst.processId, inst.version);
  if (!body) throw new NotFoundError(`no published body for process ${inst.processId} version ${inst.version}`);
  const step = body.workflow.steps.find((s) => s.id === inst.currentStepId);
  if (!step) throw new StepNotInBodyError(`current step not in body: ${inst.currentStepId}`);
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

function toDegradedSummary(inst: Instance, createdAt: string, reason: DegradedInstanceSummary["reason"]): DegradedInstanceSummary {
  return {
    degraded: true,
    instanceId: inst.instanceId,
    processId: inst.processId,
    version: inst.version,
    status: inst.status,
    currentStepId: inst.currentStepId,
    transitionSeq: inst.transitionSeq,
    startedBy: inst.startedBy,
    createdAt: new Date(createdAt).toISOString(),
    reason,
  };
}

/**
 * `toSummary`'s two known failure causes — a missing published body, or a
 * `currentStepId` absent from it — never fail the page. `includeDegraded`
 * decides how: true degrades the item, false or absent omits it from
 * `items` entirely (see design.md "Gate visibility with an includeDegraded
 * filter field"). Any other exception rethrows and still fails the whole
 * `listInstances` call — only these two already-understood causes get this
 * treatment.
 */
async function toSummaryItem(
  inst: Instance,
  createdAt: string,
  store: DefinitionStore,
  includeDegraded: boolean | undefined,
): Promise<InstanceSummaryItem | undefined> {
  try {
    return await toSummary(inst, createdAt, store);
  } catch (err) {
    let reason: DegradedInstanceSummary["reason"];
    if (err instanceof NotFoundError) reason = "missing-definition";
    else if (err instanceof StepNotInBodyError) reason = "current-step-not-in-body";
    else throw err;
    return includeDegraded ? toDegradedSummary(inst, createdAt, reason) : undefined;
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
  if (rows.length === 0) throw new NotFoundError(`instance not found: ${instanceId}`);
  const peek = parseInstance(rows[0].body);
  const store = getStore(db);
  const body = await store.resolveBody(peek.processId, peek.version);
  if (!body) throw new NotFoundError(`no published body for process ${peek.processId} version ${peek.version}`);
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
 * The values the instance holds for a field, as `DataSourceContext.heldValues`:
 * none when unset, one for a `select`, the whole array for a `multiselect`.
 * A handler that retires values returns a held one anyway, so the participant
 * keeps seeing its label and membership validation keeps accepting it.
 */
function heldValuesOf(value: Literal | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

/**
 * Resolve a `dataSource`-bound field's options via the registry, memoized by
 * `DataSourceId` together with the held values within one `resolveFields`
 * call, so fields on the same step sharing a data source *and* holding the
 * same values resolve it once. Held values join the key because they change
 * the result: two fields on one data source holding different values are two
 * distinct resolutions. A lookup miss here means the
 * registry passed at runtime differs from the one the body was published
 * against — publish-time `data-source-registry-validation` already confirmed
 * every declared type resolves — so it is a "should never happen" canary,
 * matching the project's existing style (e.g. the `definitionHash` pin
 * mismatch).
 */
function resolveDataSourceOptions(
  def: DataSourceDef,
  heldValues: string[],
  registry: DataSourceRegistry,
  cache: Map<string, Promise<FieldOption[]>>,
  db: SQL,
): Promise<FieldOption[]> {
  const sorted = [...heldValues].sort();
  const key = JSON.stringify([def.id as string, sorted]);
  let pending = cache.get(key);
  if (!pending) {
    const handler = resolveDataSource(registry, def.type);
    if (!handler) throw new Error(`data source type '${def.type}' is not registered in the runtime registry`);
    pending = handler.resolve({ config: def.config, heldValues: sorted, db });
    cache.set(key, pending);
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
async function resolveFields(body: ProcessBody, step: Step, instance: Instance, actor: Actor, registry: DataSourceRegistry, db: SQL): Promise<ResolvedViewField[]> {
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
      options = await resolveDataSourceOptions(def, heldValuesOf(value), registry, dataSourceCache, db);
    }
    out.push({ field, value, required, readonly, group: vf.group, options, span: vf.span ?? 1 });
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

/** One mapped attribute the engine refused to write, and why. */
export interface DroppedAttribute {
  fieldId: FieldId;
  column: string;
  targetFieldId: FieldId;
  reason: "type-mismatch";
}

/**
 * Apply every written field's `columnMapping` over the options already
 * resolved for submission validation.
 *
 * Walks `resolved`, which carries the step's VIEW order, not the request's own
 * key order: the client controls the latter, and two pickers writing in a
 * client-decided order is not a behavior anyone can reason about.
 *
 * A mapped target takes the mapped value even when the request also carries
 * one for it, and even when the view marks it readonly or never shows it. The
 * list owns a mapped field. The view bounds what a participant may change, not
 * what the engine may write.
 *
 * A mismatching attribute is dropped rather than failing the submission. The
 * mismatch comes from operator data, and the participant can do nothing about
 * it — the same rule `Action.output` already takes in the outbox.
 */
function applyColumnMapping(
  resolved: ResolvedViewField[],
  submitted: Record<string, Literal>,
  fieldsById: Map<string, FieldDef>,
): { writes: Record<string, Literal>; dropped: DroppedAttribute[] } {
  const writes: Record<string, Literal> = {};
  const dropped: DroppedAttribute[] = [];
  for (const rf of resolved) {
    const mapping = rf.field.columnMapping;
    if (!mapping) continue;
    const picked = submitted[rf.field.id as string];
    if (picked === undefined) continue; // the request did not write this field
    const option = rf.options?.find((o) => o.value === picked);
    if (!option?.attributes) continue; // no such option, or a row with nothing to carry
    for (const [column, targetId] of Object.entries(mapping)) {
      const attribute = option.attributes[column];
      if (attribute === undefined) continue; // an unfilled or undeclared column writes nothing
      const target = fieldsById.get(targetId as string);
      if (!target) continue; // publish-time invariant guarantees resolution; defensive only
      if (!typeMatches(target.type, attribute)) {
        dropped.push({ fieldId: rf.field.id, column, targetFieldId: targetId, reason: "type-mismatch" });
        continue;
      }
      writes[targetId as string] = attribute;
    }
  }
  return { writes, dropped };
}

/** The `datasource.attribute-dropped` records for one write-back's drops. */
function droppedAttributeEvents(
  dropped: DroppedAttribute[],
  instanceId: Instance["instanceId"],
  version: number,
  transitionSeq: number,
): InstanceEvent[] {
  const at = new Date().toISOString();
  return dropped.map((d) => ({
    id: newInstanceEventId(),
    instanceId,
    transitionSeq,
    version,
    kind: "datasource.attribute-dropped" as const,
    payload: { fieldId: d.fieldId, column: d.column, targetFieldId: d.targetFieldId, reason: d.reason },
    at,
  }));
}

function optionValuesValid(options: FieldOption[] | undefined, value: Literal): boolean {
  if (!options || options.length === 0) return true;
  const allowed = new Set(options.map((o) => o.value));
  if (Array.isArray(value)) return value.every((v) => typeof v === "string" && allowed.has(v));
  return typeof value === "string" && allowed.has(value);
}

// Compiled pattern cache, keyed by the immutable published body a pattern was
// declared in, then by the pattern source itself. A published body never
// changes, which is what makes it a sound cache key — the same property
// definitionHash relies on. A pattern reaching this cache is known to compile:
// the publish-time compile pass rejects one that does not
// (src/schema/compile.ts::checkPatterns), so construction failure here is no
// longer an expected condition.
const patternCache = new WeakMap<ProcessBody, Map<string, RegExp>>();

function compiledPattern(body: ProcessBody, pattern: string): RegExp {
  let forBody = patternCache.get(body);
  if (!forBody) {
    forBody = new Map();
    patternCache.set(body, forBody);
  }
  let re = forBody.get(pattern);
  if (!re) {
    re = new RegExp(pattern);
    forBody.set(pattern, re);
  }
  return re;
}

/**
 * `pattern` is evaluated only when this value's length constraints raised no
 * violation: a value already rejected on length is going to be rejected
 * regardless, so running a pattern — which may backtrack catastrophically and
 * which JavaScript cannot time out — against an over-long, submitter-supplied
 * string is unnecessary work with an unbounded worst case.
 */
function checkConstraints(
  body: ProcessBody,
  validation: FieldDef["validation"],
  value: Literal,
): ("min" | "max" | "minLength" | "maxLength" | "pattern")[] {
  const violations: ("min" | "max" | "minLength" | "maxLength" | "pattern")[] = [];
  if (!validation) return violations;
  if (typeof value === "number") {
    if (validation.min !== undefined && value < validation.min) violations.push("min");
    if (validation.max !== undefined && value > validation.max) violations.push("max");
  }
  let lengthOk = true;
  if (typeof value === "string" || Array.isArray(value)) {
    const len = value.length;
    if (validation.minLength !== undefined && len < validation.minLength) { violations.push("minLength"); lengthOk = false; }
    if (validation.maxLength !== undefined && len > validation.maxLength) { violations.push("maxLength"); lengthOk = false; }
  }
  if (typeof value === "string" && validation.pattern !== undefined && lengthOk) {
    if (!compiledPattern(body, validation.pattern).test(value)) violations.push("pattern");
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
  db: SQL,
  opts: { checkRequired: boolean } = { checkRequired: true },
): Promise<ResolvedViewField[]> {
  const resolved = await resolveFields(body, step, instance, actor, registry, db);
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
    for (const constraint of checkConstraints(body, rf.field.validation, value)) {
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
  // Returned so the caller's column-mapping write-back reads the options this
  // call already resolved, instead of resolving the step a second time.
  return resolved;
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
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<Instance> {
  const store = getStore(db);
  let version: number;
  let body: ProcessBody;
  if (opts?.version !== undefined) {
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
  };

  const resolvedInitial = await validateSubmissionData(body, initial, stub, actor, submitted, registry, db, { checkRequired: false });

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
    { processId, version, instanceId: mintedId, data: submitted as Instance["data"], startedBy: actor.id, assignment, events },
    db,
  );
  return resolveAutomatic(created, body, actor, db, assignmentRegistry);
}

/**
 * Loads an instance and authorizes `actor` to read it: `ADMIN_ROLE`, the
 * instance's starter, the current step's claimant, or an eligible candidate
 * on the current step's assignment (`isEligibleCandidate`, shared with
 * `claimStep` so the two predicates cannot drift). Load-failure handling
 * mirrors `cancelInstance`: an `ADMIN_ROLE` caller loads directly (a missing
 * instance surfaces as today's not-found); every other caller loads inside a
 * `try` whose `catch` collapses into `AuthorizationError`, so a nonexistent
 * instance and one the caller may not read are indistinguishable.
 *
 * Shared by `getInstanceView`, `postComment`, and `listComments` — every
 * Runtime API Layer read that uses this participant-facing visibility rule,
 * as opposed to `getInstanceRecord`'s narrower audit-trail one.
 */
async function loadInstanceForActor(instanceId: InstanceId, actor: Actor, db: SQL): Promise<{ instance: Instance; body: ProcessBody }> {
  if (actor.roles.includes(ADMIN_ROLE)) {
    return loadInstanceForRead(instanceId, db);
  }
  let instance: Instance;
  let body: ProcessBody;
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
  return { instance, body };
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
  return {
    instanceId: instance.instanceId,
    processId: instance.processId,
    version: instance.version,
    status: instance.status,
    step: { id: step.id, key: step.key, label: step.label, type: step.type },
    fields: await resolveFields(body, step, instance, actor, registry, db),
    columns: step.view?.columns ?? 1,
    availablePaths: instance.status === "running" ? resolveAvailablePaths(body, step, instance, actor) : [],
    assignment: instance.assignment,
    redactedAt: instance.redactedAt,
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
 * Claim the current step of a running instance. Thin delegation to the engine
 * implementation — see `engine/transition.ts::claimStep` for the row-lock,
 * candidate-eligibility, and exclusivity semantics.
 *
 * `engineClaimStep` no-ops (returns the instance unchanged) rather than
 * throwing when the instance is not running — that no-op exists for internal
 * idempotent re-entry and must stay. A *caller-initiated* claim needs to be
 * told, so this wrapper detects the no-op after the fact: claiming never
 * changes `status`, so a returned instance whose status is not `running` can
 * only mean the no-op branch fired against the row the engine's own row lock
 * read — exact, not a separate unlocked check racing it.
 */
export async function claimStep(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<Instance> {
  const updated = await engineClaimStep(instanceId, actor, db);
  if (updated.status !== "running") throw new InstanceNotRunningError(updated.instanceId, updated.status);
  return updated;
}

/**
 * Release a claim on the current step of a running instance. Thin delegation
 * to the engine implementation — see `engine/transition.ts::releaseClaim`.
 * Same non-running detection as `claimStep`, for the same reason.
 */
export async function releaseClaim(instanceId: InstanceId, actor: Actor, db: SQL = sql): Promise<Instance> {
  const updated = await engineReleaseClaim(instanceId, actor, db);
  if (updated.status !== "running") throw new InstanceNotRunningError(updated.instanceId, updated.status);
  return updated;
}

/**
 * Delegate a claim on the current step of a running instance to a named
 * actor. Delegation to the engine implementation — see
 * `engine/transition.ts::delegateClaim`. Same non-running detection as
 * `claimStep`/`releaseClaim`, for the same reason. `toActorId` is still not
 * checked against `assignment.candidates`: the contract permits delegating
 * outside the candidate set, and the `assignment.delegated` event records
 * exactly that.
 *
 * It IS checked against the local account directory, but only where the
 * delegating actor's own id resolves there. The engine cannot ask whether a
 * deployment uses local accounts — both resolvers can be active at once — so
 * it asks about this delegator instead. On an external identity provider the
 * answer is no and the target check does not run, which keeps this rule from
 * rejecting every delegation in such a deployment. One query answers both
 * halves, so the two facts cannot disagree.
 *
 * The check travels as a callback rather than running here, so the engine can
 * order it after its own claimant check and inside its row lock. Running it
 * first would make a non-claimant's error depend on whether the target exists,
 * turning this call into a directory-enumeration oracle.
 */
export async function delegateClaim(instanceId: InstanceId, actor: Actor, toActorId: string, db: SQL = sql): Promise<Instance> {
  const validateTarget = async (target: string): Promise<void> => {
    const known = await knownUserIds([actor.id, target], db);
    if (known.has(actor.id) && !known.has(target)) throw new UnknownDelegateError(target);
  };
  const updated = await engineDelegateClaim(instanceId, actor, toActorId, db, validateTarget);
  if (updated.status !== "running") throw new InstanceNotRunningError(updated.instanceId, updated.status);
  return updated;
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
): Promise<Page<InstanceSummaryItem>> {
  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorCreatedAt, cursorInstanceId] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];
  const statusArr = filter.status && filter.status.length > 0 ? db.array(filter.status, "TEXT") : null;
  const assignedToRolesArr = filter.assignedToRoles && filter.assignedToRoles.length > 0 ? db.array(filter.assignedToRoles, "TEXT") : null;

  // created_at::text (created_at_cursor) carries Postgres's full microsecond
  // precision, unlike the driver's own Date conversion of the plain
  // created_at column, which is only millisecond-precise. Building the
  // cursor from the lossy Date value let a boundary row's true,
  // sub-millisecond-earlier timestamp stop comparing "less than" its own
  // rounded-down cursor, silently dropping it (and any row between the
  // rounded cursor and the true boundary value) from the walk — see
  // fix-instance-list-cursor-precision's design.md. Encoding from the
  // lossless text avoids that entirely, the same fix listComments applies.
  const rows = (await db`
    SELECT instance_id, body, created_at, created_at::text AS created_at_cursor FROM instances
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
  ` as unknown) as { instance_id: string; body: unknown; created_at: string; created_at_cursor: string }[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const store = getStore(db);
  const resolved = await Promise.all(
    pageRows.map((r) => toSummaryItem(parseInstance(r.body), r.created_at, store, filter.includeDegraded)),
  );
  const items = resolved.filter((item): item is InstanceSummaryItem => item !== undefined);
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([last.created_at_cursor, last.instance_id]) : undefined;
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
 *
 * Authorization mirrors `cancelInstance`'s two-path shape: `ADMIN_ROLE` is
 * tried first and needs no instance load at all (this query never joins on
 * `instances`); only the fallback — the caller holds an authoring role and
 * started the instance themselves — needs `loadInstanceForRead` to learn
 * `startedBy`. A caller satisfying neither collapses "doesn't exist" and
 * "not mine" into the same opaque `AuthorizationError`.
 *
 * Either authoring role satisfies that fallback, `DEVELOPER_ROLE` and
 * `AUTHOR_ROLE` alike: the studio Player renders this record beside the form,
 * and both roles reach the Player. The starter condition is what bounds it —
 * neither role reads a record it did not create.
 */
export async function getInstanceRecord(
  instanceId: InstanceId,
  actor: Actor,
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceRecordElement>> {
  try {
    requireRole(actor, ADMIN_ROLE);
  } catch (err) {
    if (!(err instanceof AuthorizationError)) throw err;
    let instance: Instance;
    try {
      ({ instance } = await loadInstanceForRead(instanceId, db));
    } catch {
      throw new AuthorizationError(`actor '${actor.id}' may not read the record of instance '${instanceId}'`);
    }
    const authoring = actor.roles.includes(DEVELOPER_ROLE) || actor.roles.includes(AUTHOR_ROLE);
    if (!authoring || instance.startedBy !== actor.id) {
      throw new AuthorizationError(`actor '${actor.id}' may not read the record of instance '${instanceId}'`);
    }
  }
  const limit = Math.min(page.limit ?? DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT);
  const [cursorSeqRaw, cursorAt, cursorId] = page.cursor ? decodeCursor(page.cursor, 3) : [undefined, undefined, undefined];
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

/**
 * Post a free-text comment on an instance. Uses `loadInstanceForActor`'s
 * visibility rule — the same one `getInstanceView` applies — not
 * `getInstanceRecord`'s narrower audit-trail one, since a comment thread sits
 * beside the field view, not the record.
 *
 * `text` is trusted as already validated non-empty and within bound by the
 * caller (the HTTP wrapper's Zod schema): the same division of labour
 * `delegateClaim` already applies to `toActorId`. This function performs no
 * independent length or emptiness check.
 */
export async function postComment(instanceId: InstanceId, actor: Actor, text: string, db: SQL = sql): Promise<InstanceComment> {
  const { instance } = await loadInstanceForActor(instanceId, actor, db);
  const id = `comment_${crypto.randomUUID()}`;
  const rows = (await db`
    INSERT INTO instance_comments (id, instance_id, actor_id, text)
    VALUES (${id}, ${instance.instanceId}, ${actor.id}, ${text})
    RETURNING id, instance_id, actor_id, text, created_at
  ` as unknown) as { id: string; instance_id: string; actor_id: string; text: string; created_at: Date }[];
  const row = rows[0]!;
  return { id: row.id, instanceId: row.instance_id as InstanceId, actorId: row.actor_id, text: row.text, createdAt: row.created_at.toISOString() };
}

/**
 * List an instance's comments, oldest first, keyset-paginated by
 * `(created_at, id)` ascending — the reverse order `listInstances` and
 * `getInstanceRecord` sort in, matching a comment thread's natural reading
 * order. Applies the same visibility rule `postComment` applies.
 */
export async function listComments(
  instanceId: InstanceId,
  actor: Actor,
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceComment>> {
  await loadInstanceForActor(instanceId, actor, db);
  const limit = Math.min(page.limit ?? DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT);
  const [cursorCreatedAt, cursorId] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];

  // `created_at::text` (`created_at_cursor` below) carries Postgres's full
  // microsecond precision, unlike the driver's own `Date` conversion of the
  // plain `created_at` column, which is only millisecond-precise. Building
  // the cursor from the lossy `Date` value let the boundary row's true,
  // sub-millisecond-later timestamp compare greater than its own rounded
  // cursor on the next page, reintroducing that same row — confirmed via a
  // failing pagination test during this change's implementation. Encoding
  // from the lossless text avoids that entirely.
  const rows = (await db`
    SELECT id, instance_id, actor_id, text, created_at, created_at::text AS created_at_cursor FROM instance_comments
    WHERE instance_id = ${instanceId}
      AND (
        ${cursorCreatedAt ?? null}::timestamptz IS NULL
        OR (created_at, id) > (${cursorCreatedAt ?? null}::timestamptz, ${cursorId ?? null})
      )
    ORDER BY created_at ASC, id ASC
    LIMIT ${limit + 1}
  ` as unknown) as { id: string; instance_id: string; actor_id: string; text: string; created_at: Date; created_at_cursor: string }[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const items: InstanceComment[] = pageRows.map((r) => ({
    id: r.id,
    instanceId: r.instance_id as InstanceId,
    actorId: r.actor_id,
    text: r.text,
    createdAt: r.created_at.toISOString(),
  }));
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([last.created_at_cursor, last.id]) : undefined;
  return { items, cursor };
}

/**
 * Upload a file attachment to an instance. Uses `loadInstanceForActor`'s
 * visibility rule, the same one `postComment` applies.
 *
 * `data` and `sizeBytes` are trusted as already decoded and checked against
 * the configured size cap by the caller (the HTTP wrapper): the same
 * division of labour `postComment` already applies to `text`. This function
 * performs no independent decoding and no independent size check.
 */
export async function uploadAttachment(
  instanceId: InstanceId,
  actor: Actor,
  attachment: { filename: string; contentType: string; data: Uint8Array; sizeBytes: number },
  db: SQL = sql,
): Promise<InstanceAttachment> {
  const { instance } = await loadInstanceForActor(instanceId, actor, db);
  const id = `attachment_${crypto.randomUUID()}`;
  const rows = (await db`
    INSERT INTO instance_attachments (id, instance_id, actor_id, filename, content_type, size_bytes, data)
    VALUES (${id}, ${instance.instanceId}, ${actor.id}, ${attachment.filename}, ${attachment.contentType}, ${attachment.sizeBytes}, ${Buffer.from(attachment.data)})
    RETURNING id, instance_id, actor_id, filename, content_type, size_bytes, created_at
  ` as unknown) as { id: string; instance_id: string; actor_id: string; filename: string; content_type: string; size_bytes: number; created_at: Date }[];
  const row = rows[0]!;
  return {
    id: row.id,
    instanceId: row.instance_id as InstanceId,
    actorId: row.actor_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * List an instance's attachments, oldest first, keyset-paginated by
 * `(created_at, id)` ascending — the same shape `listComments` uses,
 * including its `created_at::text` lossless-cursor fix. Applies the same
 * visibility rule `uploadAttachment` applies. Never selects `data`.
 */
export async function listAttachments(
  instanceId: InstanceId,
  actor: Actor,
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceAttachment>> {
  await loadInstanceForActor(instanceId, actor, db);
  const limit = Math.min(page.limit ?? DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT);
  const [cursorCreatedAt, cursorId] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];

  const rows = (await db`
    SELECT id, instance_id, actor_id, filename, content_type, size_bytes, created_at, created_at::text AS created_at_cursor FROM instance_attachments
    WHERE instance_id = ${instanceId}
      AND (
        ${cursorCreatedAt ?? null}::timestamptz IS NULL
        OR (created_at, id) > (${cursorCreatedAt ?? null}::timestamptz, ${cursorId ?? null})
      )
    ORDER BY created_at ASC, id ASC
    LIMIT ${limit + 1}
  ` as unknown) as {
    id: string;
    instance_id: string;
    actor_id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    created_at: Date;
    created_at_cursor: string;
  }[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const items: InstanceAttachment[] = pageRows.map((r) => ({
    id: r.id,
    instanceId: r.instance_id as InstanceId,
    actorId: r.actor_id,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at.toISOString(),
  }));
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([last.created_at_cursor, last.id]) : undefined;
  return { items, cursor };
}

/**
 * Read one attachment's bytes. Applies the same visibility rule
 * `uploadAttachment` applies, then scopes the row lookup to BOTH
 * `attachmentId` and `instanceId` — without that second predicate, an actor
 * who may read instance A could download an attachment belonging to
 * instance B just by guessing its id, since `loadInstanceForActor` only
 * checks that the actor may read instance A. An `attachmentId` that does
 * not exist, or belongs to a different instance, is not found: this
 * mirrors `getInstanceRecord`'s own convention of a message-bearing
 * `NotFoundError`, not a distinct "wrong instance" error.
 */
export async function getAttachment(
  instanceId: InstanceId,
  attachmentId: string,
  actor: Actor,
  db: SQL = sql,
): Promise<{ filename: string; contentType: string; data: Uint8Array }> {
  await loadInstanceForActor(instanceId, actor, db);
  const rows = (await db`
    SELECT filename, content_type, data FROM instance_attachments
    WHERE id = ${attachmentId} AND instance_id = ${instanceId}
  ` as unknown) as { filename: string; content_type: string; data: Uint8Array }[];
  if (rows.length === 0) throw new NotFoundError(`attachment not found: ${attachmentId}`);
  const row = rows[0]!;
  return { filename: row.filename, contentType: row.content_type, data: row.data };
}
