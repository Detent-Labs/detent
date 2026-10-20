/**
 * Pure view-model helpers for the report builder, mirroring
 * reportingLogic.ts's convention: everything a test can assert lives here,
 * components stay thin.
 */
import type { ColumnChoice, DataComparison, MergeReportCell, Report, ReportCell, ReportColumn } from "../api/types.js";
import { t, type CatalogKey } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import {
  literalText,
  literalType,
  parseLiteral,
  parseLiteralList,
  sameLiteral,
  valueTypeOf,
  type LiteralValue,
  type ParseFailure,
  type Parsed,
  type ValueType,
} from "../../../shell/literalValue.js";
import { fromDateInput } from "./reportingLogic.js";

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

/**
 * The wire shape `createReport`/`updateReport`/`previewReport` accept — `undefined` for every axis left unset rather than an empty value the server would treat as a real filter.
 * An incomplete comparison stays out, so a preview, a save and a column request never filter on it.
 */
export function draftToInput(draft: ReportDraft) {
  const dataWhere = draft.dataWhere.filter((c) => !comparisonIncomplete(c));
  return {
    processId: draft.processId,
    name: draft.name.trim(),
    query: {
      status: draft.status.length > 0 ? draft.status : undefined,
      createdAfter: draft.createdAfter || undefined,
      createdBefore: draft.createdBefore || undefined,
      dataWhere: dataWhere.length > 0 ? dataWhere : undefined,
    },
    columns: draft.columns,
    viewers: draft.viewers,
    editors: draft.editors,
  };
}

/**
 * `draft` with one date bound set from a date input's `YYYY-MM-DD` value. A
 * `start` edge sets `createdAfter` to local midnight of that day and an `end`
 * edge sets `createdBefore` to the last local millisecond, the instants the
 * three views send. An empty value clears the bound.
 */
export function withDateBound(draft: ReportDraft, edge: "start" | "end", value: string): ReportDraft {
  const bound = value ? fromDateInput(value, edge) : "";
  return edge === "start" ? { ...draft, createdAfter: bound } : { ...draft, createdBefore: bound };
}

export function isValidReportName(name: string): boolean {
  return name.trim().length > 0;
}

/** The column request's debounce key: the process and the complete query. An incomplete comparison leaves it unchanged. */
export function columnRequestKey(draft: ReportDraft): string {
  return JSON.stringify([draft.processId, draftToInput(draft).query]);
}

// ------------------------------------------------------------ comparisons
//
// The comparison row writes a value of the compared field's declared type,
// because the engine compares `jsonb` by type and `"500"` never equals `500`
// (`reporting-data-tables`). The row-text rules duplicate the studio's
// `areas/studio/panels/shared/comparisonRow.ts` on purpose: an area never
// imports another area.

export type Operator = DataComparison["operator"];

/** A comparison the builder has no value for yet. `null` is a value. */
export function comparisonIncomplete(comparison: DataComparison): boolean {
  return comparison.value === undefined;
}

/** Field id to the declared type the last response named for it. A field named without a type maps to `undefined`. */
export type RememberedTypes = ReadonlyMap<string, string | undefined>;

/**
 * Adds every field `choices` names to `types`, in a new map. A field the
 * response no longer names keeps its entry, so a comparison that empties the
 * range stays editable.
 */
export function rememberTypes(types: RememberedTypes, choices: readonly ColumnChoice[]): RememberedTypes {
  const next = new Map(types);
  for (const c of choices) next.set(c.fieldId, c.type);
  return next;
}

/** The remembered types of one process. */
export type ProcessTypes = { processId: string; types: RememberedTypes };

const NO_TYPES: RememberedTypes = new Map();

/**
 * `prev` with each loaded comparison's field mapped to its value's type, for
 * a field the map lacks. A cleared or half-typed value then keeps its row's
 * type until a response names the field and overwrites the entry. A seed
 * never overwrites an entry a response wrote. Another process's map is
 * dropped.
 */
export function seedTypes(prev: ProcessTypes | undefined, processId: string, comparisons: readonly DataComparison[]): ProcessTypes {
  const types = new Map(prev?.processId === processId ? prev.types : NO_TYPES);
  for (const c of comparisons) {
    const type = valueTypeOf(c.value);
    if (type !== undefined && !types.has(c.fieldId)) types.set(c.fieldId, type);
  }
  return { processId, types };
}

/** `prev` with a response's types added. A response for another process starts a fresh map and leaves `prev` untouched. */
export function typesAfterResponse(prev: ProcessTypes | undefined, processId: string, choices: readonly ColumnChoice[]): ProcessTypes {
  const known = prev?.processId === processId ? prev.types : NO_TYPES;
  return { processId, types: rememberTypes(known, choices) };
}

/** The map a draw for `processId` reads: none while the held map belongs to another process. */
export function typesFor(held: ProcessTypes | undefined, processId: string): RememberedTypes {
  return held?.processId === processId ? held.types : NO_TYPES;
}

/** A remembered field takes its declared type's value type. A field never named follows its value, and otherwise takes text. */
export function valueTypeFor(types: RememberedTypes, fieldId: string, value: unknown): ValueType {
  if (types.has(fieldId)) return literalType(types.get(fieldId));
  return valueTypeOf(value) ?? "string";
}

/** A new compared field keeps the value when both fields take the same value type, and clears it otherwise. */
export function switchComparisonField(comparison: DataComparison, fieldId: string, types: RememberedTypes): DataComparison {
  const before = valueTypeFor(types, comparison.fieldId, comparison.value);
  const after = valueTypeFor(types, fieldId, undefined);
  return { ...comparison, fieldId, value: before === after ? comparison.value : undefined };
}

/** A switch into or out of `in` clears the value: a list never fits a scalar comparison. A switch between `eq` and `ne` keeps it. */
export function switchComparisonOperator(comparison: DataComparison, operator: Operator): DataComparison {
  const crossesList = (comparison.operator === "in") !== (operator === "in");
  return { ...comparison, operator, value: crossesList ? undefined : comparison.value };
}

/** A list for `in`, one literal otherwise. */
export function parseComparisonText(text: string, type: ValueType, operator: Operator): Parsed<LiteralValue | LiteralValue[]> {
  return operator === "in" ? parseLiteralList(text, type) : parseLiteral(text, type);
}

/** The catalog key of the reason a row prints, or `undefined` for empty text, which only dashes the row. */
export function reasonKey(reason: ParseFailure): CatalogKey | undefined {
  if (reason === "not-number") return "builder.notNumber";
  if (reason === "not-boolean") return "builder.notBoolean";
  return undefined;
}

/** The boolean select's choice for a stored value. Anything but a boolean shows the empty choice. */
export function booleanChoice(value: unknown): "true" | "false" | "" {
  return value === true ? "true" : value === false ? "false" : "";
}

export function valueFromChoice(choice: string): boolean | undefined {
  return choice === "true" ? true : choice === "false" ? false : undefined;
}

/** A row's own text, and the last `value` prop it drew with. */
export interface TextState {
  text: string;
  seen: unknown;
}

export function initialTextState(value: unknown): TextState {
  return { text: literalText(value), seen: value };
}

/**
 * The text a row draws for `value` (design.md decision 2). The row reacts
 * only when `value` differs from the prop it last saw: it remembers the new
 * prop and keeps its text when that text parses to it. Text that does not
 * parse stands for `undefined`. Otherwise the row adopts `literalText(value)`.
 * An unchanged prop returns `state` itself, so a render-time update cannot
 * loop, even on a stored value of the wrong type.
 */
export function reconcileText(state: TextState, value: unknown, type: ValueType, operator: Operator): TextState {
  if (sameLiteral(value, state.seen)) return state;
  const parsed = parseComparisonText(state.text, type, operator);
  const text = sameLiteral(parsed.ok ? parsed.value : undefined, value) ? state.text : literalText(value);
  return { text, seen: value };
}

export type RowId = string;

function nextRowId(): RowId {
  return `row_${crypto.randomUUID()}`;
}

/**
 * Fresh React keys for `count` comparison rows, or `undefined` while
 * `rowIds` already holds one per row. A keyed row keeps its own text when an
 * earlier row is removed. A loaded report changes the count and mints new
 * keys, so every row redraws from its stored value.
 */
export function syncRowIds(rowIds: readonly RowId[], count: number): RowId[] | undefined {
  return rowIds.length === count ? undefined : Array.from({ length: count }, () => nextRowId());
}

export function withRowId(rowIds: readonly RowId[]): RowId[] {
  return [...rowIds, nextRowId()];
}

export function withoutRowId(rowIds: readonly RowId[], index: number): RowId[] {
  return rowIds.filter((_, i) => i !== index);
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
  if (cell.kind === "no-value") return { kind: "no-value", text: "—", srLabel: t(locale, "cell.noValue"), collision: false };
  return { kind: "value", text: cell.value, srLabel: "", collision: cell.collision };
}
