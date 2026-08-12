import type { UiLocale } from "../../i18n/locale.js";
import { adminCatalog, type CatalogKey } from "../../i18n/catalogs/admin.js";
import { resolveOverride } from "../../i18n/overrides.js";

export type { CatalogKey };

/** Looks up `key` in `locale`'s catalog, preferring a deployment's stored override. */
export function t(locale: UiLocale, key: CatalogKey): string {
  return resolveOverride("admin", locale, key) ?? adminCatalog[locale][key];
}

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
