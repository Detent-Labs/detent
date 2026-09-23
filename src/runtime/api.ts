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
import { sql, withTransaction, newInstanceEventId, appendInstanceEvent, appendInstancePrincipals, PinMismatch } from "../engine/store.js";
import { createDefinitionStore } from "../engine/definitions.js";
import {
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
import type { Actor } from "../cel/eval.js";
import { requireRole, can, ADMIN_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE, AuthorizationError } from "../auth/authorize.js";
import { getGroupMembers, actorPrincipals } from "../auth/groups.js";
import { NotFoundError, InstanceNotRunningError, RequestShapeError } from "../errors.js";
import type { InstanceDraft } from "../engine/instance-drafts.js";
import { decodeCursor } from "../pagination.js";
import { historyEntry as historyEntrySchema, instanceEvent as instanceEventSchema, leafFields } from "../schema/definition.js";
import type {
  ProcessId,
  InstanceId,
  FieldId,
  Literal,
  Instance,
  InstanceStatus,
  AssignmentState,
  StepId,
  LocalizedText,
  LocaleCode,
  HistoryEntry,
  InstanceEvent,
} from "../schema/definition.js";
import {
  MAX_LIST_LIMIT,
  MAX_RECORD_LIMIT,
  DEFAULT_LIST_LIMIT,
  DEFAULT_RECORD_LIMIT,
  getStore,
  parseInstance,
  loadInstanceForRead,
  loadInstanceForActor,
  findStep,
  resolveCollaboration,
  CollaborationDisabledError,
  keysetPage,
  pagedRead,
  type Page,
  type DefinitionStore,
} from "./internal.js";

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
export {
  MAX_LIST_LIMIT,
  MAX_RECORD_LIMIT,
  resolveCollaboration,
  CollaborationDisabledError,
} from "./internal.js";
export type { Page } from "./internal.js";
export {
  isResolvedViewField,
  SubmissionValidationError,
} from "./fields.js";
export type {
  ResolvedViewField,
  ResolvedViewNote,
  ResolvedViewEntry,
  ResolvedViewTab,
  AvailablePath,
  SubmissionIssue,
  DroppedAttribute,
} from "./fields.js";
export {
  createProcessInstance,
  getInstanceView,
  submitAndTransition,
  saveInstanceDraft,
  isCancellableAtStep,
  cancelInstance,
} from "./instances.js";
export type { InstanceView } from "./instances.js";
export { claimStep, releaseClaim, delegateClaim } from "./claims.js";

// ============================================================
// Public types
// ============================================================

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
  kind: Instance["kind"];
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
  kind: Instance["kind"];
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
 * `version` needs `processId` beside it (`instances_selection_col_idx` reaches
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
  // A genuine client-settable filter, unlike includeDegraded/includeTestInstances
  // below: an exact match against the instance's own kind, narrowing to
  // published-only or test-only rather than merely toggling test-instance
  // inclusion. Composes safely with includeTestInstances's default exclusion —
  // a non-admin scope's includeTestInstances stays false, so kind: "test"
  // yields zero rows for it rather than leaking test instances.
  kind?: Instance["kind"];
  // Not a query filter: set by the caller's own authorization context (see
  // http-wrapper's `scope=all` / `ADMIN_ROLE` check), never from raw client
  // input. True degrades an unresolvable instance's item instead of omitting
  // it — see toSummary/listInstances and design.md "Gate visibility with an
  // includeDegraded filter field".
  includeDegraded?: boolean;
  // Not a query filter either, same scoping rule as includeDegraded: set by
  // the caller's own administrative-scope check (scope=all), never from raw
  // client input. draft-test-instances: absent (or false) excludes a
  // kind: "test" instance from the result, the default every
  // participant-facing scope gets.
  includeTestInstances?: boolean;
  // instance-visibility-set: the caller's own principals, resolved from the
  // credential (actor id, roles, group memberships) by the HTTP layer, never
  // from raw client input. Present only for scope=visible. Its presence is
  // what switches listInstances onto the visibility read; absent leaves every
  // existing scope byte-for-byte unchanged.
  visibleTo?: { actorId: string; principals: string[] };
};

/**
 * `queryInstances`'s own filter type — the ten members `instance-data-query`'s
 * spec enumerates, plus `visibleTo`. No `assignedTo`, `assignedToRoles` or
 * `includeDegraded`: those resolve the list read's inbox predicate and
 * degraded-summary behaviour, neither of which this read has. See design.md
 * "The data read takes its own filter type and rejects a borrowed key".
 *
 * `visibleTo` is opt-in and states a resolved principal set, the way
 * `claimedBy` states an actor id. It is not `scope`, which the HTTP layer
 * derives from a credential and this read still refuses. `runReportQuery`
 * sets it (report-row-visibility); the `instance.query` data source runs with
 * no actor and passes none.
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
  visibleTo?: { actorId: string; principals: string[] };
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
    kind: inst.kind,
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
    kind: inst.kind,
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
 * query builder". Every filter with a generated column behind it compares
 * that column, never the `body->>` expression it was generated from: the
 * planner substitutes a plain index only into a query naming the column
 * (see rebuild-instance-expression-indexes). `excludeInstanceId` compares
 * `instance_id`, the table's own key.
 */
export function buildInstanceWhere(filter: InstanceWhereFilter, db: SQL) {
  const statusArr = filter.status && filter.status.length > 0 ? db.array(filter.status, "TEXT") : null;
  const assignedToRolesArr = filter.assignedToRoles && filter.assignedToRoles.length > 0 ? db.array(filter.assignedToRoles, "TEXT") : null;
  const currentStepIdArr = Array.isArray(filter.currentStepId)
    ? db.array(filter.currentStepId, "TEXT")
    : filter.currentStepId
      ? db.array([filter.currentStepId], "TEXT")
      : null;
  const instanceIdsArr = filter.instanceIds && filter.instanceIds.length > 0 ? db.array(filter.instanceIds, "TEXT") : null;
  return db`
    (${filter.processId ?? null}::text IS NULL OR process_id = ${filter.processId ?? null})
    AND (${filter.version ?? null}::int IS NULL OR version = ${filter.version ?? null})
    AND (${statusArr}::text[] IS NULL OR status = ANY(${statusArr}))
    AND (${currentStepIdArr}::text[] IS NULL OR current_step_id = ANY(${currentStepIdArr}))
    AND (${instanceIdsArr}::text[] IS NULL OR instance_id = ANY(${instanceIdsArr}))
    AND (${filter.startedBy ?? null}::text IS NULL OR started_by = ${filter.startedBy ?? null})
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
    AND (kind <> 'test' OR ${filter.includeTestInstances ?? false})
    AND (${filter.kind ?? null}::text IS NULL OR kind = ${filter.kind ?? null})
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

/**
 * The range an `integer` (int4) column holds. Exported: `parseVersion`
 * (src/http/routes.ts) applies the same bound to every version a route reads,
 * since every `version integer` column shares the hazard below.
 */
export const VERSION_MIN = -2147483648;
export const VERSION_MAX = 2147483647;

/**
 * A version number anchors to one process; `instances_selection_col_idx`
 * reaches its `version` column only with `process_id` bound beside it.
 *
 * The range check is not cosmetic. `buildInstanceWhere` emits a leading
 * `::int` cast on the filter's own null test, and that cast is where a value
 * past int4 raises "integer out of range". Measured against Postgres 16.15
 * and 18.6: 2147483648 and -2147483649 raise there, both edges bind, and the
 * comparison half alone would not raise at all, since it promotes to numeric
 * and matches nothing. An unmapped PostgresError maps to a 500 with no
 * message (src/http/errors.ts). So without this bound `GET /instances`
 * answers 500 where the text comparison it replaced answered an empty 200.
 *
 * The integer check is a different rule with a different reason. A fractional
 * value never raises: `1.5::int` rounds to 2, and `version = 1.5` promotes to
 * numeric and matches nothing. Rejecting it turns a caller's mistake into a
 * 400 instead of a silent empty page. Neither rule states what the datastore
 * tolerates; both make the read answer for its own input.
 *
 * No sign check: `createDraftSnapshot` mints a negative sentinel version and a
 * test instance pins it, so the floor is int4's, not zero.
 */
function assertVersionFilter(filter: { processId?: ProcessId; version?: number }): void {
  if (filter.version === undefined) return;
  if (!filter.processId) throw new RequestShapeError("a version filter needs a processId beside it");
  if (!Number.isInteger(filter.version) || filter.version < VERSION_MIN || filter.version > VERSION_MAX) {
    throw new RequestShapeError(`a version filter must be an integer between ${VERSION_MIN} and ${VERSION_MAX}`);
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
/**
 * The `scope=visible` row set (instance-visibility-set): one ordered, bounded
 * branch per principal the reader holds, plus one for the instances the reader
 * is currently assigned, combined by Postgres into a `Merge Append`.
 *
 * Two properties are load-bearing and easy to lose in a rewrite.
 *
 * Every branch applies the request's own filters BEFORE its own `LIMIT`. A
 * branch bounded at `n` whose rows are filtered afterwards returns fewer than
 * `n`, and `keysetPage` reads `hasMore` off the row count, so a short page
 * reports no cursor and the walk stops while visible instances remain.
 * Measured: a 21-row branch filtered afterwards by the test-instance exclusion
 * alone returns 19. See design.md, "Every branch carries the filters".
 *
 * The instance filters sit in a correlated `EXISTS` rather than a join, so
 * `instances` is the only relation in scope where `buildInstanceWhere` and
 * `buildDataWhere` emit their unqualified column names. A join would make
 * `instance_id` and `created_at` ambiguous against the principal row.
 *
 * The assignment branch is why a revocation cannot strand an actor holding
 * live work: it carries no denial test, so an assigned actor sees the instance
 * even while revoked from it (design.md, "A live assignment overrides a
 * revocation at read time").
 *
 * Exported for the plan guards in `test/instance-visibility.test.ts`, which
 * run `EXPLAIN (ANALYZE)` over this fragment. No other caller.
 */
export function buildVisibleRowSet(
  filter: InstanceWhereFilter & { dataWhere?: DataComparison[] },
  visibleTo: { actorId: string; principals: string[] },
  bound: number,
  cursorCreatedAt: string | undefined,
  cursorInstanceId: string | undefined,
  db: SQL,
) {
  const instanceFilters = db`${buildInstanceWhere(filter, db)} AND ${buildDataWhere(filter.dataWhere, db)}`;
  const rolesArr = visibleTo.principals.length > 0 ? db.array(visibleTo.principals, "TEXT") : null;

  const branch = (principal: string) => db`
    (SELECT vp.instance_id, vp.created_at FROM instance_principals vp
      WHERE vp.principal = ${principal}
        AND NOT EXISTS (SELECT 1 FROM instance_principals_denied vd
                        WHERE vd.instance_id = vp.instance_id AND vd.actor_id = ${visibleTo.actorId})
        AND EXISTS (SELECT 1 FROM instances WHERE instances.instance_id = vp.instance_id AND ${instanceFilters})
        AND (${cursorCreatedAt ?? null}::timestamptz IS NULL
             OR (vp.created_at, vp.instance_id) < (${cursorCreatedAt ?? null}::timestamptz, ${cursorInstanceId ?? null}))
      ORDER BY vp.created_at DESC, vp.instance_id DESC
      LIMIT ${bound})`;

  const assigned = db`
    (SELECT instance_id, created_at FROM instances
      WHERE ${instanceFilters}
        AND (
          body->'assignment'->>'claimedBy' = ${visibleTo.actorId}
          OR (body->'assignment'->>'claimedBy' IS NULL AND (
            body->'assignment'->'candidates' @> to_jsonb(${visibleTo.actorId}::text)
            OR (${rolesArr}::text[] IS NOT NULL AND body->'assignment'->'candidates' ?| ${rolesArr})
          ))
        )
        AND (${cursorCreatedAt ?? null}::timestamptz IS NULL
             OR (created_at, instance_id) < (${cursorCreatedAt ?? null}::timestamptz, ${cursorInstanceId ?? null}))
      ORDER BY created_at DESC, instance_id DESC
      LIMIT ${bound})`;

  // Left-nested reduce, the shape buildDataWhere already uses to fold a
  // variable fragment list: an empty principal list still leaves the
  // assignment branch, so the union is never empty SQL.
  const union = visibleTo.principals
    .map(branch)
    .reduce((acc, frag) => db`${acc} UNION ALL ${frag}`, assigned);

  return db`
    SELECT DISTINCT ON (created_at, instance_id) instance_id, created_at FROM (${union}) vu
    ORDER BY created_at DESC, instance_id DESC
    LIMIT ${bound}`;
}

export async function listInstances(
  filter: InstanceListFilter = {},
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceSummaryItem>> {
  assertVersionFilter(filter);
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
  const rows = (await (filter.visibleTo
    ? db`
    SELECT i.instance_id, i.body, i.created_at, i.created_at::text AS created_at_cursor
    FROM instances i
    JOIN (${buildVisibleRowSet(filter, filter.visibleTo, limit + 1, cursorCreatedAt, cursorInstanceId, db)}) v
      ON v.instance_id = i.instance_id
    ORDER BY i.created_at DESC, i.instance_id DESC`
    : db`
    SELECT instance_id, body, created_at, created_at::text AS created_at_cursor FROM instances
    WHERE ${buildInstanceWhere(filter, db)}
      AND ${buildDataWhere(filter.dataWhere, db)}
      AND (
        ${cursorCreatedAt ?? null}::timestamptz IS NULL
        OR (created_at, instance_id) < (${cursorCreatedAt ?? null}::timestamptz, ${cursorInstanceId ?? null})
      )
    ORDER BY created_at DESC, instance_id DESC
    LIMIT ${limit + 1}
  `) as unknown) as { instance_id: string; body: unknown; created_at: string; created_at_cursor: string }[];

  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [r.created_at_cursor, r.instance_id]);
  const store = getStore(db);
  const resolved = await Promise.all(
    pageRows.map((r) => toSummaryItem(parseInstance(r.body), r.created_at, store, filter.includeDegraded)),
  );
  const items = resolved.filter((item): item is InstanceSummaryItem => item !== undefined);
  return { items, cursor };
}

/**
 * The four keys `instance-data-query` names as caller errors. Each resolves
 * the list read's inbox predicate or its degraded-summary behaviour, neither
 * of which this read has. `visibleTo` sat here until
 * `report-row-visibility`: it is not a derivation from a credential but a
 * resolved set the caller states, the way it states `claimedBy`.
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
  assertVersionFilter(filter);
  assertNoEmptyListFilters(filter);
  validateDataComparisons(filter.dataWhere);
  assertDataWhereHasProcessId(filter);
  await assertNoNonScalarComparedField(filter, filter.dataWhere, db);

  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  // report-row-visibility: a caller stating `visibleTo` reads the same joined
  // row set `listInstances` reads under scope=visible, so the report, the
  // visible list and the direct read cannot disagree. The bound sits inside
  // every branch and again on the merged set, so `truncated` below reports
  // the narrowed result rather than the matched one.
  const rows = (await (filter.visibleTo
    ? db`
    SELECT i.body FROM instances i
    JOIN (${buildVisibleRowSet(filter, filter.visibleTo, limit + 1, undefined, undefined, db)}) v
      ON v.instance_id = i.instance_id
    ORDER BY i.created_at DESC, i.instance_id DESC`
    : db`
    SELECT body FROM instances
    WHERE ${buildInstanceWhere(filter, db)}
      AND ${buildDataWhere(filter.dataWhere, db)}
    ORDER BY created_at DESC, instance_id DESC
    LIMIT ${limit + 1}
  `) as unknown) as { body: unknown }[];

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
 * belong to, in either principal list. `actorPrincipals` runs the reverse
 * direction of the per-report membership check above: it starts from the
 * actor and asks which groups they belong to, once, rather than resolving
 * each candidate report's own group principals forward. The same resolver
 * serves the `scope=visible` list and the direct instance read.
 */
export async function listMyReports(actor: Actor, db: SQL = sql): Promise<Report[]> {
  const matchSet = await actorPrincipals(actor, db);
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
    SELECT DISTINCT version FROM instances
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

/**
 * report-row-visibility: a non-administrative caller reads only the rows they
 * may see. `actorPrincipals` is the resolver `loadInstanceForActor` and the
 * `scope=visible` list already use, so all three readers match on one set.
 *
 * `ADMIN_ROLE` skips the narrowing and the join with it. That role reads any
 * instance directly and lists every one under `scope=all`, so narrowing its
 * report would contradict both. `can(actor, "read", …)` also admits a
 * per-process grant holder, and that actor is the one this narrows.
 */
async function runReportQuery(
  spec: { processId: ProcessId; query: ReportQuery; columns: ReportColumn[] },
  actor: Actor,
  db: SQL,
): Promise<ReportExecutionResult> {
  const visibleTo = actor.roles.includes(ADMIN_ROLE)
    ? undefined
    : { actorId: actor.id, principals: await actorPrincipals(actor, db) };
  const filter: InstanceQueryFilter = { processId: spec.processId, ...spec.query, ...(visibleTo ? { visibleTo } : {}) };
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
 * Three gates, in order. Report membership comes first (owner/editor/viewer,
 * refused outright for anyone else). Then the target process's own `read`
 * permission: an empty table, not a refusal, when membership passes and this
 * fails — see the "sharing narrows access, never widens it" requirement.
 * Then, inside `runReportQuery`, the per-row visibility rule
 * (report-row-visibility). An `ADMIN_ROLE` caller passes the third one
 * without a query, since that role already reads every instance.
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
  return runReportQuery(report, actor, db);
}

/**
 * The same execution as `executeReport`, for a configuration not yet saved
 * as a report — the builder's own live preview. Carries no membership check:
 * nothing is shared yet, so only the process `read` gate applies. The per-row
 * rule still applies, so an author never previews a row the saved report
 * would withhold from them.
 */
export async function previewReportDraft(
  draft: { processId: ProcessId; query: ReportQuery; columns: ReportColumn[] },
  actor: Actor,
  db: SQL = sql,
): Promise<ReportExecutionResult> {
  if (!(await can(actor, "read", draft.processId, db))) {
    return { columns: draft.columns.map(emptyResultColumn), rows: [], truncated: false };
  }
  return runReportQuery(draft, actor, db);
}

// ------------------------------------------------------------
// CSV export
// ------------------------------------------------------------

const CSV_NO_VALUE = "(no value)";
const CSV_NOT_IN_VERSION = "(not in this version)";
const CSV_REDACTED = "(redacted)";

/** RFC 4180 quoting: only a comma, a quote or a newline forces it; an embedded quote doubles. */
function csvField(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A field column's own `fieldId`; a merge column's joined source `fieldId`s, since the export has no locale to draw a translated label from. */
function csvColumnHeader(c: ReportResultColumn): string {
  return c.type === "field" ? c.fieldId : `merge(${c.fieldIds.join(",")})`;
}

/**
 * Plain text for one cell, keeping the three empty-cell kinds distinct —
 * the same rule `fieldCellDisplay`/`mergeCellDisplay` (`packages/web`)
 * render visually, restated here since the engine must not depend on
 * `packages/web`. A stored `null` value stays an empty string, matching
 * `fieldCellDisplay`'s own choice: that is a real value the author chose to
 * leave empty, not one of the three states this rule distinguishes.
 */
function csvCellText(cell: ReportCell | MergeReportCell): string {
  switch (cell.kind) {
    case "value":
      return cell.value === null ? "" : String(cell.value);
    case "no-value":
      return CSV_NO_VALUE;
    case "not-in-version":
      return CSV_NOT_IN_VERSION;
    case "redacted":
      return CSV_REDACTED;
  }
}

/**
 * The CSV twin of `ReportTable.tsx`: one header row naming each column, one
 * row per instance. Pure and I/O-free, so a `bun:test` unit test covers the
 * three-way marker text with no database — see `csv-download-report-table`'s
 * design.md.
 */
export function reportResultToCsv(result: ReportExecutionResult): string {
  const header = result.columns.map(csvColumnHeader).map(csvField).join(",");
  const rows = result.rows.map((row) => row.cells.map((cell) => csvField(csvCellText(cell))).join(","));
  return [header, ...rows].map((line) => `${line}\r\n`).join("");
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
// ============================================================
// Per-instance visibility administration (instance-visibility-set)
// ============================================================

/** The three visibility operations, distinguished by what each writes. */
export type VisibilityOp = "revoked" | "restored" | "granted";

/**
 * Shared body of `revokeVisibility` / `restoreVisibility` / `grantVisibility`:
 * gate, mutate, record, in one transaction.
 *
 * The gate is the process-scoped `"visibility"` permission against the
 * instance's own process, not a bare `ADMIN_ROLE` check. It answers the same
 * today — `PERMISSION_ROLE` maps it to `ADMIN_ROLE` — and it lets an
 * installation admit a per-process administrator later by writing one grant,
 * with no code change and no scope inside a role string.
 *
 * Loading the instance first is deliberate: the permission names a process,
 * and only the instance knows which one. A caller with no standing therefore
 * learns nothing an unauthorized read would not already tell them, since the
 * load itself is unauthenticated and the refusal follows it.
 */
async function changeVisibility(
  instanceId: InstanceId,
  targetActorId: string,
  actor: Actor,
  op: VisibilityOp,
  db: SQL,
): Promise<void> {
  const { instance } = await loadInstanceForRead(instanceId, db);
  if (!(await can(actor, "visibility", instance.processId, db))) {
    throw new AuthorizationError(`actor '${actor.id}' may not change visibility of instance '${instanceId}'`);
  }
  await withTransaction(db, async (tx) => {
    if (op === "revoked") {
      await tx`INSERT INTO instance_principals_denied (instance_id, actor_id)
        VALUES (${instanceId}, ${targetActorId}) ON CONFLICT DO NOTHING`;
    } else if (op === "restored") {
      await tx`DELETE FROM instance_principals_denied
        WHERE instance_id = ${instanceId} AND actor_id = ${targetActorId}`;
    } else {
      // A grant is an ordinary principal append, so a granted actor is
      // indistinguishable from a participant afterwards. It also lifts any
      // standing revocation: granting someone you are still denying would
      // leave the grant inert and nothing on screen would say why.
      await appendInstancePrincipals(tx, instanceId, [targetActorId]);
      await tx`DELETE FROM instance_principals_denied
        WHERE instance_id = ${instanceId} AND actor_id = ${targetActorId}`;
    }
    await appendInstanceEvent(tx, {
      id: newInstanceEventId(),
      instanceId: instance.instanceId,
      transitionSeq: instance.transitionSeq,
      version: instance.version,
      kind: "visibility.changed",
      payload: { op, actorId: targetActorId, byActorId: actor.id },
      at: new Date().toISOString(),
    } as InstanceEvent);
  });
}

/** Remove one actor's sight of one instance. Names the person, never the principal they matched by. */
export async function revokeVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "revoked", db);
}

/** Undo a revocation, returning the actor to the visibility they had before. */
export async function restoreVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "restored", db);
}

/** Give one actor sight of an instance they never took part in. */
export async function grantVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "granted", db);
}

export async function postComment(instanceId: InstanceId, actor: Actor, text: string, db: SQL = sql): Promise<InstanceComment> {
  const { instance, body } = await loadInstanceForActor(instanceId, actor, db);
  const step = findStep(body, instance.currentStepId as string);
  if (!resolveCollaboration(body, step, "comments")) {
    throw new CollaborationDisabledError(instance.instanceId, "comments");
  }
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
  const { instance, body } = await loadInstanceForActor(instanceId, actor, db);
  const step = findStep(body, instance.currentStepId as string);
  if (!resolveCollaboration(body, step, "attachments")) {
    throw new CollaborationDisabledError(instance.instanceId, "attachments");
  }
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
