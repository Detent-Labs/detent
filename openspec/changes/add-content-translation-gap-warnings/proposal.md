## Why

An author translates a process into a second locale. That author has no way
to find which `LocalizedText` entries the locale has not reached yet. The
only option today is reading every panel by hand.
`ContentLocaleSwitcher`, `LocalizedTextInput`, and `collectUsedLocales`
already exist. Only the reverse direction, which entries are missing, is
unbuilt.

`ROADMAP.md` stage 13a raised this and deferred it for a committed trigger.
The design at
`docs/superpowers/specs/2026-08-05-content-translation-ui-design.md`,
already brainstormed and approved, is that trigger.

## What Changes

- Add `localeGapCount(draft, locale)` and `missingTranslationWarning(entry,
  locale, baseLocale)` to
  `packages/web/src/areas/studio/draft/localized-text.ts`. Both share a new
  `forEachLocalizedEntry` walk with the existing `collectUsedLocales`.
- `ContentLocaleSwitcher` shows a "(N missing)" suffix on each `<option>`
  with a translation gap.
- Five `LocalizedTextInput` render sites (process label, step
  label/description, field label/description, option label) each render
  `missingTranslationWarning(...)` inline. This follows the existing
  `assignmentWarning`/`unknownListKeyWarning` non-blocking-warning pattern.
  It stays outside `EditorIssue`/`IssueList`, since a missing translation
  never fails publish.
- Client-side only. No schema, storage, or API change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the studio area gains a per-locale translation-gap warning.
  It shows next to `ContentLocaleSwitcher` and next to each
  `LocalizedTextInput` render site. It uses the same non-blocking-warning
  shape the area already uses for the assignment and `db.list`-key
  warnings.

## Impact

- `packages/web/src/areas/studio/draft/localized-text.ts`: two new exported
  functions plus one internal shared walk.
- `packages/web/src/areas/studio/panels/shared/ContentLocaleSwitcher.tsx`:
  per-option gap count.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`,
  `panels/StepsPanel.tsx`, `panels/FieldCatalogPanel.tsx`: one warning
  render each, at an existing `LocalizedTextInput` call site.
- No `src/` (engine) change. No new dependency.
