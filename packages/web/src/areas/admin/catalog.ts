import type { UiLocale } from "../../i18n/locale.js";
import { adminCatalog, type CatalogKey } from "../../i18n/catalogs/admin.js";
import { makeCatalog } from "../../i18n/makeCatalog.js";

export type { CatalogKey };

export const t = makeCatalog("admin", adminCatalog);

/**
 * A catalog sentence with its `{name}` placeholders filled in. One key holds
 * the whole sentence, so a translator sees it entire and keeps their own word
 * order. A placeholder no caller fills stays in the text rather than reading as
 * an empty gap.
 */
export function tFill(locale: UiLocale, key: CatalogKey, values: Record<string, string | number>): string {
  let text = t(locale, key);
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
