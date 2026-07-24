## 1. Catalog collapse

- [x] 1.1 In `packages/editor/src/i18n/catalog.ts`, keep the `en` object and `TranslationKey` (`keyof typeof en`); delete `LocaleCode`, `SUPPORTED_LOCALES`, the `catalogs` map, `resolveTranslation`, and `resolveInitialLocale`. Add `export function t(key: TranslationKey): string { return en[key]; }`.
- [x] 1.2 Delete `packages/editor/src/i18n/store.tsx`.
- [x] 1.3 Delete `packages/editor/src/i18n/LocaleSwitcher.tsx`.

## 2. App.tsx

- [x] 2.1 Remove the `LocaleProvider`/`useT` import from `./i18n/store` and the `LocaleSwitcher` import; add `import { t } from "./i18n/catalog"`.
- [x] 2.2 Remove the `<LocaleProvider>` wrapper in `App()` (render its children directly, unwrapped).
- [x] 2.3 Remove the `<LocaleSwitcher />` element from `Editor()`'s JSX.
- [x] 2.4 Delete the `const t = useT();` line from `ProcessHeader()` and from `Editor()` (both now use the module-level `t` import; every `t("...")` call site in JSX is otherwise unchanged).

## 3. Remaining 16 files

- [x] 3.1 In each of `ActionListEditor.tsx`, `graph/GraphView.tsx`, `DataSourcesPanel.tsx`, `RegistryPanel.tsx`, `StepsPanel.tsx`, `ContractPanel.tsx`, `PathsPanel.tsx`, `FieldCatalogPanel.tsx`, `ViewEditor.tsx`, `FileToolbar.tsx`, `TimersPanel.tsx`, `SubprocessSpecEditor.tsx`, `panels/shared/ContentLocaleSwitcher.tsx`, `panels/shared/ExpressionInput.tsx`, `panels/shared/PluginEnvelopeEditor.tsx`, `panels/shared/IssueList.tsx`: replace the `import { useT } from ".../i18n/store"` line with `import { t } from ".../i18n/catalog"` (matching each file's existing relative depth), and delete that file's `const t = useT();` line(s). No other line changes in any of these files.

## 4. Tests

- [x] 4.1 Rewrite `packages/editor/test/i18n.test.ts`: replace the `resolveTranslation`/`resolveInitialLocale` describe blocks with direct `t()` assertions against the real `en` catalog (e.g. `expect(t("app.title")).toBe("Workflow Editor")`); leave the unrelated `describeError` describe block untouched.
- [x] 4.2 Rewrite `packages/editor/test/i18n-rendering.test.tsx`: delete the `"useT() through LocaleProvider"`, `"useLocale() independent of the catalog"`, and `"LocaleSwitcher"` describe blocks; keep the `"NotCheckedBadge"` describe block, dropping its `<LocaleProvider>` wrapper (not needed once `t` is a plain function).
- [x] 4.3 Update `packages/editor/test/content-locale-rendering.test.tsx`: drop the `useT`/`LocaleSwitcher` imports and the `<LocaleProvider>` wrap in `withProviders`; reduce the `"content locale is independent of the UI-chrome locale"` describe block to a plain regression guard asserting UI-chrome text still renders in English regardless of the Draft's `baseLocale`, dropping the `LocaleSwitcher`-specific assertions.
- [x] 4.4 Update `packages/editor/test/graph-view-rendering.test.tsx`: drop the `LocaleProvider` import and its wrapper around `<GraphView>`.

## 5. Documentation

- [x] 5.1 Update `CLAUDE.md`'s editor paragraph: rewrite the sentence describing the hand-rolled locale-state provider + switcher/plumbing "built for more" to describe the collapsed, fixed-English `t(key)` lookup instead. Leave the following content-locale-independence sentence unchanged.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` inside the devcontainer and fix every compile error surfaced by the import/hook removal (the primary mechanism for finding a missed or half-updated file, given `noUnusedLocals`/`noUnusedParameters` are enabled).
- [x] 6.2 Run the full `bun test` suite inside the devcontainer with `DATABASE_URL` set (never a single-file rerun) and confirm 0 fail.
