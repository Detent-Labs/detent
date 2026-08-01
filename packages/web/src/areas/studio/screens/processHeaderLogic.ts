import { resolveAddLocaleAttempt } from "../draft/localized-text.js";

/** What one keystroke in the process header's base-locale control produces:
 * the value to write into the Draft, and the content locale to edit in
 * afterwards. Both are always present, so the caller applies them
 * unconditionally and owns no branch of its own. */
export interface BaseLocaleChange {
  baseLocale: string;
  contentLocale: string;
}

/**
 * The base-locale control's whole decision, extracted from `ProcessHeader` so
 * the wiring is testable without a DOM (studio-app spec, "Studio's testable
 * logic is extracted from its components"; `packages/web` renders through
 * `renderToStaticMarkup`, which fires no event).
 *
 * The typed value is always written through, unvalidated: live validation
 * reports a malformed locale code the same way it reports every other
 * malformed authored value, and `resolveLoc` returns the process entity for a
 * `["baseLocale"]` path so the header's own IssueList renders it.
 *
 * A well-formed value additionally becomes the edited content locale. Without
 * that, the control would open a trap: `LocalizedTextInput` writes
 * `value[contentLocale]` on every keystroke and `seedLocalizedText` gives each
 * new step and field its label under `contentLocale`, so an author who
 * declares `de` and keeps working would write `en` entries and watch every new
 * entity report a missing `de` entry while visibly holding text.
 *
 * A value that does not parse leaves the content locale where it is, via the
 * same `resolveAddLocaleAttempt` gate the switcher's Add button runs. A
 * part-typed "d" would otherwise become a real locale key as soon as the
 * author typed one character into any text field, and `collectUsedLocales`
 * would then offer "d" in the switcher for good.
 */
export function resolveBaseLocaleChange(typed: string, currentContentLocale: string): BaseLocaleChange {
  const attempt = resolveAddLocaleAttempt(typed);
  return { baseLocale: typed, contentLocale: attempt.ok ? attempt.locale : currentContentLocale };
}
