import type { UiLocale } from "../../i18n/locale.js";
import { appCatalog, type CatalogKey } from "../../i18n/catalogs/app.js";
import { resolveOverride } from "../../i18n/overrides.js";

export type { CatalogKey };

/** Looks up `key` in `locale`'s catalog, preferring a deployment's stored override. */
export function t(locale: UiLocale, key: CatalogKey): string {
  return resolveOverride("app", locale, key) ?? appCatalog[locale][key];
}
