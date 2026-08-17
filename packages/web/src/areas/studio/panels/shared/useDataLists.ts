import { listDataLists } from "../../api/client.js";
import type { StudioDataList } from "../../api/types.js";
import { useFetchOnce } from "./useFetchOnce.js";

/**
 * Fetches the server's data lists once per mount. `undefined` until it
 * resolves, and after a failed fetch — a caller then falls back to free text
 * and warns about nothing.
 *
 * Two panels read it, the same shape `useRegistry` beside it already takes:
 * `DataSourcesPanel` for the `"db.list"` key picker, and `FieldCatalogPanel`
 * for the column keys its mapping editor offers.
 */
export function useDataLists(token: string): StudioDataList[] | undefined {
  return useFetchOnce(token, listDataLists);
}
