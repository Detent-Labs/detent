import { nextRowId, type RowId } from "../../screens/migrationPlanLogic.js";

/**
 * The `instance.query` form's attribute rows (design.md decision 4). A row
 * carries its own id, so its key input keeps focus while the developer types
 * the key. A row with an empty or duplicate key stays local: a record cannot
 * hold either.
 */
export interface AttributeRow {
  rowId: RowId;
  key: string;
  fieldId: string;
}

/** The config's `attributes` as the rows can hold it: string values under a non-empty key. */
export function attributeRecord(value: unknown): Record<string, string> {
  const record: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return record;
  for (const [key, fieldId] of Object.entries(value)) if (key !== "" && typeof fieldId === "string") record[key] = fieldId;
  return record;
}

export function rowsFromRecord(record: Record<string, string>): AttributeRow[] {
  return Object.entries(record).map(([key, fieldId]) => ({ rowId: nextRowId(), key, fieldId }));
}

/** Rows with a non-empty key, in row order. The first row wins a duplicate key. */
export function recordFromRows(rows: readonly AttributeRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) if (row.key !== "" && !(row.key in record)) record[row.key] = row.fieldId;
  return record;
}

/** The ids of the later rows whose key an earlier row holds. */
export function duplicateRowIds(rows: readonly AttributeRow[]): Set<RowId> {
  const seen = new Set<string>();
  const duplicates = new Set<RowId>();
  for (const row of rows) {
    if (row.key === "") continue;
    if (seen.has(row.key)) duplicates.add(row.rowId);
    else seen.add(row.key);
  }
  return duplicates;
}

/** Equal entries, in any order. */
export function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
}

/**
 * New rows when `attributes` no longer matches what the rows commit, for
 * example after a raw JSON change or a switch to another data source.
 * `undefined` keeps the rows, local-only rows included. The new rows commit
 * exactly `attributeRecord(attributes)`, so a second call returns
 * `undefined` and a render-time reseed cannot loop.
 */
export function reseedRows(rows: readonly AttributeRow[], attributes: unknown): AttributeRow[] | undefined {
  const record = attributeRecord(attributes);
  return sameRecord(recordFromRows(rows), record) ? undefined : rowsFromRecord(record);
}
