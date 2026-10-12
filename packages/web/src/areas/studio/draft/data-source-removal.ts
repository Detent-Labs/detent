import { draftFields } from "./fields";
import type { Draft } from "./types";

/**
 * What removing one data source reaches, and the removal itself. A field
 * names a source by id in `dataSource`. `dataSourceRemovalReach` measures a
 * removal on the draft before any write, and `hasDataSourceReach` tells a
 * removal with reach from one without. `removeDataSourceAndReferences` makes
 * the removal and clears the field references, so none keeps an id that
 * resolves to nothing.
 */

/** A removal's reach: the fields that name the source, and the column mapping
 * entries those fields carry. */
export interface DataSourceRemovalReach {
  /** The fields that name the source, at every depth. */
  fields: number;
  /** The `columnMapping` entries on those fields. */
  columnMappings: number;
}

/**
 * Measures what removing `dataSourceId` reaches, on the draft as it stands.
 * Answers `undefined` for an id no data source carries.
 */
export function dataSourceRemovalReach(draft: Draft, dataSourceId: string): DataSourceRemovalReach | undefined {
  if (!draft.dataSources?.some((ds) => ds.id === dataSourceId)) return undefined;
  const naming = draftFields(draft).filter((f) => f.dataSource === dataSourceId);
  const columnMappings = naming.reduce((sum, f) => sum + Object.keys(f.columnMapping ?? {}).length, 0);
  return { fields: naming.length, columnMappings };
}

/** True when a field names the source. A column mapping needs a data source,
 * so its count never sits above zero alone. */
export function hasDataSourceReach(reach: DataSourceRemovalReach): boolean {
  return reach.fields > 0;
}

/**
 * Removes `dataSourceId` from the draft as a `mutate` recipe: it writes the
 * draft it receives. Each field that names the source first loses
 * `dataSource` and `columnMapping`, which leave together since a column
 * mapping needs a data source. The source is spliced last. An id no data
 * source carries leaves the draft unchanged.
 */
export function removeDataSourceAndReferences(draft: Draft, dataSourceId: string): void {
  const index = draft.dataSources?.findIndex((ds) => ds.id === dataSourceId) ?? -1;
  if (index === -1) return;
  for (const f of draftFields(draft)) {
    if (f.dataSource !== dataSourceId) continue;
    delete f.dataSource;
    delete f.columnMapping;
  }
  draft.dataSources?.splice(index, 1);
}
