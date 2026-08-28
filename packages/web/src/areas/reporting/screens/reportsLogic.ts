/**
 * Pure view-model helpers for the report builder, mirroring
 * reportingLogic.ts's convention: everything a test can assert lives here,
 * components stay thin.
 */
import type { ColumnChoice, DataComparison, MergeReportCell, Report, ReportCell, ReportColumn } from "../api/types.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

export type ReportDraft = {
  processId: string;
  name: string;
  status: ("running" | "completed" | "cancelled" | "faulted")[];
  createdAfter: string;
  createdBefore: string;
  dataWhere: DataComparison[];
  columns: ReportColumn[];
  viewers: string[];
  editors: string[];
};

export function emptyDraft(processId: string): ReportDraft {
  return { processId, name: "", status: [], createdAfter: "", createdBefore: "", dataWhere: [], columns: [], viewers: [], editors: [] };
}

export function draftFromReport(report: Report): ReportDraft {
  return {
    processId: report.processId,
    name: report.name,
    status: report.query.status ?? [],
    createdAfter: report.query.createdAfter ?? "",
    createdBefore: report.query.createdBefore ?? "",
    dataWhere: report.query.dataWhere ?? [],
    columns: report.columns,
    viewers: report.viewers,
    editors: report.editors,
  };
}

/** The wire shape `createReport`/`updateReport`/`previewReport` accept — `undefined` for every axis left unset rather than an empty value the server would treat as a real filter. */
export function draftToInput(draft: ReportDraft) {
  return {
    processId: draft.processId,
    name: draft.name.trim(),
    query: {
      status: draft.status.length > 0 ? draft.status : undefined,
      createdAfter: draft.createdAfter || undefined,
      createdBefore: draft.createdBefore || undefined,
      dataWhere: draft.dataWhere.length > 0 ? draft.dataWhere : undefined,
    },
    columns: draft.columns,
    viewers: draft.viewers,
    editors: draft.editors,
  };
}

export function isValidReportName(name: string): boolean {
  return name.trim().length > 0;
}

// ------------------------------------------------------------ columns

export function addFieldColumn(columns: ReportColumn[], fieldId: string): ReportColumn[] {
  return [...columns, { type: "field", fieldId }];
}

export function addMergeColumn(columns: ReportColumn[]): ReportColumn[] {
  return [...columns, { type: "merge", fieldIds: [] }];
}

export function removeColumn(columns: ReportColumn[], index: number): ReportColumn[] {
  return columns.filter((_, i) => i !== index);
}

/** `direction` -1 moves a column earlier, +1 later; out-of-range is a no-op, so a caller need not clamp before calling. */
export function moveColumn(columns: ReportColumn[], index: number, direction: -1 | 1): ReportColumn[] {
  const target = index + direction;
  if (target < 0 || target >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function addMergeSource(columns: ReportColumn[], index: number, fieldId: string): ReportColumn[] {
  return columns.map((c, i) => (i === index && c.type === "merge" ? { ...c, fieldIds: [...c.fieldIds, fieldId] } : c));
}

export function removeMergeSource(columns: ReportColumn[], index: number, sourceIndex: number): ReportColumn[] {
  return columns.map((c, i) => (i === index && c.type === "merge" ? { ...c, fieldIds: c.fieldIds.filter((_, j) => j !== sourceIndex) } : c));
}

/** A field already used as a direct column, or already a source of some merge column, does not need offering again in the same picker. */
export function usedFieldIds(columns: ReportColumn[]): Set<string> {
  const out = new Set<string>();
  for (const c of columns) {
    if (c.type === "field") out.add(c.fieldId);
    else for (const id of c.fieldIds) out.add(id);
  }
  return out;
}

/** Every version any offered field is tagged with, unioned — the "versions in range" set a per-field partial-coverage check compares against. */
export function allVersionsInRange(choices: ColumnChoice[]): number[] {
  return [...new Set(choices.flatMap((c) => c.versions))];
}

/** A field's coverage is partial when at least one in-range version does not declare it — the case the builder flags, per "Column choices come from the union of field catalogs in range". */
export function isPartialCoverage(choice: ColumnChoice, versionsInRange: number[]): boolean {
  return versionsInRange.some((v) => !choice.versions.includes(v));
}

export function fieldLabel(fieldId: string, choices: ColumnChoice[]): string {
  return choices.find((c) => c.fieldId === fieldId)?.fieldId ?? fieldId;
}

// ------------------------------------------------------------ sharing

/** The owner can never be removed from `editors` — the invariant the engine also enforces; the UI blocks the control before a request is even sent (spec: "Removing the owner from editors is prevented in the UI"). */
export function canRemovePrincipal(list: "viewers" | "editors", principal: string, owner: string): boolean {
  return !(list === "editors" && principal === owner);
}

// ------------------------------------------------------------ table rendering

export type CellDisplay = { kind: string; text: string; srLabel: string };

/** The three-way empty state and an ordinary value, each keyed by `kind` so the component picks its own CSS class off it — never collapsed into one blank look (spec: "A cell distinguishes no-value, not-yet-existing and redacted"). */
export function fieldCellDisplay(cell: ReportCell, locale: UiLocale): CellDisplay {
  switch (cell.kind) {
    case "value":
      return { kind: "value", text: cell.value === null ? "" : String(cell.value), srLabel: "" };
    case "no-value":
      return { kind: "no-value", text: "—", srLabel: t(locale, "cell.noValue") };
    case "not-in-version":
      return { kind: "not-in-version", text: t(locale, "cell.notInVersion"), srLabel: t(locale, "cell.notInVersion") };
    case "redacted":
      return { kind: "redacted", text: "", srLabel: t(locale, "cell.redacted") };
  }
}

export function mergeCellDisplay(cell: MergeReportCell, locale: UiLocale): CellDisplay & { collision: boolean } {
  if (cell.kind === "redacted") return { kind: "redacted", text: "", srLabel: t(locale, "cell.redacted"), collision: false };
  return { kind: "value", text: cell.value, srLabel: "", collision: cell.collision };
}
