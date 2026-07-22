## Why

The editor's UI chrome (panel titles, buttons, legends, badges) is hardcoded
English text with no locale infrastructure. The team wants the editor
usable in multiple languages, and wants the locale-state shape to be
reusable by a later change that localizes authored process content
(`label`/`description` in the Draft/contract), without having to rework it.

## What Changes

- Add a locale-state provider in `packages/editor`: current `locale`,
  `setLocale`, default `en`, persisted in `localStorage`. Kept
  catalog-agnostic (a plain value + setter) so a later change can consume
  `locale` directly for authored-content localization without depending on
  the UI-string catalog machinery.
- Add a minimal message-catalog lookup (`t(key)`) over per-locale JSON
  catalogs, `en` as the base locale. No new dependency (no i18next/Lingui) —
  the current string count doesn't justify the machinery. The lookup itself
  is a plain function (`resolveTranslation(locale, key)`), with `useT()` as
  a thin hook wrapper — module-level code that isn't a component (e.g.
  `draft/file-io.ts`'s file-picker type descriptions,
  `FileToolbar.tsx`'s `describeError` fallback) cannot call a hook, so it
  receives its translated string as a parameter, resolved by the component
  that calls it.
- Add a manual locale switcher control in the editor UI (no browser-language
  auto-detection in this change). **This change ships exactly one
  supported locale (`en`)** — the switcher and underlying state are built
  so a later change can add a further locale as a pure content addition (a
  new catalog file + a `LocaleCode` entry), with no changes to the
  switcher, `useLocale`, or `useT`. Until a second locale exists, the
  switcher has one selectable option.
- Replace hardcoded UI-chrome strings across the editor's panels, shared
  components, and `App.tsx`/`GraphView.tsx` with `t()` lookups.
- Missing-key behavior: a key absent from a non-base locale catalog falls
  back to the `en` entry.
- **Explicitly out of scope**: validation/issue messages surfaced via
  `EditorIssue.message` (sourced from the engine's Zod refinements,
  `cel/check.ts`, `registry-check.ts`, `compile.ts::validateDurations`)
  stay English-only. They cross the engine/editor package boundary as
  opaque prose with no issue codes to key a translation off of; localizing
  them is a separate, larger change touching the engine. Recorded here as a
  deliberate scope boundary, not an oversight.
- **Explicitly out of scope**: localizing authored process content
  (`label`/`description` fields an author enters into the Draft) — a later
  change.

## Capabilities

### New Capabilities
- `editor-i18n`: locale state (current locale, switcher, persistence,
  default-to-`en`), the UI-string catalog and `t()` lookup, and the
  fallback-to-base-locale rule for missing keys.

### Modified Capabilities
(none — existing editor capability specs describe panel *behavior*, not
literal display text, so their requirements are unaffected by localizing
the strings they render)

## Impact

- **Affected code**: `packages/editor/src/**` only (new locale
  context/provider, new catalog files, panel components updated to call
  `t()` instead of inline literals, a new switcher UI element). No changes
  to `src/` (engine) or `definition.ts`.
- **No new dependencies**: hand-rolled context + typed lookup, not
  react-i18next/Lingui.
- **No engine/contract changes**: validation issue messages and the
  process-content contract are both untouched by this change.
