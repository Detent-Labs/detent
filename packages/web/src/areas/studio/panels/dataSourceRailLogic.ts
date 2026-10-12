import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types.js";

type DraftDataSource = DraftOf<DataSourceDef>;

/** The DOM id of a data source's entity rail row, so a removal can hand it focus. */
export const dataSourceRailId = (dataSourceId: string) => `studio-data-source-rail-${dataSourceId}`;

/** The DOM id of a data source editor's Remove data source control, which
 * `DataSourcesTab` finds to return focus to after a declined removal. */
export const removeDataSourceControlId = (dataSourceId: string) => `studio-data-source-remove-${dataSourceId}`;

/** The DOM id of the entity rail's Add data source control. */
export const ADD_DATA_SOURCE_ID = "studio-data-source-add";

/**
 * The data source the tab selects once the one at `index` leaves: the next
 * one, else the previous one, else none.
 */
export function neighbourAfterDataSourceRemove(dataSources: readonly DraftDataSource[], index: number): DraftDataSource | undefined {
  return dataSources[index + 1] ?? dataSources[index - 1];
}

/**
 * Where focus lands once the data source at `index` leaves: the neighbour's
 * rail row, else the Add data source control when none remain. The removed
 * source's editor remounts, so the control that pressed Remove is gone.
 */
export function focusAfterDataSourceRemove(dataSources: readonly DraftDataSource[], index: number): string {
  const id = neighbourAfterDataSourceRemove(dataSources, index)?.id;
  return id === undefined ? ADD_DATA_SOURCE_ID : dataSourceRailId(id);
}
