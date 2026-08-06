import { studioCatalog, type TranslationKey } from "../../i18n/catalogs/studio.js";
import { resolveOverride } from "../../i18n/overrides.js";

export type { TranslationKey };

/** Fixed English catalog lookup — no locale state, so the override lookup passes the fixed "en". */
export function t(key: TranslationKey): string {
  return resolveOverride("studio", "en", key) ?? studioCatalog.en[key];
}
