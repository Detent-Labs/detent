/**
 * Instance summaries, listing filters and predicates, and the instance-data
 * query (`queryInstances`) that reports and the `instance.query` data source
 * both read.
 */

import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import { NotFoundError, RequestShapeError } from "../errors.js";
import { decodeCursor } from "../pagination.js";
import type { ProcessId, InstanceId, FieldId, Literal, Instance, InstanceStatus, LocaleCode, LocalizedText, AssignmentState, StepId } from "../schema/definition.js";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, getStore, parseInstance, keysetPage, type Page, type DefinitionStore } from "./internal.js";

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
export type InstanceWhereFilter = Omit<InstanceListFilter, "includeDegraded" | "dataWhere" | "currentStepId"> & {
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
