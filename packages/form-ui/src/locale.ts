import { resolveLocalizedText, type LocalizedText, type LocaleCode } from "workflow-engine/schema";

/** `LocalizedText` resolution with fallback to `baseLocale` — a consumer with
 * a single locale (the editor's Player) passes the same value for both. */
export function resolveText(value: LocalizedText | undefined, locale: LocaleCode, baseLocale: LocaleCode): string {
  if (!value) return "";
  return resolveLocalizedText(value, locale, baseLocale) ?? "";
}
