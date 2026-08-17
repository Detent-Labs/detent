import type { UiLocale } from "../../i18n/locale.js";
import { reportingCatalog, type CatalogKey } from "../../i18n/catalogs/reporting.js";
import { makeCatalog } from "../../i18n/makeCatalog.js";

export type { CatalogKey };

export const t = makeCatalog("reporting", reportingCatalog);

/**
 * A count-bearing sentence, with `{n}` filled in. One key holds the whole
 * sentence per grammatical form, so a translator never sees a fragment and the
 * word order stays theirs.
 */
export function tCount(locale: UiLocale, key: CatalogKey, n: number): string {
  return t(locale, key).replace("{n}", String(n));
}
