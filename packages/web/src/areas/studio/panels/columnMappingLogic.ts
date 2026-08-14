/**
 * The `columnMapping` editor's rules, kept out of React so they can be tested
 * (`studio-column-mapping-form`).
 *
 * Nothing here validates. `draft/validation.ts` runs the engine's own
 * `compileProcessBody`, so all seven of `checkColumnMapping`'s rules already
 * reach the checks rail. A second copy here would be a second answer that can
 * drift from the first.
 */
import type { DraftField } from "../draft/fields";
import { flattenDraftFields } from "../draft/fields";
import type { DraftOf } from "../draft/types";
import type { StudioDataList } from "../api/types.js";
import { DB_LIST_TYPE, listKeyOf } from "./dataListKeysLogic.js";

type DraftDataSource = DraftOf<{ id?: string; key?: string; type?: string; config?: unknown }>;

/** One row of the editor: a mapped column key, its target field, and whether the list still declares that key. */
export interface ColumnMappingRow {
  column: string;
  target: string;
  /** True where the bound list no longer declares `column`. The row stays and the editor marks it. */
  stale: boolean;
}

/** The list a field's mapping draws its column keys from, or `undefined`. */
function boundList(
  field: DraftField,
  dataSources: readonly DraftDataSource[],
  lists: readonly StudioDataList[] | undefined,
): StudioDataList | undefined {
  if (lists === undefined || field.dataSource === undefined) return undefined;
  const source = dataSources.find((d) => d?.id === field.dataSource);
  if (source?.type !== DB_LIST_TYPE) return undefined;
  const listKey = listKeyOf(source.config);
  return lists.find((l) => l.listKey === listKey);
}

/**
 * Whether the editor appears for this field.
 *
 * Two of the three conditions are the engine's: `checkColumnMapping` refuses a
 * mapping on a field carrying no `dataSource`, and on a field that is not a
 * `select`. The `"db.list"` narrowing is this editor's own — only a data list
 * declares columns, so no other source type gives the picker anything to
 * offer. A mapping on such a source stays authorable in the JSON view.
 */
export function showsColumnMapping(field: DraftField, dataSources: readonly DraftDataSource[]): boolean {
  if (field.type !== "select" || field.dataSource === undefined) return false;
  return dataSources.find((d) => d?.id === field.dataSource)?.type === DB_LIST_TYPE;
}

/** The column keys the field's bound list declares, for the row's first picker. */
export function declaredColumns(
  field: DraftField,
  dataSources: readonly DraftDataSource[],
  lists: readonly StudioDataList[] | undefined,
): string[] {
  return (boundList(field, dataSources, lists)?.columns ?? []).map((c) => c.key);
}

/**
 * One row per mapped key, in the mapping's own key order.
 *
 * A key the list no longer declares comes back `stale` rather than dropped.
 * Such a mapping outlives the column it names, and the data list route reports
 * it for that reason. Dropping the row would hide what an operator reads that
 * report to find.
 *
 * Every row is `stale: false` while the lists have not arrived. The studio says
 * nothing rather than marking every key on a failed fetch, the rule
 * `unknownListKeyWarning` already takes beside it.
 */
export function columnMappingRows(
  field: DraftField,
  dataSources: readonly DraftDataSource[],
  lists: readonly StudioDataList[] | undefined,
): ColumnMappingRow[] {
  const mapping = (field.columnMapping ?? {}) as Record<string, string>;
  const known = new Set(declaredColumns(field, dataSources, lists));
  const unknownable = lists !== undefined && boundList(field, dataSources, lists) !== undefined;
  return Object.entries(mapping).map(([column, target]) => ({
    column,
    target,
    stale: unknownable && !known.has(column),
  }));
}

/**
 * The catalog fields a row's target picker offers.
 *
 * It omits a group field, which takes no value, and the mapping field itself.
 * Both are shape rather than validation: neither becomes correct by any later
 * edit. Every other rule stays with the checks rail, a duplicate target
 * included.
 */
export function mappableTargets(field: DraftField, fields: readonly DraftField[]): DraftField[] {
  return flattenDraftFields(fields as DraftField[]).filter((f) => f.type !== "group" && f.id !== field.id);
}
