## Why

`packages/editor/src/i18n/` implements a full locale-provider architecture —
React context, a `useLocale`/`useT` hook pair, `localStorage` persistence,
per-locale catalog resolution with base-locale fallback, and a switcher
component — for a locale space of exactly one: `SUPPORTED_LOCALES` has held
`["en"]` since this was built, with no second locale planned. This is a
ponytail-audit finding (#2): the priciest cut in the audit by call-site
count (17 files, ~22 call sites), all of it indirection with no present
payoff. Collapsing it to a plain `t(key) = en[key]` lookup removes the
context/hook/persistence/switcher machinery while every UI-chrome string
still renders exactly the same text it does today.

## What Changes

- `packages/editor/src/i18n/catalog.ts`: keep the `en` catalog object and
  `TranslationKey` (`keyof typeof en`); drop `LocaleCode`, `SUPPORTED_LOCALES`,
  the per-locale `catalogs` map, `resolveTranslation`, and
  `resolveInitialLocale`. Add a plain `export function t(key: TranslationKey):
  string { return en[key]; }`.
- **Delete** `packages/editor/src/i18n/store.tsx` (`LocaleContext`,
  `LocaleProvider`, `useLocale`, `useT`, `localStorage` persistence).
- **Delete** `packages/editor/src/i18n/LocaleSwitcher.tsx`.
- `App.tsx`: remove the `LocaleProvider`/`useT`/`LocaleSwitcher` imports;
  remove the `<LocaleProvider>` wrapper around the whole app tree (render
  children directly); remove the `<LocaleSwitcher />` element; in
  `ProcessHeader()` and `Editor()`, replace `const t = useT();` with a
  module-level `import { t } from "./i18n/catalog"` — every `t("...")` call
  site in JSX is otherwise unchanged.
- The other 16 files importing `useT` (`ActionListEditor.tsx`,
  `graph/GraphView.tsx`, `DataSourcesPanel.tsx`, `RegistryPanel.tsx`,
  `StepsPanel.tsx`, `ContractPanel.tsx`, `PathsPanel.tsx`,
  `FieldCatalogPanel.tsx`, `ViewEditor.tsx`, `FileToolbar.tsx`,
  `TimersPanel.tsx`, `SubprocessSpecEditor.tsx`,
  `panels/shared/ContentLocaleSwitcher.tsx`, `panels/shared/ExpressionInput.tsx`,
  `panels/shared/PluginEnvelopeEditor.tsx`, `panels/shared/IssueList.tsx`):
  same mechanical change — import `t` from the catalog instead of `useT` from
  the store, delete the `const t = useT();` line. No other line changes.
- `FileToolbar.tsx`'s `describeError(e, fallback)` and `draft/file-io.ts`'s
  file-picker description parameters **keep their current calling
  convention** (caller resolves via `t()` and passes the string in) even
  though the reason it existed — non-component code cannot call a React hook
  — no longer applies once `t` is a plain function. Deliberately not
  simplified further here; see design.md.
- `CLAUDE.md`'s editor paragraph: rewrite the sentence describing the
  hand-rolled locale-state provider + switcher/plumbing "built for more" to
  describe the collapsed, fixed-English lookup instead. The following
  sentence about content-locale independence is unrelated (a separate
  system: `ProcessBody`/`Step`/`FieldDef` `LocalizedText` content
  localization) and stays unchanged.
- Test files updated to match (see Impact).
- **BREAKING** (internal API, not user-facing): `useLocale`, `useT`,
  `LocaleProvider`, `LocaleSwitcher`, `resolveTranslation`,
  `resolveInitialLocale`, `LocaleCode`, `SUPPORTED_LOCALES` are all removed.
  No consumer outside this package exists.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `editor-i18n`: most of this capability's requirements described a
  multi-locale-capable architecture (manual switcher, persistence,
  base-locale fallback, locale state exposed independent of the catalog)
  that never had a second locale to serve. This change removes those
  requirements and keeps only that UI-chrome text renders through a shared
  catalog lookup (now fixed to English, not locale-aware) and that
  engine-sourced validation messages are never routed through it. See
  design.md for the full requirement-by-requirement disposition.

## Impact

- `packages/editor/src/i18n/`: `store.tsx` and `LocaleSwitcher.tsx` deleted;
  `catalog.ts` shrunk to the catalog object, `TranslationKey`, and `t()`.
- `packages/editor/src/App.tsx` + 16 other files: `useT` import replaced
  with a plain `t` import; every `const t = useT();` line deleted.
- `packages/editor/test/i18n.test.ts`: `resolveTranslation`/
  `resolveInitialLocale` tests replaced with direct `t()` assertions against
  the real catalog; the unrelated `describeError` tests untouched.
- `packages/editor/test/i18n-rendering.test.tsx`: the `useT`+`LocaleProvider`,
  `useLocale`, and `LocaleSwitcher` describe blocks deleted (their subjects
  no longer exist); the `NotCheckedBadge` block survives, simplified (no
  provider wrapper needed).
- `packages/editor/test/content-locale-rendering.test.tsx`: `withProviders`
  drops its `<LocaleProvider>` wrap; the "content locale is independent of
  the UI-chrome locale" block is reduced to a plain regression guard (UI-chrome
  text still renders in English regardless of the Draft's `baseLocale`) since
  there are no longer two contexts to prove independent.
- `packages/editor/test/graph-view-rendering.test.tsx`: drops its
  `LocaleProvider` import and wrapper around `<GraphView>`.
- `openspec/specs/editor-i18n/spec.md`: four of six requirements removed,
  one modified, one left untouched (see design.md).
- No `src/` (engine) changes, no schema changes. Independent of the already
  archived `remove-assignment-registry` change.
