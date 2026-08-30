import { resolveLocalizedText, type LocalizedText, type LocaleCode } from "workflow-engine/schema";
import type { ResolvedViewField } from "./types.js";

/** `LocalizedText` resolution with fallback to `baseLocale` — a consumer with
 * a single locale (the editor's Player) passes the same value for both. */
export function resolveText(value: LocalizedText | undefined, locale: LocaleCode, baseLocale: LocaleCode): string {
  if (!value) return "";
  return resolveLocalizedText(value, locale, baseLocale) ?? "";
}

/**
 * The two labels a boolean radio pair carries, per locale. Owned by `form-ui`
 * the way `issue-messages.ts` owns `CONSTRAINT_LABEL`: the process body never
 * carries them, so no author writes and no translator re-translates "Yes" in
 * every body. An author wanting other wording, such as Approved and Rejected,
 * declares a two-option `string` field instead.
 */
const BOOLEAN_LABEL: Record<string, { yes: string; no: string }> = {
  en: { yes: "Yes", no: "No" },
  de: { yes: "Ja", no: "Nein" },
};

/** `BOOLEAN_LABEL` for `locale`, falling back to English the way
 * `issueMessage` does — an unlisted locale renders readable text rather than
 * nothing. */
export function booleanLabels(locale: LocaleCode): { yes: string; no: string } {
  return BOOLEAN_LABEL[locale] ?? BOOLEAN_LABEL.en!;
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
