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
): { value: string; label: Record<string, string>; sortOrder: number }[] {
  return activeRows(rows).map((row, i) => ({
    value: row.value.trim(),
    label: { ...existingLabels[row.value.trim()], [locale]: row.label.trim() },
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
