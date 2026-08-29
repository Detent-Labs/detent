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
import { buildGuardContext, evalGuard, evalFieldMap, type Actor } from "../cel/eval.js";
import { requireRole, can, CANCEL_ANY_ROLE, ADMIN_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE, AuthorizationError } from "../auth/authorize.js";
import { knownUserIds } from "../auth/users.js";
import { getGroupMembers, getGroupsForMember } from "../auth/groups.js";
import { definitionHash } from "../schema/hash.js";
import { NotFoundError, InstanceNotRunningError, RequestShapeError } from "../errors.js";
import { saveInstanceDraft as engineSaveInstanceDraft, getInstanceDraft, type InstanceDraft } from "../engine/instance-drafts.js";
import { encodeCursor, decodeCursor } from "../pagination.js";
import { instance as instanceSchema, historyEntry as historyEntrySchema, instanceEvent as instanceEventSchema, collectFieldsDeep, leafFields, typeMatches, expectedTypeLabel } from "../schema/definition.js";
import {
  createDefaultAssignmentRegistry,
  resolveStepAssignment,
  type DataSourceRegistry,
  type DataSourceContext,
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
  FieldValidation,
  Expression,
  ViewField,
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
export type { InstanceDraft };

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
  // Mirrors the underlying instance's own `kind`, so a caller renders a test
  // instance distinctly without a separate lookup.
  kind: Instance["kind"];
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
  // The participant's saved form draft, present only when a stored draft's
  // recorded step matches the current step — see
  // instance-form-drafts's "step_id gating" decision.
  draft?: { stepId: StepId; data: Record<string, unknown>; updatedBy: string; updatedAt: string };
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
 * A `dataWhere` comparison against one field of `Instance.data`. The right
 * side (`value`) is a scalar `Literal` — string, number, boolean or null —
 * for `"eq"`/`"ne"`, and a non-empty list of such scalars for `"in"`. Not a
 * discriminated union: a caller can hand a malformed shape (an array where a
 * scalar belongs, or vice versa), and `buildDataWhere`'s validation raises a
 * `RequestShapeError` rather than trusting the type. See design.md "A
 * dataWhere right side is a scalar literal".
 */
export type DataComparison = {
  fieldId: FieldId;
  operator: "eq" | "ne" | "in";
  value: Literal | Literal[];
};

/**
 * Filters combine conjunctively; `assignedTo` alone is a disjunction (see design.md).
 * `assignedToRoles` extends the unclaimed-candidate half of that disjunction to role
 * membership, not just literal id — `assignment.candidates` holds whichever of the two
 * a step's assignment was authored with. Only meaningful alongside `assignedTo`.
 *
 * `version` needs `processId` beside it (`instances_selection_idx` reaches
 * its `version` column only with the leading `processId` column bound), the
 * same rule `dataWhere` carries. `dataWhere` needs `processId` beside it too:
 * a field id anchors to one process's field catalog. See
 * `instance-data-query`'s spec for `dataWhere`'s own semantics.
 */
export type InstanceListFilter = {
  processId?: ProcessId;
  version?: number;
  status?: InstanceStatus[];
  currentStepId?: StepId;
  startedBy?: string;
  claimedBy?: string;
  assignedTo?: string;
  assignedToRoles?: string[];
  excludeInstanceId?: InstanceId;
  createdAfter?: string;
  createdBefore?: string;
  dataWhere?: DataComparison[];
  // Not a query filter: set by the caller's own authorization context (see
  // http-wrapper's `scope=all` / `ADMIN_ROLE` check), never from raw client
  // input. True degrades an unresolvable instance's item instead of omitting
  // it — see toSummary/listInstances and design.md "Gate visibility with an
  // includeDegraded filter field".
  includeDegraded?: boolean;
};

/**
 * `queryInstances`'s own filter type — the ten members `instance-data-query`'s
 * spec enumerates, and nothing else. No `assignedTo`, `assignedToRoles` or
 * `includeDegraded`: those resolve the list read's inbox predicate and
 * degraded-summary behaviour, neither of which this read has. See design.md
 * "The data read takes its own filter type and rejects a borrowed key".
 */
export type InstanceQueryFilter = {
  processId?: ProcessId;
  version?: number;
  status?: InstanceStatus[];
  currentStepId?: StepId | StepId[];
  startedBy?: string;
  claimedBy?: string;
  excludeInstanceId?: InstanceId;
  instanceIds?: InstanceId[];
  createdAfter?: string;
  createdBefore?: string;
  dataWhere?: DataComparison[];
};

/** One matched instance's data, with nothing `queryInstances` would pay to resolve and discard. See design.md "The data read resolves no labels". */
export type InstanceDataItem = {
  instanceId: InstanceId;
  version: number;
  data: Instance["data"];
  redactedAt?: string;
};

/** Not `Page<InstanceDataItem>`: `queryInstances` takes no cursor and hands none back — `truncated` says what a cursor would otherwise imply. See design.md "The data read bounds rather than pages". */
export type InstanceDataPage = { items: InstanceDataItem[]; truncated: boolean };

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
 * The hasMore/slice/last-row/encodeCursor tail shared by every
 * keyset-paginated read in this module (`listInstances`, `getInstanceRecord`,
 * `listComments`, `listAttachments`). Takes the raw rows overfetched via
 * `LIMIT limit + 1` and a row-to-cursor-tuple mapper, and returns the sliced
 * page, whether more remain, and the next cursor. Does not map rows to
 * items — every call site's mapping is applied to `pageRows` separately,
 * since the four are not uniform (`listInstances`'s is `async` and filters
 * out `undefined` results, which a single `toItem` parameter here could not
 * express without forcing every other caller through `await`). See
 * design.md.
 */
function keysetPage<Row>(
  rows: Row[],
  limit: number,
  cursorOf: (row: Row) => string[],
): { pageRows: Row[]; hasMore: boolean; cursor: string | undefined } {
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor(cursorOf(last)) : undefined;
  return { pageRows, hasMore, cursor };
}

/**
 * Run a keyset-paginated, `instanceId`-scoped read shared by `listComments`
 * and `listAttachments`, ordered `created_at ASC, id ASC`. `table` and
 * `columns` are caller-controlled constants, never request input. Always
 * selects `created_at::text AS created_at_cursor` alongside `columns`:
 * Postgres's full microsecond precision, unlike the driver's own `Date`
 * conversion of the plain `created_at` column (millisecond-precise only),
 * which let a boundary row's true, sub-millisecond-later timestamp compare
 * greater than its own rounded cursor on the next page, reintroducing that
 * same row — confirmed via a failing pagination test during this helper's
 * introduction. Returns the raw overfetched rows (up to `limit + 1`); does
 * not map rows to items, matching `keysetPage`'s split.
 */
async function pagedRead<Row>(
  db: SQL,
  table: string,
  columns: string,
  instanceId: InstanceId,
  limit: number,
  cursor: string | undefined,
): Promise<Row[]> {
  const [cursorCreatedAt, cursorId] = cursor ? decodeCursor(cursor, 2) : [undefined, undefined];
  return (await db.unsafe(
    `SELECT ${columns}, created_at::text AS created_at_cursor FROM ${table}
     WHERE instance_id = $1
       AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3))
     ORDER BY created_at ASC, id ASC
     LIMIT $4`,
    [instanceId, cursorCreatedAt ?? null, cursorId ?? null, limit + 1],
  )) as Row[];
}

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
 * Resolve a `dataSource`-bound field's options via the registry. Held values
 * are sorted before reaching the handler, so a multiselect's array order
 * never leaks into what the handler sees. A missing handler here means the
 * registry passed at runtime differs from the one the body was published
 * against — publish-time `data-source-registry-validation` already confirmed
 * every declared type resolves — so it is a "should never happen" canary,
 * matching the project's existing style (e.g. the `definitionHash` pin
 * mismatch).
 */
function resolveDataSourceOptions(
  def: DataSourceDef,
  heldValues: string[],
  instance: DataSourceContext["instance"],
  registry: DataSourceRegistry,
  db: SQL,
): Promise<FieldOption[]> {
  const handler = registry.get(def.type);
  if (!handler) throw new Error(`data source type '${def.type}' is not registered in the runtime registry`);
  return handler.resolve({ config: def.config, heldValues: [...heldValues].sort(), instance, db });
}

/**
 * Resolve a step's ViewFields against the field catalog and current data.
 * Invisible fields are omitted. A group-container FieldDef (never a leaf
 * value in `instance.data`) is still included when visible, so a UI can
 * render its label/grouping, but its `value` is always `undefined` and its
 * `required`/`readonly` are always reported `false` regardless of the view's
 * own declaration — it is never part of the required or editable sets.
 *
 * A `FieldDef.technical: true` field resolves `required: false, readonly:
 * true` the same way, whatever its view entry says (the compile pass already
 * forbids one from declaring either key). Where a body declares both
 * `type: "group"` and `technical: true` on one field — a shape the compile
 * pass also rejects, but `resolveFields` also runs against an uncompiled
 * body — the group rule wins: both flags resolve `false`.
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
  // Committed data, not a merged submission payload: a handler comparing
  // against the reader's own values must read the value a field held at step
  // entry, not one the caller is submitting right now. See design.md
  // "instance.data is the instance's committed data".
  const dsInstance: DataSourceContext["instance"] = {
    id: instance.instanceId,
    processId: instance.processId,
    data: instance.data,
    baseLocale: body.baseLocale,
  };
  const out: ResolvedViewField[] = [];
  for (const vf of step.view?.fields ?? []) {
    const field = fieldsById.get(vf.ref as string);
    if (!field) continue; // publish-time invariant guarantees resolution; defensive only
    if (!resolveFlag(vf.visible, ctx, true)) continue;
    const group = isGroupField(field);
    const technical = !group && field.technical === true;
    const required = group || technical ? false : resolveFlag(vf.required, ctx, false);
    const readonly = group ? false : technical ? true : resolveFlag(vf.readonly, ctx, false);
    const value = group ? undefined : (instance.data[field.id] as Literal | undefined);
    let options: FieldOption[] | undefined = field.options;
    if (field.dataSource) {
      const def = dataSourcesById.get(field.dataSource as string);
      if (!def) throw new Error(`data source not found: ${field.dataSource}`); // publish-time invariant guarantees resolution; defensive only
      options = await resolveDataSourceOptions(def, heldValuesOf(value), dsInstance, registry, db);
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

const asExpression = (v: Literal | Expression | undefined): Expression | undefined =>
  v !== undefined && v !== null && typeof v === "object" && !Array.isArray(v) && (v as { lang?: unknown }).lang === "cel"
    ? (v as Expression)
    : undefined;

/**
 * Seed `stub.data`'s open slots from the field catalog's own `default`
 * values, walking `leafFields(body.fields)` in catalog order. Mutates
 * `stub.data` in place, so a later field's `Expression` default sees an
 * earlier field's already-resolved value through the same guard context
 * every other guard evaluation builds (`buildGuardContext`). A `group`
 * field's own `default` is never read: `leafFields` already excludes it.
 *
 * Returns the set of field ids this filled, distinct from ids the caller's
 * own `opts.data` supplied directly — `validateSubmissionData` judges each
 * set by a different rule (design.md Decision 3).
 */
function applyFieldDefaults(body: ProcessBody, stub: Instance, actor: Actor): Set<string> {
  const working = stub.data as Record<string, Literal>;
  const filled = new Set<string>();
  for (const field of leafFields(body.fields)) {
    if (field.default === undefined) continue;
    const fieldId = field.id as string;
    if (working[fieldId] !== undefined) continue;
    const expr = asExpression(field.default);
    if (!expr) {
      working[fieldId] = field.default as Literal;
      filled.add(fieldId);
      continue;
    }
    const ctx = buildGuardContext(body, stub, actor);
    const { patch } = evalFieldMap({ [fieldId]: expr }, ctx);
    if (fieldId in patch) {
      working[fieldId] = patch[fieldId] as Literal;
      filled.add(fieldId);
    }
  }
  return filled;
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
 * The validation in force for `field` in the step whose view field is `vf`.
 * Absent `vf` or an absent `vf.validation` means the catalog's own value
 * applies unchanged. A present `vf.validation` overlays the catalog's keys
 * under `vf.validationMode === "merge"` (the default), or replaces it whole
 * under `"replace"`. This is deliberately NOT reported on `ResolvedViewField`:
 * that type reaches `GET /instances/:id` unchanged via `getInstanceView`, and
 * a bound belongs to the submission check, not the wire.
 */
function effectiveValidation(field: FieldDef, vf: ViewField | undefined): FieldValidation | undefined {
  if (!vf?.validation) return field.validation;
  if (vf.validationMode === "replace") return vf.validation;
  return { ...field.validation, ...vf.validation };
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
  opts: { checkRequired: boolean; defaultedIds?: Set<string> } = { checkRequired: true },
): Promise<ResolvedViewField[]> {
  const defaultedIds = opts.defaultedIds ?? new Set<string>();
  const resolved = await resolveFields(body, step, instance, actor, registry, db);
  const fieldsById = new Map(resolved.map((r) => [r.field.id as string, r]));
  const catalogById = new Map(leafFields(body.fields).map((f) => [f.id as string, f]));
  const viewFieldsByRef = new Map((step.view?.fields ?? []).map((vf) => [vf.ref as string, vf]));
  const editable = editableFieldIds(resolved);
  const required = requiredFieldIds(resolved);

  const issues: SubmissionIssue[] = [];
  const mergedData: Record<string, Literal> = { ...instance.data, ...data };
  const guardCtx = buildGuardContext(body, { ...instance, data: mergedData }, actor);

  for (const fieldId of Object.keys(data)) {
    const rf = fieldsById.get(fieldId);
    const value = data[fieldId] as Literal;

    // Off-view default (design.md Decision 3): no ResolvedViewField exists to
    // check against, so validate directly against the catalog entry's own
    // declared type/options/validation instead of the unknown-field rejection
    // an explicitly submitted value for the same field id still draws.
    if (defaultedIds.has(fieldId) && !rf) {
      const field = catalogById.get(fieldId);
      if (!field) {
        issues.push({ kind: "unknown-field", fieldId: fieldId as FieldId });
        continue;
      }
      if (!typeMatches(field.type, value)) {
        issues.push({ kind: "type-mismatch", fieldId: fieldId as FieldId, expected: expectedTypeLabel(field.type) });
        continue;
      }
      if (!field.dataSource && !optionValuesValid(field.options, value)) {
        issues.push({ kind: "invalid-option", fieldId: fieldId as FieldId });
      }
      for (const constraint of checkConstraints(body, field.validation, value)) {
        issues.push({ kind: "constraint", fieldId: fieldId as FieldId, constraint });
      }
      if (field.validation?.rule && !evalGuard(field.validation.rule, guardCtx)) {
        issues.push({ kind: "rule-failed", fieldId: fieldId as FieldId });
      }
      continue;
    }

    // On-view, readonly default (including `technical: true`): skip only the
    // readonly-field rejection. An explicitly submitted value for the same
    // field id still draws it — `defaultedIds` never contains a field id
    // `opts.data` supplied directly.
    const readonlyExempt = defaultedIds.has(fieldId) && !!rf && !isGroupField(rf.field) && rf.readonly;
    if (!rf || isGroupField(rf.field) || (!editable.has(fieldId) && !readonlyExempt)) {
      if (rf && !isGroupField(rf.field) && rf.readonly && !readonlyExempt) {
        issues.push({ kind: "readonly-field", fieldId: fieldId as FieldId });
      } else {
        issues.push({ kind: "unknown-field", fieldId: fieldId as FieldId });
      }
      continue;
    }
    if (!typeMatches(rf.field.type, value)) {
      issues.push({ kind: "type-mismatch", fieldId: fieldId as FieldId, expected: expectedTypeLabel(rf.field.type) });
      continue; // skip further checks on a value of the wrong shape
    }
    if (!optionValuesValid(rf.options, value)) {
      issues.push({ kind: "invalid-option", fieldId: fieldId as FieldId });
    }
    const validation = effectiveValidation(rf.field, viewFieldsByRef.get(fieldId));
    for (const constraint of checkConstraints(body, validation, value)) {
      issues.push({ kind: "constraint", fieldId: fieldId as FieldId, constraint });
    }
    const rule = validation?.rule;
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
    kind: "published",
  };

  // Seeds the catalog's own `default` values into any slot `opts.data` left
  // open, before validation runs. `stub.data` and `submitted` are the same
  // object, so this mutates `submitted` in place — an explicitly submitted
  // value already there is never overwritten.
  const defaultedIds = applyFieldDefaults(body, stub, actor);

  const resolvedInitial = await validateSubmissionData(body, initial, stub, actor, submitted, registry, db, { checkRequired: false, defaultedIds });

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
  const storedDraft = await getInstanceDraft(instanceId, db);
  return {
    instanceId: instance.instanceId,
    processId: instance.processId,
    version: instance.version,
    status: instance.status,
    kind: instance.kind,
    step: { id: step.id, key: step.key, label: step.label, type: step.type },
    fields: await resolveFields(body, step, instance, actor, registry, db),
    columns: step.view?.columns ?? 1,
    availablePaths: instance.status === "running" ? resolveAvailablePaths(body, step, instance, actor) : [],
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
  if (!(await can(actor, "cancel", instance.processId, db)) && instance.startedBy !== actor.id) {
    throw new AuthorizationError(`actor '${actor.id}' may not cancel instance '${instanceId}'`);
  }
  const store = getStore(db);
  return engineCancelInstance(instance, body, actor, db, store.resolveBody);
}

/**
 * The filters `buildInstanceWhere` compiles — every member both `listInstances` and `queryInstances` share, minus `dataWhere` (compiled separately by `buildDataWhere`) and `includeDegraded` (selects no row).
 * `currentStepId` widens past `InstanceListFilter`'s own single-id member: `listInstances` keeps passing one id, for free, while `queryInstances` can pass a set. `instanceIds` has no `InstanceListFilter` counterpart at all — no list-read caller needs it.
 */
type InstanceWhereFilter = Omit<InstanceListFilter, "includeDegraded" | "dataWhere" | "currentStepId"> & {
  currentStepId?: StepId | StepId[];
  instanceIds?: InstanceId[];
};

/**
 * The `WHERE` fragment both `listInstances` and `queryInstances` interpolate.
 * Builds no statement, chooses no projection, and knows nothing about paging
 * or a cursor — see design.md "The predicate is a SQL fragment builder, not a
 * query builder". `excludeInstanceId` compares the `instance_id` column
 * directly rather than `body->>'instanceId'`, since that column is the
 * table's own key.
 */
export function buildInstanceWhere(filter: InstanceWhereFilter, db: SQL) {
  const statusArr = filter.status && filter.status.length > 0 ? db.array(filter.status, "TEXT") : null;
  const assignedToRolesArr = filter.assignedToRoles && filter.assignedToRoles.length > 0 ? db.array(filter.assignedToRoles, "TEXT") : null;
  // instances_selection_idx indexes body->>'version' as text — see design.md
  // "The version filter compares as text".
  const versionText = filter.version !== undefined ? String(filter.version) : null;
  const currentStepIdArr = Array.isArray(filter.currentStepId)
    ? db.array(filter.currentStepId, "TEXT")
    : filter.currentStepId
      ? db.array([filter.currentStepId], "TEXT")
      : null;
  const instanceIdsArr = filter.instanceIds && filter.instanceIds.length > 0 ? db.array(filter.instanceIds, "TEXT") : null;
  return db`
    (${filter.processId ?? null}::text IS NULL OR body->>'processId' = ${filter.processId ?? null})
    AND (${versionText}::text IS NULL OR body->>'version' = ${versionText})
    AND (${statusArr}::text[] IS NULL OR body->>'status' = ANY(${statusArr}))
    AND (${currentStepIdArr}::text[] IS NULL OR body->>'currentStepId' = ANY(${currentStepIdArr}))
    AND (${instanceIdsArr}::text[] IS NULL OR instance_id = ANY(${instanceIdsArr}))
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
    AND (${filter.excludeInstanceId ?? null}::text IS NULL OR instance_id <> ${filter.excludeInstanceId ?? null})
    AND (${filter.createdAfter ?? null}::timestamptz IS NULL OR created_at >= ${filter.createdAfter ?? null}::timestamptz)
    AND (${filter.createdBefore ?? null}::timestamptz IS NULL OR created_at <= ${filter.createdBefore ?? null}::timestamptz)
  `;
}

/**
 * Compiles one `dataWhere` comparison against `body->'data'`. Equality
 * compiles to jsonb containment — indexable by a future GIN index over
 * `body->'data'`, per design.md. Inequality and membership read
 * `body->'data'->fieldId` directly, SQL `NULL` for an absent key, which is
 * the mechanism behind "an absent field does not match, and does not fail".
 * Every bound JSON value casts `::text::jsonb`, never `::jsonb` alone: the
 * driver sends a value as text, so an uncast comparison reads a string
 * literal's content as bare JSON rather than a quoted JSON string — see
 * design.md "Equality compiles to jsonb containment" for the measured
 * reasoning. `fieldId` casts `::text` only where it lands in
 * `jsonb_build_object`'s `VARIADIC "any"` argument, which cannot otherwise
 * resolve a type for it; the `->` operator resolves an uncast text parameter
 * on its own.
 */
function compileDataComparison(c: DataComparison, db: SQL) {
  if (c.operator === "eq") {
    return db`body->'data' @> jsonb_build_object(${c.fieldId}::text, ${JSON.stringify(c.value)}::text::jsonb)`;
  }
  if (c.operator === "ne") {
    return db`body->'data'->${c.fieldId} <> ${JSON.stringify(c.value)}::text::jsonb`;
  }
  return db`body->'data'->${c.fieldId} IN (SELECT jsonb_array_elements(${JSON.stringify(c.value)}::text::jsonb))`;
}

/**
 * Folds a `dataWhere` list into one fragment, conjunctively — a left-nested
 * reduce, measured (design.md) to bind correctly and in order at any
 * comparison count. An empty or absent `dataWhere` folds to `TRUE`: an empty
 * fragment is not valid SQL inside `WHERE ${...}`.
 */
export function buildDataWhere(comparisons: DataComparison[] | undefined, db: SQL) {
  if (!comparisons || comparisons.length === 0) return db`TRUE`;
  return comparisons.map((c) => compileDataComparison(c, db)).reduce((acc, frag) => db`${acc} AND ${frag}`);
}

function isDataScalar(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * Rejects a non-scalar `dataWhere` right side before any query runs: an array
 * or object for `eq`/`ne`, a non-scalar member or an empty list for `in`. See
 * design.md "A dataWhere right side is a scalar literal".
 */
function validateDataComparisons(comparisons: DataComparison[] | undefined): void {
  if (!comparisons) return;
  for (const c of comparisons) {
    if (c.operator === "in") {
      if (!Array.isArray(c.value)) throw new RequestShapeError(`dataWhere membership comparison on '${c.fieldId}' needs a list right side`);
      if (c.value.length === 0) throw new RequestShapeError(`dataWhere membership comparison on '${c.fieldId}' needs a non-empty list`);
      for (const v of c.value) {
        if (!isDataScalar(v)) throw new RequestShapeError(`dataWhere membership comparison on '${c.fieldId}' holds a non-scalar value`);
      }
    } else if (!isDataScalar(c.value)) {
      throw new RequestShapeError(`dataWhere comparison on '${c.fieldId}' needs a scalar right side`);
    }
  }
}

/** A version number anchors to one process; `instances_selection_idx` reaches its `version` column only with `processId` bound beside it. See design.md "The version filter compares as text". */
function assertVersionHasProcessId(filter: { processId?: ProcessId; version?: number }): void {
  if (filter.version !== undefined && !filter.processId) {
    throw new RequestShapeError("a version filter needs a processId beside it");
  }
}

/** A field id anchors to one process's field catalog; a dataWhere with no processId would scan an unindexed payload across every process. See design.md "A dataWhere needs a processId". */
function assertDataWhereHasProcessId(filter: { processId?: ProcessId; dataWhere?: DataComparison[] }): void {
  if (filter.dataWhere && filter.dataWhere.length > 0 && !filter.processId) {
    throw new RequestShapeError("a dataWhere filter needs a processId beside it");
  }
}

/**
 * An empty `currentStepId` array or an empty `instanceIds` array is a caller
 * error, the same rule a `dataWhere` membership comparison's empty right side
 * already carries: an empty list matches nothing, so accepting one would
 * silently answer the whole read with an empty result rather than the
 * "no filter" a caller might have meant.
 */
function assertNoEmptyListFilters(filter: InstanceQueryFilter): void {
  if (Array.isArray(filter.currentStepId) && filter.currentStepId.length === 0) {
    throw new RequestShapeError("queryInstances currentStepId list must not be empty");
  }
  if (filter.instanceIds && filter.instanceIds.length === 0) {
    throw new RequestShapeError("queryInstances instanceIds list must not be empty");
  }
}

/**
 * Probes each `dataWhere`-compared field id, one query per distinct id, over
 * the rows the OTHER filters already select — never the cursor predicate, so
 * every page of a walk evaluates the same probe. A returned row means a
 * selected instance holds an array or object under that field id, which
 * containment/`<>`/`IN` would otherwise silently treat as "no match" rather
 * than the caller error the spec requires. See design.md "A comparison names
 * a scalar-valued field".
 */
async function assertNoNonScalarComparedField(filter: InstanceWhereFilter, comparisons: DataComparison[] | undefined, db: SQL): Promise<void> {
  if (!comparisons || comparisons.length === 0) return;
  const fieldIds = [...new Set(comparisons.map((c) => c.fieldId))];
  for (const fieldId of fieldIds) {
    const rows = (await db`
      SELECT 1 FROM instances
      WHERE ${buildInstanceWhere(filter, db)}
        AND jsonb_typeof(body->'data'->${fieldId}) IN ('array', 'object')
      LIMIT 1
    `) as unknown[];
    if (rows.length > 0) {
      throw new RequestShapeError(`dataWhere comparison on '${fieldId}' matched an instance holding a non-scalar value`);
    }
  }
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
  assertVersionHasProcessId(filter);
  validateDataComparisons(filter.dataWhere);
  assertDataWhereHasProcessId(filter);
  await assertNoNonScalarComparedField(filter, filter.dataWhere, db);

  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorCreatedAt, cursorInstanceId] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];

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
    WHERE ${buildInstanceWhere(filter, db)}
      AND ${buildDataWhere(filter.dataWhere, db)}
      AND (
        ${cursorCreatedAt ?? null}::timestamptz IS NULL
        OR (created_at, instance_id) < (${cursorCreatedAt ?? null}::timestamptz, ${cursorInstanceId ?? null})
      )
    ORDER BY created_at DESC, instance_id DESC
    LIMIT ${limit + 1}
  ` as unknown) as { instance_id: string; body: unknown; created_at: string; created_at_cursor: string }[];

  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [r.created_at_cursor, r.instance_id]);
  const store = getStore(db);
  const resolved = await Promise.all(
    pageRows.map((r) => toSummaryItem(parseInstance(r.body), r.created_at, store, filter.includeDegraded)),
  );
  const items = resolved.filter((item): item is InstanceSummaryItem => item !== undefined);
  return { items, cursor };
}

/**
 * `queryInstances` never accepts these — each names behaviour only
 * `listInstances` resolves. Checked at runtime, not by `InstanceQueryFilter`
 * alone: this read's consumer builds its filter by spreading a wider object,
 * which a type check alone cannot stop, and `scope` is the HTTP layer's own
 * derivation, declared by no Runtime API Layer filter type at all. See
 * design.md "The data read takes its own filter type and rejects a borrowed
 * key".
 */
const QUERY_FILTER_DENYLIST = ["assignedTo", "assignedToRoles", "scope", "includeDegraded"] as const;

function assertNoDenylistedQueryKeys(filter: object): void {
  const raw = filter as Record<string, unknown>;
  for (const key of QUERY_FILTER_DENYLIST) {
    if (key in raw) throw new RequestShapeError(`queryInstances does not accept '${key}'`);
  }
}

/**
 * Reads instances by their `data` payload — the aggregated data source's
 * option-list resolution, in-process, is this read's first consumer (see
 * proposal.md). Resolves no process or step labels and opens no definition
 * store: the option-list path re-resolves on every form render, submission,
 * timer fire and automatic transition, work each of those would immediately
 * discard. Bounds rather than pages — a caller resolving an option list
 * wants it whole, in one call, so a cursor would either loop internally or
 * hand back a partial list a picker would treat as complete. See design.md
 * "The data read resolves no labels" and "The data read bounds rather than
 * pages".
 */
export async function queryInstances(
  filter: InstanceQueryFilter = {},
  page: { limit?: number } = {},
  db: SQL = sql,
): Promise<InstanceDataPage> {
  assertNoDenylistedQueryKeys(filter);
  assertVersionHasProcessId(filter);
  assertNoEmptyListFilters(filter);
  validateDataComparisons(filter.dataWhere);
  assertDataWhereHasProcessId(filter);
  await assertNoNonScalarComparedField(filter, filter.dataWhere, db);

  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const rows = (await db`
    SELECT body FROM instances
    WHERE ${buildInstanceWhere(filter, db)}
      AND ${buildDataWhere(filter.dataWhere, db)}
    ORDER BY created_at DESC, instance_id DESC
    LIMIT ${limit + 1}
  ` as unknown) as { body: unknown }[];

  const truncated = rows.length > limit;
  const items: InstanceDataItem[] = rows.slice(0, limit).map((r) => {
    const inst = parseInstance(r.body);
    return { instanceId: inst.instanceId, version: inst.version, data: inst.data, redactedAt: inst.redactedAt };
  });
  return { items, truncated };
}

// ============================================================
// Saved reports (instance-data-tables)
// ============================================================

/**
 * A report's query configuration: the three `queryInstances` axes that vary
 * a table's row set over a date range — status, date range and field
 * comparisons. Deliberately narrower than `InstanceQueryFilter`: a report
 * names no version, step or claim, only what changes which instances (and
 * hence which columns) it can show.
 */
export type ReportQuery = {
  status?: InstanceStatus[];
  createdAfter?: string;
  createdBefore?: string;
  dataWhere?: DataComparison[];
};

export type ReportColumn = { type: "field"; fieldId: FieldId } | { type: "merge"; fieldIds: FieldId[] };

export type Report = {
  reportId: string;
  owner: string;
  processId: ProcessId;
  name: string;
  query: ReportQuery;
  columns: ReportColumn[];
  viewers: string[];
  editors: string[];
  createdAt: string;
  updatedAt: string;
};

export type ReportInput = {
  processId: ProcessId;
  name: string;
  query?: ReportQuery;
  columns?: ReportColumn[];
  viewers?: string[];
  editors?: string[];
};

export type ReportPatch = Partial<Pick<ReportInput, "name" | "query" | "columns" | "viewers" | "editors">> & { owner?: string };

/** Thrown by `updateReport` when a patch would leave the owner out of `editors` — see the "owner cannot be removed from editors" requirement. */
export class ReportOwnerInvariantError extends Error {
  constructor(reportId: string) {
    super(`report '${reportId}' must keep its owner in its editors list`);
    this.name = "ReportOwnerInvariantError";
  }
}

type ReportDbRow = {
  instance_report_id: string;
  owner: string;
  process_id: string;
  name: string;
  query: unknown;
  columns: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

function parseJsonColumn<T>(raw: unknown): T {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
}

function toReport(row: ReportDbRow, principals: { list: string; principal: string }[]): Report {
  return {
    reportId: row.instance_report_id,
    owner: row.owner,
    processId: row.process_id as ProcessId,
    name: row.name,
    query: parseJsonColumn<ReportQuery>(row.query),
    columns: parseJsonColumn<ReportColumn[]>(row.columns),
    viewers: principals.filter((p) => p.list === "viewer").map((p) => p.principal),
    editors: principals.filter((p) => p.list === "editor").map((p) => p.principal),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function fetchReportRaw(reportId: string, db: SQL): Promise<Report | undefined> {
  const rows = (await db`SELECT * FROM reports WHERE instance_report_id = ${reportId}`) as ReportDbRow[];
  const row = rows[0];
  if (!row) return undefined;
  const principals = (await db`SELECT list, principal FROM report_principals WHERE instance_report_id = ${reportId}`) as { list: string; principal: string }[];
  return toReport(row, principals);
}

/**
 * A `group_`-prefixed principal (the id shape `src/auth/groups.ts:51` mints)
 * expands to its current member ids; an id or role principal passes through
 * unchanged. `isEligibleCandidate` itself has no notion of a group.
 */
async function expandGroupPrincipals(principals: string[], db: SQL): Promise<string[]> {
  const out: string[] = [];
  for (const p of principals) {
    if (p.startsWith("group_")) out.push(...(await getGroupMembers(p, db)));
    else out.push(p);
  }
  return out;
}

async function hasReportMembership(actor: Actor, principals: string[], db: SQL): Promise<boolean> {
  return isEligibleCandidate(actor, await expandGroupPrincipals(principals, db));
}

/** Replaces the whole `list` slice of a report's principals, matching `setGroupMembers`'s replace-not-merge semantics. */
async function writeReportPrincipals(reportId: string, list: "viewer" | "editor", principals: string[], db: SQL): Promise<void> {
  await db`DELETE FROM report_principals WHERE instance_report_id = ${reportId} AND list = ${list}`;
  for (const principal of new Set(principals)) {
    await db`INSERT INTO report_principals (instance_report_id, list, principal) VALUES (${reportId}, ${list}, ${principal})`;
  }
}

/**
 * The owner is always forced into `editors`, so the "owner cannot be removed
 * from editors" invariant holds by construction from creation on — a later
 * read never needs a separate owner check beside the editors/viewers
 * membership test.
 */
export async function createReport(actor: Actor, input: ReportInput, db: SQL = sql): Promise<Report> {
  const reportId = `rep_${crypto.randomUUID()}`;
  const editors = new Set([actor.id, ...(input.editors ?? [])]);
  await withTransaction(db, async (tx) => {
    await tx`INSERT INTO reports (instance_report_id, owner, process_id, name, query, columns)
      VALUES (${reportId}, ${actor.id}, ${input.processId}, ${input.name}, ${input.query ?? {}}, ${input.columns ?? []})`;
    await writeReportPrincipals(reportId, "editor", [...editors], tx);
    await writeReportPrincipals(reportId, "viewer", input.viewers ?? [], tx);
  });
  return (await fetchReportRaw(reportId, db))!;
}

/**
 * `undefined` for an unknown id (the HTTP layer's 404), `AuthorizationError`
 * for an actor outside `owner`/`editors` (403), `ReportOwnerInvariantError`
 * for a patch that would strand the owner outside `editors` (409).
 */
export async function updateReport(reportId: string, actor: Actor, patch: ReportPatch, db: SQL = sql): Promise<Report | undefined> {
  const current = await fetchReportRaw(reportId, db);
  if (!current) return undefined;
  if (!(await hasReportMembership(actor, current.editors, db))) {
    throw new AuthorizationError(`actor '${actor.id}' is not an owner or editor of report '${reportId}'`);
  }

  const nextOwner = patch.owner ?? current.owner;
  const nextEditors = patch.editors ? [...new Set(patch.editors)] : current.editors;
  if (!nextEditors.includes(nextOwner)) throw new ReportOwnerInvariantError(reportId);

  await withTransaction(db, async (tx) => {
    await tx`UPDATE reports SET
        owner = ${nextOwner},
        name = ${patch.name ?? current.name},
        query = ${patch.query ?? current.query},
        columns = ${patch.columns ?? current.columns},
        updated_at = now()
      WHERE instance_report_id = ${reportId}`;
    if (patch.editors) await writeReportPrincipals(reportId, "editor", nextEditors, tx);
    if (patch.viewers) await writeReportPrincipals(reportId, "viewer", [...new Set(patch.viewers)], tx);
  });
  return fetchReportRaw(reportId, db);
}

export async function deleteReport(reportId: string, actor: Actor, db: SQL = sql): Promise<{ deleted: true } | undefined> {
  const current = await fetchReportRaw(reportId, db);
  if (!current) return undefined;
  if (!(await hasReportMembership(actor, current.editors, db))) {
    throw new AuthorizationError(`actor '${actor.id}' is not an owner or editor of report '${reportId}'`);
  }
  // report_principals rows cascade with the delete (ON DELETE CASCADE) —
  // nothing else ever holds a live reference to a report.
  await db`DELETE FROM reports WHERE instance_report_id = ${reportId}`;
  return { deleted: true };
}

export async function getReport(reportId: string, actor: Actor, db: SQL = sql): Promise<Report | undefined> {
  const report = await fetchReportRaw(reportId, db);
  if (!report) return undefined;
  if (!(await hasReportMembership(actor, [...report.editors, ...report.viewers], db))) {
    throw new AuthorizationError(`actor '${actor.id}' may not read report '${reportId}'`);
  }
  return report;
}

/**
 * Every report naming the caller's own id, a role they hold, or a group they
 * belong to, in either principal list. `getGroupsForMember` runs the reverse
 * direction of the per-report membership check above: it starts from the
 * actor and asks which groups they belong to, once, rather than resolving
 * each candidate report's own group principals forward.
 */
export async function listMyReports(actor: Actor, db: SQL = sql): Promise<Report[]> {
  const groupIds = await getGroupsForMember(actor.id, db);
  const matchSet = [actor.id, ...actor.roles, ...groupIds];
  const rows = (await db`
    SELECT DISTINCT r.* FROM reports r
    JOIN report_principals rp ON rp.instance_report_id = r.instance_report_id
    WHERE rp.principal = ANY(${db.array(matchSet, "TEXT")})
    ORDER BY r.updated_at DESC
  `) as ReportDbRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.instance_report_id);
  const principalRows = (await db`
    SELECT instance_report_id, list, principal FROM report_principals
    WHERE instance_report_id = ANY(${db.array(ids, "TEXT")})
  `) as { instance_report_id: string; list: string; principal: string }[];
  const byReport = new Map<string, { list: string; principal: string }[]>();
  for (const p of principalRows) {
    const list = byReport.get(p.instance_report_id);
    if (list) list.push(p);
    else byReport.set(p.instance_report_id, [p]);
  }
  return rows.map((r) => toReport(r, byReport.get(r.instance_report_id) ?? []));
}

// ------------------------------------------------------------
// Report execution
// ------------------------------------------------------------

export type ColumnChoice = { fieldId: FieldId; versions: number[] };

/**
 * Every field id declared by a version of `processId` that has at least one
 * in-range instance, keyed by that version — the per-version half of the
 * column-choice union below, and the same per-instance lookup
 * `executeReport`'s cell-state computation needs to tell "no value" from
 * "not in this version" apart. Built from `leafFields`: a `type: "group"`
 * container carries no value of its own, so offering one as a column choice
 * would only ever render empty.
 */
async function resolveVersionCoverage(processId: ProcessId, query: ReportQuery, db: SQL): Promise<Map<number, Set<FieldId>>> {
  const filter: InstanceWhereFilter = {
    processId,
    status: query.status,
    createdAfter: query.createdAfter,
    createdBefore: query.createdBefore,
  };
  const rows = (await db`
    SELECT DISTINCT (body->>'version')::int AS version FROM instances
    WHERE ${buildInstanceWhere(filter, db)} AND ${buildDataWhere(query.dataWhere, db)}
  `) as { version: number }[];

  const store = createDefinitionStore(db);
  const coverage = new Map<number, Set<FieldId>>();
  for (const { version } of rows) {
    const body = await store.resolveBody(processId, version);
    // A version that no longer resolves contributes no fields — the same
    // "resolves to nothing" treatment a dangling reference gets elsewhere.
    if (!body) continue;
    coverage.set(version, new Set(leafFields(body.fields).map((f) => f.id)));
  }
  return coverage;
}

/** The union of every in-range version's field catalog, each field tagged with which versions declare it — the choices a report builder offers. */
export async function resolveReportColumnChoices(processId: ProcessId, query: ReportQuery, db: SQL = sql): Promise<ColumnChoice[]> {
  const coverage = await resolveVersionCoverage(processId, query, db);
  const byField = new Map<FieldId, Set<number>>();
  for (const [version, fieldIds] of coverage) {
    for (const fieldId of fieldIds) {
      const versions = byField.get(fieldId);
      if (versions) versions.add(version);
      else byField.set(fieldId, new Set([version]));
    }
  }
  return [...byField.entries()].map(([fieldId, versions]) => ({ fieldId, versions: [...versions].sort((a, b) => a - b) }));
}

/** Same check every draft/saved-report read applies: an actor with no `read` grant on the target process sees no real data, from a preview or a saved execution alike. */
export async function previewReportColumnChoices(processId: ProcessId, query: ReportQuery, actor: Actor, db: SQL = sql): Promise<ColumnChoice[]> {
  if (!(await can(actor, "read", processId, db))) return [];
  return resolveReportColumnChoices(processId, query, db);
}

export type ReportCell =
  | { kind: "value"; value: Literal }
  | { kind: "no-value" }
  | { kind: "not-in-version" }
  | { kind: "redacted" };

export type MergeReportCell = { kind: "value"; value: string; collision: boolean } | { kind: "no-value" } | { kind: "redacted" };

export type ReportResultColumn = { type: "field"; fieldId: FieldId } | { type: "merge"; fieldIds: FieldId[]; collisions: number };

export type ReportExecutionRow = { instanceId: InstanceId; cells: (ReportCell | MergeReportCell)[] };

export type ReportExecutionResult = { columns: ReportResultColumn[]; rows: ReportExecutionRow[]; truncated: boolean };

function emptyResultColumn(c: ReportColumn): ReportResultColumn {
  return c.type === "field" ? { type: "field", fieldId: c.fieldId } : { type: "merge", fieldIds: c.fieldIds, collisions: 0 };
}

/**
 * Redaction wins first and applies to the WHOLE instance: `redactInstance`
 * wipes `data` wholesale, so this does not gate on the field's own
 * `redactable` flag. Otherwise: not declared by the instance's own pinned
 * version's catalog, or declared but never written.
 */
function fieldCell(item: InstanceDataItem, fieldId: FieldId, declared: Set<FieldId> | undefined): ReportCell {
  if (item.redactedAt) return { kind: "redacted" };
  if (!declared?.has(fieldId)) return { kind: "not-in-version" };
  const value = item.data[fieldId];
  if (value === undefined) return { kind: "no-value" };
  return { kind: "value", value };
}

/**
 * First non-empty source wins; two or more non-empty sources concatenate and
 * mark a collision. A source the instance's own version does not declare, or
 * never wrote, is treated as empty here — a merge column reports one
 * combined value, not a per-source empty reason. Zero non-empty sources is
 * `no-value`, not a `value` of `""`, so an empty merge cell reads the same
 * distinct way a direct field's empty cell does.
 */
function mergeCell(item: InstanceDataItem, fieldIds: FieldId[], declared: Set<FieldId> | undefined): MergeReportCell {
  if (item.redactedAt) return { kind: "redacted" };
  const values = fieldIds
    .filter((id) => declared?.has(id))
    .map((id) => item.data[id])
    .filter((v): v is Exclude<Literal, null | undefined> => v !== undefined && v !== null && v !== "");
  if (values.length === 0) return { kind: "no-value" };
  return { kind: "value", value: values.map((v) => String(v)).join(", "), collision: values.length > 1 };
}

async function runReportQuery(spec: { processId: ProcessId; query: ReportQuery; columns: ReportColumn[] }, db: SQL): Promise<ReportExecutionResult> {
  const filter: InstanceQueryFilter = { processId: spec.processId, ...spec.query };
  const [{ items, truncated }, coverage] = await Promise.all([
    queryInstances(filter, {}, db),
    resolveVersionCoverage(spec.processId, spec.query, db),
  ]);

  const collisionCounts = spec.columns.map(() => 0);
  const rows: ReportExecutionRow[] = items.map((item) => {
    const declared = coverage.get(item.version);
    const cells = spec.columns.map((col, i) => {
      if (col.type === "field") return fieldCell(item, col.fieldId, declared);
      const cell = mergeCell(item, col.fieldIds, declared);
      if (cell.kind === "value" && cell.collision) collisionCounts[i]!++;
      return cell;
    });
    return { instanceId: item.instanceId, cells };
  });

  const columns: ReportResultColumn[] = spec.columns.map((c, i) =>
    c.type === "field" ? { type: "field", fieldId: c.fieldId } : { type: "merge", fieldIds: c.fieldIds, collisions: collisionCounts[i]! },
  );
  return { columns, rows, truncated };
}

/**
 * Two independent gates, in order: report membership (owner/editor/viewer,
 * refused outright for anyone else), then the target process's own `read`
 * permission (an empty table, not a refusal, when membership passes and this
 * fails — see the "sharing narrows access, never widens it" requirement).
 */
export async function executeReport(reportId: string, actor: Actor, db: SQL = sql): Promise<ReportExecutionResult | undefined> {
  const report = await fetchReportRaw(reportId, db);
  if (!report) return undefined;
  if (!(await hasReportMembership(actor, [...report.editors, ...report.viewers], db))) {
    throw new AuthorizationError(`actor '${actor.id}' may not execute report '${reportId}'`);
  }
  if (!(await can(actor, "read", report.processId, db))) {
    return { columns: report.columns.map(emptyResultColumn), rows: [], truncated: false };
  }
  return runReportQuery(report, db);
}

/**
 * The same execution as `executeReport`, for a configuration not yet saved
 * as a report — the builder's own live preview. Carries no membership check:
 * nothing is shared yet, so only the process `read` gate applies.
 */
export async function previewReportDraft(
  draft: { processId: ProcessId; query: ReportQuery; columns: ReportColumn[] },
  actor: Actor,
  db: SQL = sql,
): Promise<ReportExecutionResult> {
  if (!(await can(actor, "read", draft.processId, db))) {
    return { columns: draft.columns.map(emptyResultColumn), rows: [], truncated: false };
  }
  return runReportQuery(draft, db);
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

  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [String(r.transition_seq), r.at, r.id]);
  const items: InstanceRecordElement[] = pageRows.map((r) => {
    const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return r.kind === "transition"
      ? { kind: "transition" as const, entry: historyEntrySchema.parse(payload) }
      : { kind: "event" as const, event: instanceEventSchema.parse(payload) };
  });
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

  const rows = await pagedRead<{ id: string; instance_id: string; actor_id: string; text: string; created_at: Date; created_at_cursor: string }>(
    db,
    "instance_comments",
    "id, instance_id, actor_id, text, created_at",
    instanceId,
    limit,
    page.cursor,
  );
  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [r.created_at_cursor, r.id]);
  const items: InstanceComment[] = pageRows.map((r) => ({
    id: r.id,
    instanceId: r.instance_id as InstanceId,
    actorId: r.actor_id,
    text: r.text,
    createdAt: r.created_at.toISOString(),
  }));
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

  // Never selects `data`: this list is metadata only (see InstanceAttachment
  // above) so a page response can never carry file bytes by accident.
  const rows = await pagedRead<{
    id: string;
    instance_id: string;
    actor_id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    created_at: Date;
    created_at_cursor: string;
  }>(db, "instance_attachments", "id, instance_id, actor_id, filename, content_type, size_bytes, created_at", instanceId, limit, page.cursor);
  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [r.created_at_cursor, r.id]);
  const items: InstanceAttachment[] = pageRows.map((r) => ({
    id: r.id,
    instanceId: r.instance_id as InstanceId,
    actorId: r.actor_id,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at.toISOString(),
  }));
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
