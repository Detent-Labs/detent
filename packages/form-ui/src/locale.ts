import { resolveLocalizedText, type LocalizedText, type LocaleCode } from "workflow-engine/schema";
import type { ResolvedViewField } from "./types.js";

/** `LocalizedText` resolution with fallback to `baseLocale` — a consumer with
 * a single locale (the editor's Player) passes the same value for both. */
export function resolveText(value: LocalizedText | undefined, locale: LocaleCode, baseLocale: LocaleCode): string {
  if (!value) return "";
  return resolveLocalizedText(value, locale, baseLocale) ?? "";
}

/**
 * Resolves every field's label, and every option's label, to a single entry
 * keyed by `locale`, falling back to `baseLocale`. `FieldForm`/`FieldInput`
 * take `locale` alone and hold no base-locale concept of their own ("form-ui
 * takes locale as a prop and holds no locale state"); a caller that wants
 * the fallback runs its `fields` through this first. Returns a new array;
 * never mutates its input.
 */
export function resolveFieldsLocale(fields: ResolvedViewField[], locale: LocaleCode, baseLocale: LocaleCode): ResolvedViewField[] {
  return fields.map((f) => ({
    ...f,
    field: { ...f.field, label: { [locale]: resolveText(f.field.label, locale, baseLocale) } },
    options: f.options?.map((o) => ({ ...o, label: { [locale]: resolveText(o.label, locale, baseLocale) } })),
  }));
}
