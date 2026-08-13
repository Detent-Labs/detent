/**
 * The value-editor rules that need no React. The server enforces all three
 * itself (`admin-routes.ts::parseValues`); checking them here turns a 400 into
 * an inline message before the operator loses their edits.
 */
import type { UiLocale } from "../../../i18n/locale.js";
import { t, tFill } from "../catalog.js";

/**
 * The engine's `MAX_DATA_LIST_VALUES`. Restated rather than imported: the
 * engine's exports map publishes the schema and the registries, not `host.ts`.
 * The server stays the enforcement; this only spares a round trip.
 */
export const MAX_DATA_LIST_VALUES = 500;

/** One editable row. `retired` rows are kept on screen and left out of the payload, which is what deactivates them. */
export interface ValueRow {
  value: string;
  label: string;
  /**
   * One raw input string per declared column, blank when unfilled. Held as
   * text, not as the typed value, because that is what an `<input>` gives:
   * `attributesPayload` does the one conversion, at save.
   */
  attributes: Record<string, string>;
  retired: boolean;
}

/** Values naming a row more than once. The primary key is `(list_key, value)`, so a duplicate is rejected whether or not either row is retired. */
export function duplicateValues(rows: readonly ValueRow[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.value)) dupes.add(row.value);
    seen.add(row.value);
  }
  return [...dupes];
}

/** Rows sent on save: the ones the operator has not retired. */
export function activeRows(rows: readonly ValueRow[]): ValueRow[] {
  return rows.filter((r) => !r.retired);
}

/**
 * Every reason this set cannot be saved, in the order an operator would fix
 * them. An empty array means the payload is well formed.
 */
export function validateValues(rows: readonly ValueRow[], locale: UiLocale): string[] {
  const problems: string[] = [];
  const payload = activeRows(rows);
  if (payload.length > MAX_DATA_LIST_VALUES) {
    problems.push(tFill(locale, "dataList.problemTooMany", { max: MAX_DATA_LIST_VALUES, n: payload.length }));
  }
  if (rows.some((r) => r.value.trim() === "")) problems.push(t(locale, "dataList.problemNoKey"));
  if (payload.some((r) => r.label.trim() === "")) problems.push(t(locale, "dataList.problemNoLabel"));
  for (const dupe of duplicateValues(rows)) problems.push(tFill(locale, "dataList.problemDuplicate", { value: dupe }));
  return problems;
}

/**
 * The payload for `PUT .../values`. Row order becomes `sortOrder`, so an
 * operator reorders the list by moving rows, and the label is written under
 * the locale they are editing in — the other locales of that value are carried
 * through untouched.
 */
export function toPayload(
  rows: readonly ValueRow[],
  locale: string,
  existingLabels: Readonly<Record<string, Record<string, string>>>,
  columns: readonly ColumnRow[] = [],
): { value: string; label: Record<string, string>; attributes: Record<string, string | number | boolean>; sortOrder: number }[] {
  return activeRows(rows).map((row, i) => ({
    value: row.value.trim(),
    label: { ...existingLabels[row.value.trim()], [locale]: row.label.trim() },
    attributes: attributesPayload(row.attributes, columns),
    sortOrder: i,
  }));
}

/**
 * The label to show for a value. Falls back to any locale the value does carry,
 * then to the bare key: a list is global while a process is not, so a value can
 * legitimately miss the locale being read.
 */
export function readLabel(label: Record<string, string>, locale: string): string {
  return label[locale] ?? Object.values(label)[0] ?? "";
}

// ---- Column declaration and per-value attributes ----

/**
 * The engine's `MAX_DATA_LIST_COLUMNS`, restated for the same reason
 * `MAX_DATA_LIST_VALUES` above is: the exports map publishes the schema and the
 * registries, not `host.ts`. The server stays the enforcement.
 */
export const MAX_DATA_LIST_COLUMNS = 10;

/** The engine's column key grammar, restated for the same reason. */
const COLUMN_KEY_FORMAT = /^[a-z_][a-z0-9_]*$/;

/** One editable column row. Mirrors the wire shape, so a save sends these unchanged. */
export interface ColumnRow {
  key: string;
  label: string;
  type: "string" | "number" | "boolean";
}

/** Every reason a declaration cannot be saved, in the order an operator would fix them. */
export function validateColumns(columns: readonly ColumnRow[], locale: UiLocale): string[] {
  const problems: string[] = [];
  if (columns.length > MAX_DATA_LIST_COLUMNS) {
    problems.push(tFill(locale, "dataList.problemTooManyColumns", { max: MAX_DATA_LIST_COLUMNS, n: columns.length }));
  }
  for (const column of columns) {
    if (!COLUMN_KEY_FORMAT.test(column.key)) problems.push(tFill(locale, "dataList.problemColumnKey", { key: column.key }));
    if (column.label.trim() === "") problems.push(tFill(locale, "dataList.problemColumnLabel", { key: column.key }));
  }
  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column.key)) problems.push(tFill(locale, "dataList.problemColumnDuplicate", { key: column.key }));
    seen.add(column.key);
  }
  return problems;
}

/**
 * The declared columns a save would drop, so the screen can warn before it
 * writes. Dropping a column drops its value from every value of the list, and
 * that write is not reversible from this screen.
 */
export function droppedColumns(before: readonly ColumnRow[], after: readonly ColumnRow[]): string[] {
  const kept = new Set(after.map((c) => c.key));
  return before.map((c) => c.key).filter((key) => !kept.has(key));
}

/**
 * One value's attributes as the route takes them: typed by the column, and
 * carrying no entry for a column the operator left blank. A blank number input
 * is an absent attribute, never a zero — the engine's "unfilled column writes
 * nothing" rule depends on the difference.
 */
export function attributesPayload(
  raw: Readonly<Record<string, string>>,
  columns: readonly ColumnRow[],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const column of columns) {
    const value = raw[column.key];
    if (value === undefined || value.trim() === "") continue;
    if (column.type === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) out[column.key] = n;
      continue;
    }
    if (column.type === "boolean") {
      out[column.key] = value === "true";
      continue;
    }
    out[column.key] = value;
  }
  return out;
}

/** A stored attribute map as the editor holds it: one string per declared column, blank when unfilled. */
export function attributesToInputs(
  stored: Readonly<Record<string, string | number | boolean>>,
  columns: readonly ColumnRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const column of columns) {
    const value = stored[column.key];
    out[column.key] = value === undefined ? "" : String(value);
  }
  return out;
}

/** A number input the operator filled with something that is not a number. */
export function badNumberAttributes(rows: readonly ValueRow[], columns: readonly ColumnRow[], locale: UiLocale): string[] {
  const problems: string[] = [];
  for (const column of columns) {
    if (column.type !== "number") continue;
    for (const row of activeRows(rows)) {
      const raw = row.attributes[column.key];
      if (raw === undefined || raw.trim() === "") continue;
      if (!Number.isFinite(Number(raw))) problems.push(tFill(locale, "dataList.problemAttributeNumber", { key: column.key, value: raw }));
    }
  }
  return problems;
}
