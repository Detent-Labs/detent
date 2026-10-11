# Tasks

Read `design.md` first. It holds the decisions D1 to D8 and the design brief.
The delta spec holds the scenarios. Every group lands its own tests.

## 1. The newest-answer gate

- [x] 1.1 Add `packages/web/src/shell/latestGate.ts` with `createLatestGate()`.
      `next()` starts a generation and returns its `isCurrent()`. `current()`
      returns the running generation's `isCurrent()`. Verify:
      `packages/web/test/shell-latestGate.test.ts` shows an older generation
      turns stale after `next()`, and `current()` never turns one stale.
- [x] 1.2 Rewrite `usePagedList` on the gate. `load` and `reset` call `next()`,
      and `loadMore` calls `current()`. Only a current request writes `items`,
      `cursor` and `error`, and clears `loading`. `reset` also sets `loading`
      to false. `fetchPage` receives `isCurrent` as a second argument. Hold the
      gate in `useState(createLatestGate)[0]`, so `load`, `loadMore` and `reset`
      keep their identities. Verify: `bun run typecheck` passes, and the seven
      existing callers compile unchanged. In the browser walk, a `reset` during
      "Load more" re-enables the button.
- [x] 1.3 Guard the screens' own effects. `OutboxScreen` sets its counts only
      while `isCurrent()` holds. `InstancesScreen` and `OutboxScreen` call
      `fail(err)` only while it holds. Verify: the code shows no
      `setCounts` or `fail` call outside the guard, and the browser walk in
      group 7 passes.

## 2. The focus throttle

- [x] 2.1 Add `packages/web/src/areas/admin/refreshLogic.ts` with
      `focusRefetchDue(lastAt, now, minMs)` and the constant
      `DIRECTORY_FOCUS_INTERVAL_MS` of 30000. Verify:
      `packages/web/test/admin-refreshLogic.test.ts` covers 0 ms, 29999 ms,
      30000 ms and a minimum of 0.
- [x] 2.2 Give `useRefresh` the option `minFocusIntervalMs`. A ref holds the
      time of the last request. Opening the screen, `refresh()` and a focus
      refetch stamp it. `refresh()` never consults the interval. Verify:
      `bun run typecheck` passes, and the other callers pass no option.
- [x] 2.3 Pass `DIRECTORY_FOCUS_INTERVAL_MS` from `UsersScreen` and
      `GroupsScreen`. Verify: `git grep -n minFocusIntervalMs` lists exactly
      those two screens and `useRefresh.ts`.

## 3. The Migrations screen

- [ ] 3.1 Add `useRefresh` and the Refresh button to `MigrationsScreen`. Use
      the existing `common.refresh` key. Verify: the button renders in both
      locales on the production build.
- [ ] 3.2 Move the reset of the picks into an effect keyed on `processId`. Key
      the process fetch and the version fetch on `reloadToken` as well. Give
      both a `cancelled` flag. A cancelled effect skips its setter and `fail`.
      Verify: a refetch keeps the picked process,
      `fromVersion` and `toVersion`, and a late answer for process A never
      fills the selects of process B.

## 4. The data-list editor keeps its input

- [ ] 4.1 Add `areas/admin/screens/serverCopy.ts` with `absorbServerCopy` and
      `serverCopyChanged`. Add `sameDataList` to `dataListsLogic.ts`. Verify:
      `packages/web/test/admin-serverCopy.test.ts` covers first load, a clean
      refetch, a dirty refetch and a forced reseed. The `sameDataList` cases
      cover a changed value, a changed column, a reordered key and a changed
      `usedBy`, which must not count.
- [ ] 4.2 Add the four catalog keys in EN and DE in
      `packages/web/src/i18n/catalogs/admin.ts`. Verify: the existing catalog
      parity test passes with the new keys.
- [ ] 4.3 Add `areas/admin/ServerCopyNote.tsx`: an always-mounted
      `role="status"` region and the Warning Callout from `DESIGN.md`. The
      button takes the `btn btn-secondary` classes. Verify: a
      `renderToStaticMarkup` test shows the region with no callout when
      `message` is unset, and the callout and the button when it is set.
- [ ] 4.4 Wire `DataListScreen`. Hold `latest`, `baseline` and a dirty ref
      with its state. `load(reseed)` uses a gate and `absorbServerCopy`.
      `save()` awaits `load(true)` in place of `refresh()`. Discard calls
      `load(true)`, and so does a change of `locale`. Render the note above the
      first control. Verify: on the production build, typed rows survive
      `window.dispatchEvent(new Event("focus"))`, the callout appears only
      after the list changed elsewhere, and a language switch refills the rows.

## 5. The UI-strings editor keeps its input

- [ ] 5.1 Add `sameOverrides(a, b, area, locale)` to `uiStringsLogic.ts`.
      Verify: `packages/web/test/admin-uiStringsLogic.test.ts` covers an equal
      slice, a changed key, an added key, a removed key and a change in another
      area, which must not count.
- [ ] 5.2 Wire `UiStringsScreen` the same way. The rows read `latest`. The
      dirty flag derives from `pendingWrites(rows, drafts).length > 0`.
      `save()` clears `drafts` and awaits `load(true)`. Render the note above
      the table. Verify: on the production build, typed overrides survive a
      `focus` event, a key without a draft follows the server, and a save
      empties the unsaved count.

## 6. The browser checks

- [ ] 6.1 Add `e2e/admin-edits.e2e.ts` with two tests. The first opens
      `/admin/ui-strings`, types into the first override input, dispatches
      `focus` on the window, and asserts the input keeps the text. The second
      covers F-18: on `/admin/users`, a `focus` event 1 second after the load
      sends no directory request, and the Refresh button sends one. Name the
      defect record `openspec/changes/archive/2026-10-10-audit-record/AUDIT.md`
      at line 173 in the file header. Verify: `bun run typecheck` and
      `bun run lint` cover the file, and the CI smoke job passes both tests.
      The devcontainer has no Playwright browser, so `bun run e2e` cannot run
      there.
- [ ] 6.2 Add the data-list focus walk to `docs/browser-checks.md`, with the
      `Source:` line the other entries carry. Cover the kept input, the callout
      in EN and DE, the discard button and the Save path. Verify: the entry
      names a pass condition for each step.

## 7. The index and the walk

- [ ] 7.1 Delete the `keep-admin-edits-on-refresh` entry from the audit index
      in `docs/decisions.md`. Verify: `git grep -n keep-admin-edits-on-refresh
      docs/decisions.md` finds nothing.
- [ ] 7.2 Run the browser walk on the production build. Cover F-1 on both
      screens, F-7 with a delayed first answer (`playwright-cli route`), F-17
      and F-18. Run `/impeccable critique` and `/impeccable audit` against
      `/admin/data-lists/<key>`. Verify: the run record prints each step's
      result.

## 8. Verification

- [ ] 8.1 Run `bun run lint`, then `bun run typecheck`, then `bun run build`, then the full `bun test` with `DATABASE_URL` set. Verify: all four exit 0 with 0 failures and a skip count at the floor.
- [ ] 8.2 Run the antislop linter on every Markdown file the change touched. Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` exits 0.
- [ ] 8.3 Run the whitespace gate. Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` exits 0.
