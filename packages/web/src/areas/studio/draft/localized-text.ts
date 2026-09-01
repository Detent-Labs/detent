import { localeCode } from "workflow-engine/schema";
import type { Draft } from "./types";
import { draftFields, type DraftField } from "./fields";
import { isDraftViewField } from "./view-layout";

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

/** Every `LocalizedText` position in a Draft, visited once: the process
 * label and description, each step's label and description, each step's
 * notes' text, each field's label and description (recursing into a
 * `group` field's sub-fields through `draftFields`), and each field
 * option's label.
 *
 * `collectUsedLocales` and `localeGapCount` read the same set of entries, so
 * they share this walk rather than carrying two copies of it. A
 * `LocalizedText` position added here reaches both at once.
 * `missingTranslationWarning` is not a third consumer: it reads one value at
 * a time, and each render site calls it directly. */
function forEachLocalizedEntry(draft: Draft, visit: (entry: DraftLocalizedText) => void): void {
  visit(draft.label);
  visit(draft.description);
  for (const step of draft.workflow?.steps ?? []) {
    visit(step.label);
    visit(step.description);
    for (const entry of step.view?.fields ?? []) {
      if (!isDraftViewField(entry)) visit(entry.text);
    }
  }
  for (const field of draftFields(draft)) {
    visit(field.label);
    visit(field.description);
    for (const option of field.options ?? []) visit(option.label);
  }
}

/** Every locale key already used anywhere in the Draft (process, steps,
 * fields including nested group fields, field options), plus the Draft's
 * own `baseLocale` (or "en") so the content-locale switcher always has at
 * least one selectable option, even in a brand-new Draft. */
export function collectUsedLocales(draft: Draft): string[] {
  const locales = new Set<string>([draft.baseLocale ?? "en"]);
  forEachLocalizedEntry(draft, (entry) => {
    for (const k of Object.keys(entry ?? {})) locales.add(k);
  });
  return Array.from(locales).sort();
}

/** How many `LocalizedText` entries carry the Draft's base locale but not
 * `locale` — the count the content-locale switcher shows per option.
 *
 * An entry with no base-locale value is not counted. `runValidation`
 * already reports it as an `EditorIssue` against the authored-content
 * localization invariant, and counting it again here would report one
 * unfilled entry once per locale in the switcher under a second name.
 *
 * The base locale never counts against itself: it is the value every other
 * locale is measured against, so it has nothing to be missing from. */
// ponytail: walks the whole draft once per locale, on every render of
// ContentLocaleSwitcher. That is a few hundred comparisons at realistic
// process sizes, below what runValidation already redoes on every
// keystroke. Memoize per draft if a process grows enough to measure it.
export function localeGapCount(draft: Draft, locale: string): number {
  const baseLocale = draft.baseLocale ?? "en";
  if (locale === baseLocale) return 0;

  let count = 0;
  forEachLocalizedEntry(draft, (entry) => {
    if (entry?.[baseLocale] && !entry?.[locale]) count++;
  });
  return count;
}

/** The warning to show beside one `LocalizedTextInput`, or `undefined` for
 * none. A missing translation never blocks publishing, so this is a
 * warning like `assignmentWarning` and `unknownListKeyWarning`, never an
 * `EditorIssue`.
 *
 * `baseLocale` accepts `undefined` and falls back to "en" here, because
 * `Draft` is `DraftOf<AuthoredProcessBody>` and every call site holds
 * `draft.baseLocale` at the type `string | undefined`. The fallback is the
 * one `collectUsedLocales`, `localeGapCount` and `DraftProvider` apply to
 * the same property.
 *
 * Skips the same entry `localeGapCount` skips, for the same reason: an
 * entry with no base-locale value already draws an `EditorIssue`. */
export function missingTranslationWarning(
  entry: DraftLocalizedText,
  locale: string,
  baseLocale: string | undefined,
): string | undefined {
  const base = baseLocale ?? "en";
  if (locale === base) return undefined;
  if (!entry?.[base]) return undefined;
  if (entry?.[locale]) return undefined;
  return `No ${locale} translation yet. Publishing still works; a reader of ${locale} sees the ${base} text.`;
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

/** How many of `field`'s OWN `LocalizedText` entries — its `label`, its
 * `description`, and each `options[].label` — carry the Draft's base locale
 * but not `locale`. The field catalog's per-field translation-status list
 * (design.md decision 4). Applies `localeGapCount`'s own two rules: an entry
 * with no base-locale value does not count (`runValidation` already reports
 * it), and the base locale never counts against itself.
 *
 * Does NOT recurse into `field.fields`: a group's children carry their own
 * rail entry and their own translation-status list (`flattenRailFields`
 * already gives each of them a row of its own), and recursing here would
 * count a child's gap twice — once on the child's own row, once folded into
 * the parent's. */
export function fieldLocaleGaps(field: DraftField, locale: string, baseLocale: string): number {
  if (locale === baseLocale) return 0;

  let count = 0;
  const check = (entry: DraftLocalizedText) => {
    if (entry?.[baseLocale] && !entry?.[locale]) count++;
  };
  check(field.label);
  check(field.description);
  for (const option of field.options ?? []) check(option.label);
  return count;
}

/** Draft field seed for a freshly-created step/field/option: an empty
 * LocalizedText entry under the currently selected content locale, not a
 * bare string — a new entity must satisfy the base-locale invariant as soon
 * as its baseLocale entry is filled in, and this seeds the locale the
 * author is actually looking at. */
export function seedLocalizedText(contentLocale: string): DraftField["label"] {
  return { [contentLocale]: "" };
}
