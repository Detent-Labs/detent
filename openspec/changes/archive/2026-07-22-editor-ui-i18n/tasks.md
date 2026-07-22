## 1. Locale state

- [x] 1.1 Define `LocaleCode` (`"en"` only for now; an extensible
      union/array, not a hardcoded two-way toggle) in
      `packages/editor/src/i18n/catalog.ts`.
- [x] 1.2 Implement `LocaleProvider` (React Context) in
      `packages/editor/src/i18n/store.tsx` exposing `locale` and
      `setLocale`, independent of any catalog/lookup code — mirrors the
      existing `draft/store.tsx` shape.
- [x] 1.3 Implement `resolveInitialLocale(stored, supported)` as a plain
      function in `catalog.ts`: `en` when `stored` is absent or not in
      `supported`. `store.tsx` calls it against `localStorage` (key
      `editor.locale`) on init and calls it again inside `setLocale`
      before persisting.
- [x] 1.4 Export a standalone `useLocale()` hook from `store.tsx` reading
      the context, so later code can depend on it without importing the
      string catalog.
- [x] 1.5 Mount `LocaleProvider` at the app root (`App.tsx`).

## 2. UI-string catalog and lookup

- [x] 2.1 Create the base `en` catalog (flat `Record<string, string>`) in
      `packages/editor/src/i18n/catalog.ts`.
- [x] 2.2 Derive `TranslationKey = keyof typeof en` so lookups are checked
      against the base catalog at compile time.
- [x] 2.3 Implement `resolveTranslation(locale, key)` as a plain function
      in `catalog.ts`: `catalogs[locale]?.[key] ?? catalogs.en[key]`
      (fallback-to-base-locale rule). No React dependency.
- [x] 2.4 Implement `useT()` in `store.tsx` as a thin wrapper: reads
      `locale` via `useLocale()`, calls `resolveTranslation(locale, key)`.
- [x] 2.5 Type non-base catalogs as `Partial<Record<TranslationKey,
      string>>` so an incomplete translation set still compiles (no
      non-`en` catalog exists yet — this is for the structure to hold when
      one is added).

## 3. Locale switcher

- [x] 3.1 Add a manual locale-switcher control (e.g. alongside
      `FileToolbar`) that lists every entry of `LocaleCode` (currently just
      `en`) and calls `setLocale()` on selection. Adding a locale later
      must require touching only `catalog.ts`, never this component.

## 4. Migrate hardcoded UI-chrome strings to `t()`

- [x] 4.1 `App.tsx` — "Workflow Editor" (h1), "Process" (legend), the
      `key`/`label`/`description` field labels, the draft-incomplete
      notice, "Graph" (h3).
- [x] 4.2 `graph/GraphView.tsx` — the " (initial)"/" (terminal)" node-label
      suffixes. (Issue tooltips built from `EditorIssue.message` stay
      untranslated — out of scope.)
- [x] 4.3 `FileToolbar.tsx`
- [x] 4.4 `FieldCatalogPanel.tsx`
- [x] 4.5 `DataSourcesPanel.tsx`
- [x] 4.6 `StepsPanel.tsx`
- [x] 4.7 `PathsPanel.tsx`
- [x] 4.8 `TimersPanel.tsx`
- [x] 4.9 `ActionListEditor.tsx`
- [x] 4.10 `ContractPanel.tsx`
- [x] 4.11 `ViewEditor.tsx`
- [x] 4.12 `SubprocessSpecEditor.tsx`
- [x] 4.13 `RegistryPanel.tsx`
- [x] 4.14 `panels/shared/IssueList.tsx` — localize the `NotCheckedBadge`
      label only; `EditorIssue.message` itself stays untranslated (out of
      scope per design.md).
- [x] 4.15 `panels/shared/ExpressionInput.tsx` — the "CEL expression"
      default placeholder.
- [x] 4.16 `panels/shared/PluginEnvelopeEditor.tsx` — the "plugin type
      identifier" default placeholder.
- [x] 4.17 `draft/file-io.ts` — change `DRAFT_TYPES`/`EXPORT_TYPES` from
      module-level constants into functions taking the description
      string(s) as a parameter; thread through `saveDraft`/
      `loadDraftViaPicker`/`loadDraftFromFile`/`exportDraft` so
      `FileToolbar` (which has `useT()`) supplies them. No i18n import
      added to `file-io.ts`.
- [x] 4.18 `FileToolbar.tsx::describeError` — change its signature to
      `describeError(e, fallback: string)`, taking the translated
      `"operation failed"` fallback as a parameter from the caller; a real
      `Error`/`DOMException`'s own `.message` still passes through
      unchanged (platform text, same treatment as engine messages).

## 5. Tests

- [x] 5.1 `bun:test` for `resolveTranslation()`'s fallback-to-`en`
      behavior for a key missing from a non-base catalog (pure function,
      no React — matches the existing `packages/editor/test/*.test.ts`
      convention; no `@testing-library/react`/`jsdom` needed).
- [x] 5.2 `bun:test` for `resolveInitialLocale()`: no stored value, an
      invalid stored value, and a valid stored value.
- [x] 5.3 `bun:test` for `FileToolbar::describeError()` (exported for direct
      testing): an aborted picker returns `null`, a real `Error`'s own
      `.message` passes through unchanged (ignoring the translated
      fallback), a non-`Error` throw returns the translated fallback.
- [x] 5.4 `bun:test` (render-based, via `react-dom/server`'s
      `renderToStaticMarkup` — no new dependency, no DOM needed) covering
      what the pure-function tests can't: `useT()` resolves catalog text
      through `LocaleProvider`, `useLocale()` is usable by a component that
      never imports the catalog, `LocaleSwitcher` renders exactly
      `SUPPORTED_LOCALES`'s entries, and `NotCheckedBadge` composes its
      label with the translated suffix. Closes the gap flagged in
      `/opsx:verify`'s SUGGESTION (previously manual-only).

## 6. Verification

- [x] 6.1 `bun run typecheck` (root + editor package) passes.
- [x] 6.2 Manual check in the running editor (`vite dev`): the switcher
      shows exactly one option (`en`), `IssueList` text stays English
      regardless, and a simulated file-I/O failure shows a translated
      fallback for a non-`Error` throw while a real `Error.message` still
      passes through unchanged.
