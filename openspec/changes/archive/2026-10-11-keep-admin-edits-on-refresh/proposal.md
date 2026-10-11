# Proposal

## Why

An operator on `/admin/data-lists/products` types three value rows and
renames `unit_price`, then Alt-Tabs to a spreadsheet. On return the window's
`focus` event refetches, and `load()` rebuilds every input from the server
copy. The typed rows are gone with no message. `/admin/ui-strings` does the
same through `setDrafts({})`. The `admin-app` spec requires the focus
refetch, but not that it overwrite unsaved input. The sibling screens
(`UsersScreen`, `GroupsScreen`) already keep their drafts apart from the
refetch.

Three smaller defects sit on the same refresh mechanism. The list screens
keep whichever answer arrives last, so a slow answer for `proc_expens` can
replace the answer for `proc_expense`. The Migrations screen has neither a
refresh control nor a focus refetch, which the spec requires of every screen.
The Users and Groups screens reload the whole directory on every focus: 25
sequential requests at 5,000 accounts.

## What Changes

- The data-list editor and the UI-strings editor keep unsaved input across a
  refetch. A refetch updates only the server snapshot. The screen fills its
  inputs on the first load, after its own save, and when the operator
  discards.
- A warning callout appears when the server copy differs from the copy the
  edits started from. It offers the button "Discard my edits and load the
  server copy". The callout stays absent when nothing changed. English and
  German text, one sentence pair per screen.
- `usePagedList` accepts only the newest answer. The same rule covers the
  Migrations version list. It also covers the Outbox pill counts and the
  screens' error reports, which today escape the hook.
- The Migrations screen gets `useRefresh` and the explicit refresh control.
  Its process list and version list refetch on refresh and on focus, and the
  operator's version picks survive the refetch.
- `useRefresh` takes an option for a minimum interval between focus
  refetches. `/admin/users` and `/admin/groups` set 30 seconds. The explicit
  Refresh button is never throttled. No other screen sets the option.
- A new smoke flow, `e2e/admin-edits.e2e.ts`, covers the UI-strings input and
  the directory throttle. The browser check list gains the focus-switch walk
  for the data-list editor.

No debounce on the filter inputs. The newest-answer rule alone fixes the
stale list. A debounce would only cut request volume.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

<!-- antislop: allow passive-voice trailing-negation - the quoted text is the live requirement's name -->
- `admin-app`: the requirement "Data is refreshed on demand, not pushed" gains
  a throttle exception for the directory screens. It also gains a Migrations
  scenario. Three requirements join it. One keeps unsaved input through a
  refetch. One names a changed server copy. One shows only the newest answer
  of a list.

## Impact

- `packages/web/src/areas/admin/useRefresh.ts`,
  `packages/web/src/shell/usePagedList.ts`.
- New modules: `packages/web/src/shell/latestGate.ts`,
  `packages/web/src/areas/admin/refreshLogic.ts`,
  `packages/web/src/areas/admin/screens/serverCopy.ts` and
  `packages/web/src/areas/admin/ServerCopyNote.tsx`.
- `packages/web/src/areas/admin/screens/`: `DataListScreen.tsx`,
  `UiStringsScreen.tsx`, `MigrationsScreen.tsx`, `InstancesScreen.tsx`,
  `OutboxScreen.tsx`, `UsersScreen.tsx`, `GroupsScreen.tsx`, and the pure
  modules `dataListsLogic.ts` and `uiStringsLogic.ts`.
- `packages/web/src/i18n/catalogs/admin.ts` (EN and DE).
- `packages/web/test/`: logic tests for the new pure functions, and a
  static-markup test of the callout.
- `e2e/admin-edits.e2e.ts`.
- The flow count in `README.md`, `docs/current-state.md`,
  `playwright.config.ts` and `scripts/e2e.ts`: four becomes five.
- `docs/browser-checks.md`, `docs/decisions.md` (audit index entry).
- No engine, HTTP or definition contract change.
