/**
 * Saved reports for the Runtime API Layer: CRUD, column-choice resolution,
 * execution, and CSV export. `resolveVersionCoverage` and `runReportQuery`
 * read `./queries.js`'s `buildInstanceWhere`, `buildDataWhere` and
 * `queryInstances`.
 */

import type { SQL } from "bun";
import { sql, withTransaction } from "../engine/store.js";
import { createDefinitionStore } from "../engine/definitions.js";
import { isEligibleCandidate } from "../engine/transition.js";
import type { Actor } from "../cel/eval.js";
import { ADMIN_ROLE, AuthorizationError, can } from "../auth/authorize.js";
import { actorPrincipals, getGroupMembers } from "../auth/groups.js";
import { leafFields } from "../schema/definition.js";
import type { FieldId, InstanceId, InstanceStatus, Literal, ProcessId } from "../schema/definition.js";
import { buildDataWhere, buildInstanceWhere, queryInstances } from "./queries.js";
import type { DataComparison, InstanceDataItem, InstanceQueryFilter, InstanceWhereFilter } from "./queries.js";

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
