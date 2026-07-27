import { localeCode } from "workflow-engine/schema";
import type { Draft } from "./types";
import { draftFields, type DraftField } from "./fields";

/** A Draft's `LocalizedText` fields are deeply partial (`DraftOf`), unlike
 * the engine's schema-valid `LocalizedText` where the base-locale entry is
 * guaranteed by the authored-content-localization invariant. An author
 * mid-edit can legitimately have neither the requested locale nor the base
 * locale filled in yet, so this returns `undefined` instead of the engine's
 * `resolveLocalizedText` (which assumes a complete value). */
export type DraftLocalizedText = Partial<Record<string, string>> | undefined;

export function resolveDraftLocalizedText(
  value: DraftLocalizedText,
  locale: string,
  baseLocale: string,
): string | undefined {
  return value?.[locale] ?? value?.[baseLocale];
}

/** Writes `text` into `value`'s entry for `locale` only, leaving every
 * other locale entry untouched — the merge `LocalizedTextInput` performs on
 * every keystroke, extracted so it's directly testable without simulating
 * a DOM change event. */
export function mergeLocalizedTextEntry(value: DraftLocalizedText, locale: string, text: string): DraftLocalizedText {
  return { ...(value ?? {}), [locale]: text };
}

/** Every locale key already used anywhere in the Draft (process, steps,
 * fields including nested group fields, field options), plus the Draft's
 * own `baseLocale` (or "en") so the content-locale switcher always has at
 * least one selectable option, even in a brand-new Draft. */
export function collectUsedLocales(draft: Draft): string[] {
  const locales = new Set<string>([draft.baseLocale ?? "en"]);
  const addFrom = (value: DraftLocalizedText) => {
    for (const k of Object.keys(value ?? {})) locales.add(k);
  };

  addFrom(draft.label);
  addFrom(draft.description);
  for (const step of draft.workflow?.steps ?? []) {
    addFrom(step.label);
    addFrom(step.description);
  }
  for (const field of draftFields(draft)) {
    addFrom(field.label);
    addFrom(field.description);
    for (const option of field.options ?? []) addFrom(option.label);
  }

  return Array.from(locales).sort();
}

/** Validates a candidate locale code an author types into the content-locale
 * switcher's "add a locale" input, extracted from `ContentLocaleSwitcher` so
 * it's directly testable without simulating a click (static rendering has
 * no event dispatch). Reuses the engine's own `localeCode` schema rather
 * than duplicating its regex. */
export type AddLocaleAttempt = { ok: true; locale: string } | { ok: false };

export function resolveAddLocaleAttempt(candidate: string): AddLocaleAttempt {
  return localeCode.safeParse(candidate).success ? { ok: true, locale: candidate } : { ok: false };
}

/** Draft field seed for a freshly-created step/field/option: an empty
 * LocalizedText entry under the currently selected content locale, not a
 * bare string — a new entity must satisfy the base-locale invariant as soon
 * as its baseLocale entry is filled in, and this seeds the locale the
 * author is actually looking at. */
export function seedLocalizedText(contentLocale: string): DraftField["label"] {
  return { [contentLocale]: "" };
}
