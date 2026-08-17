## 1. Sequencing gate

- [x] 1.1 Confirm the archive holds `ponytail-web-small-cuts`
- [x] 1.2 Confirm the archive holds `ponytail-cleanup-fetch-hooks-and-imports`
- [x] 1.3 Confirm the archive holds `ponytail-cut-unreachable-code`
- [x] 1.4 Re-grep all three `401` forms; record any drift from 40, 16 and 1

## 2. The 401 rule (finding 13)

- [x] 2.1 Add `packages/web/src/shell/useFail.ts` with an exported `is401`
- [x] 2.2 Give the returned callback no dependency array; hold `onError` in a ref
- [x] 2.3 Add `packages/web/test/useFail.test.ts` covering both `is401` branches
- [x] 2.4 Add the refetch-loop check to `docs/browser-checks.md`
- [x] 2.5 Convert the nine admin screens; keep each `describeCaughtError` call verbatim
- [x] 2.6 Convert `StartedScreen.tsx`, `StartScreen.tsx` and `TasksScreen.tsx`
- [x] 2.7 Convert `ProcessesScreen.tsx`, all six sites including line 217
- [x] 2.8 Drop `TemplatesScreen.tsx`'s hand-written `fail` for the shared hook
- [x] 2.9 Convert `shell/ProfilePage.tsx`; keep its two distinct handlers separate
- [x] 2.10 Convert `DraftToolbar.tsx`, `EditScreen.tsx` and `MigrationPlanScreen.tsx`
- [x] 2.11 Convert `ToolsScreen.tsx` and `VersionsScreen.tsx`
- [x] 2.12 Drop each early-return `return` where no statement follows it
- [x] 2.13 Decide `TaskScreen.tsx:80` and `PlayerScreen.tsx:73`, per design Open Questions
- [x] 2.14 Grep all three forms; every remaining site is a decision 2.13 recorded

## 3. Catalogs (finding 14)

- [x] 3.1 Add `packages/web/src/i18n/makeCatalog.ts` taking area and catalog
- [x] 3.2 Keep the key a type parameter, so an unknown key stays a compile error
- [x] 3.3 Rewrite `areas/admin/catalog.ts` over `makeCatalog`; leave `tFill` alone
- [x] 3.4 Rewrite `areas/app/catalog.ts` and `areas/reporting/catalog.ts`
- [x] 3.5 Leave `tCount` in the reporting catalog alone
- [x] 3.6 Rewrite `shell/catalog.ts` over `makeCatalog`
- [x] 3.7 Leave `areas/studio/catalog.ts` alone; its `t` takes no locale
- [x] 3.8 Rename `TranslationKey` and `ShellKey` to `CatalogKey` across nine files
- [x] 3.9 Leave `i18n/catalogs/index.ts` alone; it is the documented chunking exception

## 4. API clients (finding 17)

- [x] 4.1 Rewrite `src/api/types.ts`'s header, per design decision 4
- [x] 4.2 Move `VersionSummary` there; re-export it from both area type files
- [x] 4.3 Move `InstanceRecordElement` and `InstanceRecordPage` the same way
- [x] 4.4 Run `bun run typecheck`; the tree is green before any wrapper moves
- [x] 4.5 Add `getJson<T>` to `src/api/client.ts`, from reporting's `get<T>`
- [x] 4.6 Move `getInstanceRecord`, `createInstance` and `submitPath` to `src/api/client.ts`
- [x] 4.7 Re-export those three from each area client that declared one
- [x] 4.8 Reduce every remaining GET wrapper in the four clients to one `getJson` call
- [x] 4.9 Leave `cancelInstance` and `listVersions` duplicated, per design decision 5
- [x] 4.10 Leave `listProcesses` and `getInstanceView` declared per area

## 5. The record describer (finding 33)

- [x] 5.1 Add `src/api/record.ts` with one `describeRecordElement` returning `{at, summary}`
- [x] 5.2 Delete the studio copy and its stale `packages/admin` comment
- [x] 5.3 Point `InstanceScreen.tsx` at it; it adds `detail` at the call site
- [x] 5.4 Move `studio-playerLogic.test.ts`'s import; keep its assertions

## 6. Audit correction

- [x] 6.1 Record findings 13, 14, 17 and 33 as resolved in `PONYTAIL-AUDIT.md`
- [x] 6.2 Correct finding 13's count there: 57 sites, three forms, not 40
- [x] 6.3 Move the `tFill` claim under "Checked, not flagged", with the measurement
- [x] 6.4 Move the `listProcesses` count and the exports-map claim there too
- [x] 6.5 Record why `cancelInstance` and `listVersions` stay duplicated
- [x] 6.6 Deviation: skipped `sh scripts/ponytail-ledgers.sh` (its rescan
      would overwrite this and every other 2026-08-16 change's hand-authored
      audit corrections); counts refreshed by hand instead, recorded in
      `PONYTAIL-AUDIT.md`

## 7. Verification

- [x] 7.1 Run `bun run typecheck`; report what it printed
- [x] 7.2 Run `bun run build`; report what it printed
- [x] 7.3 Run the full `bun test` with `DATABASE_URL` set; report passes and skips
- [x] 7.4 Run the antislop linter over every Markdown file this change touched
- [x] 7.5 Run `git diff --check` and `git ls-files --eol` over the changed files
- [x] 7.6 Drive a browser: load each area, force a 401, confirm the logout
- [x] 7.7 Run the `docs/browser-checks.md` refetch check task 2.4 added
