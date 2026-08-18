## Why

A ponytail (over-engineering) audit of `packages/web` found eight small
defects. The same 8-line error banner appears on thirteen screens. Six
screens repeat near-identical load/loadMore pairs. One screen repeats five
identical busy-state wrappers. A row/control dispatch layer renders five
fixed profile fields. A 26-arm error-mapping switch carries nineteen
byte-identical arms.

A set of CSS custom properties have no reference left anywhere. A
hand-rolled dropdown-dismiss effect duplicates what the platform now does
natively. A session field gets written and stored but nothing reads it.
None of the eight is a design decision under debate. Each is duplication or
dead weight with one smaller replacement. Fixing all eight now, in one
change, clears the debt before more screens copy the same patterns forward.

## What Changes

- Add a shared `<ErrorBanner error locale onRetry? retryDisabled? />` in
  `shell/`. `onRetry` and `retryDisabled` are both optional. The banner
  renders the retry button only when a call site passes `onRetry`. It
  replaces 13 duplicated call sites across the app and admin areas
  (`TasksScreen`, `StartScreen`, `StartedScreen`; `InstancesScreen`,
  `OutboxScreen`, `TimersScreen`, `UsersScreen`, `DataListsScreen`,
  `DataListScreen`, `UiStringsScreen`, `MigrationsScreen`, `InstanceScreen`
  x2). Twelve of the 13 pass `onRetry`. `MigrationsScreen`'s current banner
  has no retry button, because a migration run isn't re-fetchable. Its
  call site omits `onRetry` and keeps that no-retry banner.

  <!-- antislop: allow synonym-rotation -->

  The 11 call sites that currently disable their retry button while a
  reload is in flight pass `retryDisabled` too. That keeps an admin-area
  operator from firing overlapping retries, the same guard those sites
  have today.
- Add a `usePagedList(fetchPage)` hook in `shell/`. Replace the six
  load/loadMore pairs in `TasksScreen`, `StartedScreen`, `InstancesScreen`,
  `OutboxScreen`, `TimersScreen`, `InstanceScreen` with it.
- Replace `UsersScreen`'s five identical `setBusyId`/try/catch/finally
  wrappers with one `busy(id, fn)` helper local to that screen.
<!-- antislop: allow sentence-length -->
- Delete the row/control discriminant in `shell/profileFields.ts` and
  `ProfilePage.tsx`'s dispatch over it. Write the five profile rows as
  direct JSX instead. `profileFields.ts` keeps only the `editable`
  decision, plus its two label/value helpers named `ABSENT` and
  `rolesText`, and nothing else. That is the data-shaping seam the page
  still needs. design.md's Decisions section keeps the file for it,
  rather than deleting it outright.
- Collapse `api/client.ts`'s `parseErrorBody` 26-arm switch to a
  `PASSTHROUGH` set of the 19 identical `{type, message}` arms. Keep the
  three cases with distinct shapes (`validation`, the five
  `publish-validation` variants, `concurrency-conflict`) and a default as
  named arms.
- Delete the unused `--color-accent-2-*` ramp (9 tokens), 7 unused
  `--color-neutral-*` steps, 6 unused `--color-accent-*` steps, and
  `--shadow-sm` from `shell/tokens.css`.
- Replace `Chrome.tsx`'s hand-rolled outside-click/Escape dismissal
  (`useState` plus `useRef` plus a 13-line `document` listener effect).
  Use the native Popover API instead. Set `popover="auto"` on the menu.
  Set `popovertarget` on the trigger button. **BREAKING** (internal): this
  raises the product's minimum supported browser floor. The Popover API
  needs Chrome 114+, Safari 17+, or Firefox 125+. `vite.config.ts` gets an explicit `build.target` naming
  that floor. The build then stops silently down-leveling syntax for an
  older browser the runtime no longer targets.
- Delete `Session.expiresAt` (`shell/session.ts`): the field, its write at
  login, and its round-trip through storage. Change the `unified-shell`
  session requirement to match. The session still isn't enforced
  client-side. A `401` stays the sole session-ended signal. It just no
  longer carries a value nothing reads.

Every item above is a pure refactor except the Popover swap. Dismissal
mechanics differ from the hand-rolled version: light-dismiss timing, focus
return, and nested-control clicks all change underneath. The menu's visible
behavior stays the same at the level the current code implements, though
no requirement states it today. It opens on click. It closes on outside
click or Escape.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-shell`:
  - "One session carries the token, actor, roles and expiry": the session
    no longer records the token's expiry. The change drops the field from
    the stored shape rather than leaving it unread. The requirement's own
    "not enforced" behavior stays the same.
  - A new requirement states the account menu's open/dismiss mechanism. No
    requirement currently states it at all. The menu now
    dismisses through the Popover API's light-dismiss (outside pointerdown,
    Escape) rather than a hand-rolled listener. Its nested controls
    (language picker, area switcher, logout) stay operable; the menu must
    not close under them.

This change also touches `end-user-app` and `admin-app`: the screens listed
above live there. Neither spec gets a delta. Both specs carry requirements
that name these screens' error display, pagination, or busy-state behavior.
Each such requirement states an outcome: a shown error, a load-more
control, a disabled action. This change preserves every one of those
outcomes exactly. `design.md` records the check that confirmed this,
requirement by requirement.

## Impact

- **Code**: 13 screens across `packages/web/src/areas/{app,admin}`. A new
  `shell/ErrorBanner.tsx` and `shell/usePagedList.ts`. `shell/Chrome.tsx`.
  `shell/session.ts`. `shell/profileFields.ts` and `shell/ProfilePage.tsx`.
  `api/client.ts`. `shell/tokens.css`. `vite.config.ts`. Also
  `i18n/catalogs/shell.ts`, `shell/shell.css`, `areas/app/app.css`,
  `areas/admin/app.css`, `docs/browser-checks.md`,
  `docs/current-state.md`, and three test fixtures:
  `test/localeSync.test.ts`, `test/session.test.ts`,
  `test/profileFields.test.ts`.
- **Specs**: `openspec/specs/unified-shell/spec.md` gets a delta: the
  session requirement's text, and one new dismissal requirement. No other
  spec changes.
- **Browser support floor**: the new `vite.config.ts` `build.target` raises
  it to the Popover API baseline. A user on an older browser sees a real,
  if small, behavior change, flagged **BREAKING** above.
- **No API, schema, or engine impact.** This change stays inside
  `packages/web`. The engine, `src/schema`, and the HTTP wrapper keep their
  current code.
