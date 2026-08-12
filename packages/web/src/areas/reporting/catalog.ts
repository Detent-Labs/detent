import type { UiLocale } from "../../i18n/locale.js";
import { reportingCatalog, type CatalogKey } from "../../i18n/catalogs/reporting.js";
import { resolveOverride } from "../../i18n/overrides.js";

export type { CatalogKey };

/** Looks up `key` in `locale`'s catalog, preferring a deployment's stored override. */
export function t(locale: UiLocale, key: CatalogKey): string {
  return resolveOverride("reporting", locale, key) ?? reportingCatalog[locale][key];
}

/**
 * A count-bearing sentence, with `{n}` filled in. One key holds the whole
 * sentence per grammatical form, so a translator never sees a fragment and the
 * word order stays theirs.
 */
export function tCount(locale: UiLocale, key: CatalogKey, n: number): string {
  return t(locale, key).replace("{n}", String(n));
}
