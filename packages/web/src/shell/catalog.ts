import type { UiLocale } from "../i18n/locale.js";
import { shellCatalog, type ShellKey } from "../i18n/catalogs/shell.js";
import { resolveOverride } from "../i18n/overrides.js";

export type { ShellKey };

/** Looks up `key` in `locale`'s catalog, preferring a deployment's stored override. */
export function t(locale: UiLocale, key: ShellKey): string {
  return resolveOverride("shell", locale, key) ?? shellCatalog[locale][key];
}
