import { studioCatalog, type CatalogKey } from "../../i18n/catalogs/studio.js";
import { resolveOverride } from "../../i18n/overrides.js";

export type { CatalogKey };

/** Fixed English catalog lookup — no locale state, so the override lookup passes the fixed "en". */
export function t(key: CatalogKey): string {
  return resolveOverride("studio", "en", key) ?? studioCatalog.en[key];
}
