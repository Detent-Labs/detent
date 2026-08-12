## 1. Catalog scaffolding

- [x] 1.1 Add `packages/web/src/i18n/catalogs/reporting.ts`: an `en` map, a
  `de` map, a `CatalogKey` type derived from `en`, and a `reportingCatalog`
  export, shaped like `catalogs/app.ts`
- [x] 1.2 Add `packages/web/src/i18n/catalogs/admin.ts`, the same shape
- [x] 1.3 Register both in `BUILTIN_CATALOGS` and `OVERRIDABLE_AREAS` in
  `catalogs/index.ts`, and rewrite the comment that says both are absent on
  purpose
- [x] 1.4 Add `packages/web/src/areas/reporting/catalog.ts` exporting
  `t(locale, key)` over `resolveOverride("reporting", locale, key)`, plus the
  `{n}` substitution helper the count sentence needs
- [x] 1.5 Add `packages/web/src/areas/admin/catalog.ts`, the same shape,
  without the substitution helper unless a key needs it

## 2. Locale reaches the screens

- [x] 2.1 Give each of the four reporting screens a `locale: UiLocale` prop,
  and pass it from `reporting/root.tsx`
- [x] 2.2 Give each admin screen that lacks one a `locale: UiLocale` prop, and
  pass it from `admin/root.tsx`. `DataListScreen` has one already
- [x] 2.3 `bun run typecheck` passes with the props threaded and no call site
  yet rewritten

## 3. Reporting area

- [x] 3.1 `screens/reportingLogic.ts`: give `formatDuration` a `locale`
  parameter, read its unit suffixes from the catalog, and format the number
  through `Intl.NumberFormat` so German prints `4,5`
- [x] 3.2 `screens/reportingLogic.ts`: give `formatPercent` a `locale`
  parameter and format through `Intl.NumberFormat` with `style: "percent"`
- [x] 3.3 `screens/reportingLogic.ts`: add `describeError(error, locale)`
  mapping each `ClientError.type` to a catalog key, mirroring
  `areas/admin/errors.ts`. Leave `describeCaughtError`'s return type as it is
- [x] 3.4 `components.tsx`: `ErrorNote` takes the locale and prints
  `describeError` rather than the shared `errorText`
- [x] 3.5 `components.tsx`: route `DateRangeControl`'s two labels and
  `EmptyState` through `t`; make `SkippedNote`'s excluded-count sentence one
  key per grammatical form with `{n}` substituted
- [x] 3.6 `root.tsx`: route the three `VIEWS` labels, the `Processes` nav
  button and the invalid-range message through `t`
- [x] 3.7 `screens/ProcessPickerScreen.tsx` through `t`
- [x] 3.8 `screens/CycleTimeScreen.tsx` through `t`
- [x] 3.9 `screens/BottleneckScreen.tsx` through `t`
- [x] 3.10 `screens/SlaScreen.tsx` through `t`
- [x] 3.11 Read every changed reporting file once more. Confirm that it holds
  no prose literal, and that no machine value entered the catalog

## 4. Admin area

- [x] 4.1 `errors.ts`: give `describeError` and `describeCaughtError` a
  `locale` parameter, and return `t(locale, "error.<type>")` from every switch
  arm
- [x] 4.2 `root.tsx`: route the `TABS` labels and the `MissingRole` empty
  state through `t`, keeping the role name itself untranslated
- [x] 4.3 `screens/InstancesScreen.tsx` and `instancesLogic.ts` through `t`
- [x] 4.4 `screens/InstanceScreen.tsx` through `t`, including the redaction
  stamp and the timeline meta line, with ids, hashes and versions untranslated
- [x] 4.5 `screens/OutboxScreen.tsx` through `t`, leaving the outbox status
  token as the engine stores it
- [x] 4.6 `screens/TimersScreen.tsx` and `timersLogic.ts` through `t`
- [x] 4.7 `screens/UsersScreen.tsx` and `usersLogic.ts` through `t`, leaving
  every `system:*` role name untranslated
- [x] 4.8 `screens/MigrationsScreen.tsx` and `migrationsLogic.ts` through `t`
- [x] 4.9 `screens/DataListsScreen.tsx`, `dataListsLogic.ts` and
  `screens/DataListScreen.tsx` through `t`, leaving the data list key
  untranslated
- [x] 4.10 `screens/UiStringsScreen.tsx` through `t`, leaving the area name,
  the locale code and every listed catalog key untranslated
- [x] 4.11 Replace every bare `new Date(x).toLocaleString()` in the area with
  a call that passes the chosen locale
- [x] 4.12 Read every changed admin file once more. Confirm that it holds no
  prose literal, and that no machine value entered the catalog

## 5. Tests

- [x] 5.1 Add a catalog test asserting the `en` and `de` key sets match in
  both directions, for the admin and the reporting catalog
- [x] 5.2 Change `test/admin-uiStringsLogic.test.ts`: `localesOf("admin")` and
  `localesOf("reporting")` now answer `["de", "en"]`. Drop the comment that
  names this change as pending
- [x] 5.3 Change `test/reporting-reportingLogic.test.ts` for the new
  `formatDuration` and `formatPercent` signatures. Keep the English
  expectations, and add a German case asserting the comma separator and a
  translated unit
- [x] 5.4 Add a test that the excluded-count sentence answers a different
  string for one instance and for two, in both locales
- [x] 5.5 Add a test that `describeError` in the reporting area answers a
  catalog value for each `ClientError.type` it maps

## 6. Documentation

- [x] 6.1 Add a `docs/current-state.md` section for this retrofit, naming the
  two new catalogs, the two new area `catalog.ts` wrappers and every changed
  signature
- [x] 6.2 Add a `docs/browser-checks.md` entry: walk both areas in German at a
  narrow window. Check the instances, outbox, timers and users tables for a
  clipped column, and every screen for a leftover English word
- [x] 6.3 Rewrite the trailing paragraph of `ROADMAP.md` stage 13, lines 281
  to 287. It calls the retrofit the next step. Record it as landed instead,
  and name this change

## 7. Verification

- [x] 7.1 `bun run typecheck`
- [x] 7.2 `bun run build`
- [x] 7.3 Full `bun test` with `DATABASE_URL` set. Report the pass, skip and
  fail counts
- [x] 7.4 The antislop linter over every Markdown file this change touched
- [x] 7.5 `git diff --check`, and `git ls-files --eol` for a CRLF worktree
  file
- [x] 7.6 Run the browser check from 6.2 against a real browser, in both
  locales
