## 1. ErrorBanner (finding 57)

- [x] 1.1a Add an `error.failed` key ("Failed" / "Fehlgeschlagen") to
      `i18n/catalogs/shell.ts`'s `en` and `de` catalogs, alongside
      the existing `error.retry` and `error.generic` keys. Every area
      catalog already carries this exact EN/DE text under its own key
      (`error.failed` in `app`/`studio`/`reporting`, `common.failed` in
      `admin`); this is a pure lift into the shell catalog `ErrorBanner`
      reads from, no wording decision needed.
- [x] 1.1b Add a `shell-error-banner`/`shell-error-banner-stamp`/
      `shell-error-banner-message` rule block to `shell/shell.css`,
      following the class-naming convention in
      `.claude/rules/design-language.md`. `areas/app/app.css`'s
      `.app-error-banner*` rules (lines 252-277) and
      `areas/admin/app.css`'s `.admin-error-banner*` rules (lines
      380-405) are byte-identical; carry that one rule block over
      verbatim under the `shell-` prefix.
- [x] 1.1 Add `shell/ErrorBanner.tsx`: props `error: string`,
      `locale: <area's own UiLocale>`, `onRetry?: () => void`,
      `retryDisabled?: boolean`. Render the stamp and the message
      unconditionally, using the `shell-error-banner*` classes from task
      1.1b. Render the retry button only when `onRetry` is passed, with
      `disabled={retryDisabled}` on it; `retryDisabled` has no effect
      when `onRetry` is absent, since no button renders to disable.
- [x] 1.2 Convert one call site first (`admin/screens/InstancesScreen.tsx`)
      and one from the app area (`app/screens/TasksScreen.tsx`). Both
      currently disable their retry button while a reload is in flight
      (`disabled={loading}`); wire that through as `retryDisabled={loading}`
      alongside `onRetry`. Confirm both render and retry identically to
      before, including the disabled-while-loading state.
- [x] 1.3 Convert the remaining 11 call sites: `OutboxScreen.tsx`,
      `TimersScreen.tsx`, `UsersScreen.tsx`, `DataListsScreen.tsx`,
      `DataListScreen.tsx`, `UiStringsScreen.tsx`, `MigrationsScreen.tsx`,
      `InstanceScreen.tsx` (both call sites), `StartScreen.tsx`,
      `StartedScreen.tsx`. Two of these 11 need different wiring from the
      rest:
      - `MigrationsScreen.tsx` has no retry button today (a migration run
        isn't re-fetchable) — omit `onRetry` entirely there and keep the
        no-retry banner.
      - `InstanceScreen.tsx`'s first call site (the compound
        `view`/`versions`/`timers`/`processes`/record load) has no
        disabled-while-loading guard today — pass `onRetry` alone, with no
        `retryDisabled`.

      The other 9 (`OutboxScreen.tsx`, `TimersScreen.tsx`, `UsersScreen.tsx`,
      `DataListsScreen.tsx`, `DataListScreen.tsx`, `UiStringsScreen.tsx`,
      `InstanceScreen.tsx`'s second call site, `StartScreen.tsx`,
      `StartedScreen.tsx`) currently disable their retry button while a
      reload is in flight; pass `retryDisabled={loading}` (or the screen's
      own loading flag, e.g. `StartScreen.tsx`'s `loadingList`) alongside
      `onRetry` on each, the same wiring as task 1.2.
- [x] 1.4 Grep `packages/web/src` for the old inline error-banner markup
      to confirm no copy survives outside `ErrorBanner.tsx` itself.
      Delete the now-unreferenced `.app-error-banner*` rules from
      `areas/app/app.css` and the `.admin-error-banner*` rules from
      `areas/admin/app.css`, now that `shell/shell.css` carries the one
      shared rule block from task 1.1b.

## 2. usePagedList (finding 58)

- [x] 2.1 Add `shell/usePagedList.ts`: a hook taking
      `fetchPage(cursor?: string) => Promise<{items: T[], cursor?: string}>`
      and returning `{items, cursor, loading, error, load, loadMore,
      reset}`. `load` replaces `items`; `loadMore` appends.
      `reset(items: T[], cursor?: string)` writes the hook's internal
      `items` and `cursor` directly, with no fetch of its own; it exists
      for `InstanceScreen.tsx` (task 2.3) to seed the hook's state from a
      page it already fetched outside the hook. No other call site uses
      it.
- [x] 2.2 Convert `app/screens/TasksScreen.tsx` and
      `admin/screens/InstancesScreen.tsx` first. Confirm both the initial
      load and load-more still fetch, append, and error identically to
      before.
- [x] 2.3 Convert the remaining four call sites: `StartedScreen.tsx`,
      `OutboxScreen.tsx`, `TimersScreen.tsx`, `InstanceScreen.tsx`.

      `OutboxScreen.tsx`'s `fetchPage` adapter also calls `setCounts(page.
      counts)`, matching design.md's "thin adapter, side effects allowed"
      pattern. Call it only when `cursor` is `undefined` (the initial
      load), not on every page. Today's `loadMore` never updates
      `counts`; an unconditional call would start refreshing it on
      load-more, a real behavior change this refactor must not introduce.

      `InstanceScreen.tsx`'s initial `load` is not a pure paged-list load —
      it awaits `view` first, then fetches `versions`, the record page,
      `timers`, and `processes` together in one `Promise.all`, sharing one
      `loading`/`error` pair across all five. Keep that screen's own `load`,
      `loading`, and `error` state for the compound fetch. Convert only
      its `loadMoreRecord` continuation to `usePagedList`'s `loadMore`/
      append logic, wiring the hook's `error` into the same local `error`
      setter the screen's `fetchPage` adapter already has access to. Also
      wire the hook's `loading` into the record list's load-more button:
      change its `disabled={loading}` (the compound fetch's own `loading`)
      to `disabled={loading || recordList.loading}`, so a `loadMore()`
      call in flight disables the button too. Without it, a double-click
      fires two overlapping record-page fetches and duplicates timeline
      entries. Once
      the `Promise.all` resolves, call the hook's `reset(recordItems,
      recordCursor)` with the record page the compound fetch already
      retrieved, so the hook's own `cursor` starts where that page left
      off. Render the record list from the hook's `items`/`cursor`
      instead of separate local state; without the `reset` call,
      `loadMoreRecord`'s first invocation of the hook's `loadMore()` would
      pass `cursor=undefined` and refetch the record's first page instead
      of continuing from `recordCursor`.
- [x] 2.4 Delete each screen's own now-dead `load`/`loadMore` state and
      handlers.

## 3. UsersScreen busy helper (finding 59)

- [x] 3.1 Add a `busy(id: string, fn: () => Promise<void>)` helper local
      to `admin/screens/UsersScreen.tsx` that sets `busyId`, runs `fn`
      inside a `try`, calls `fail(err)` in the `catch`, and clears
      `busyId` in `finally`. All five current wrappers call `fail(err)`
      on error (to render the error banner or trigger the 401 logout
      redirect); the helper must call it too, or a failed action produces
      an unhandled promise rejection instead.
- [x] 3.2 Replace all five `setBusyId`/try/catch/finally wrappers
      (create, save roles, save manager, toggle, save password) with
      calls to `busy(...)`. Three of the five carry an explanatory
      comment beside their `fail(err)` call, describing what a failure
      means for that specific operation (the self-role-strip case in save
      roles, the refusal case in save manager, the taken-email case in
      create). Since `busy`'s `catch` calls `fail(err)` generically, with
      no per-caller context, move each such comment above its `busy(...)`
      call site instead.

## 4. profileFields simplification (finding 60)

- [x] 4.1 Delete `ProfileFieldKey`, `ProfileRow`, and the `control` union
      from `shell/profileFields.ts`. Keep `ABSENT`, `editSeed`, and
      `accountChanges`. Export `rolesText` (currently unexported, called
      only from the `profileFields()` dispatcher this section deletes);
      `ProfilePage.tsx` needs it directly once task 4.2 removes that
      dispatcher.
- [x] 4.2 Rewrite `ProfilePage.tsx` to render the federated branch (id,
      roles) and the local branch (email, roles, manager, display name,
      locale) as two direct JSX blocks, calling the now-exported
      `rolesText` for the roles row on each branch. Delete `ProfileTerm`
      and `ProfileControl`.
- [x] 4.3 Rewrite `packages/web/test/profileFields.test.ts`: delete the
      `describe("profileFields", ...)` block along with its import of
      `profileFields` and its assertions on `.rows`, `.control`, `.key`,
      `.labelKey`, and `.mono` — the `profileFields()` function that
      shape described no longer exists after task 4.2, and the two-branch
      rendered markup it asserted becomes a browser-check concern (task
      11.5) instead. Keep the `editSeed` and `accountChanges` describe
      blocks unchanged. Add a `rolesText` describe block covering the
      empty-roles (`ABSENT`) case and the joined-roles case, now that task
      4.1 exports it.
- [x] 4.4 Confirm the rendered markup (labels, mono styling, control
      types) matches the pre-change output for both an editable and a
      non-editable account.

## 5. parseErrorBody collapse (finding 61)

- [x] 5.1 In `api/client.ts`, add a `PASSTHROUGH` `Set` of the 19
      byte-identical error types: `already-claimed`, `not-a-candidate`,
      `not-claimed`, `not-claimant`, `unknown-delegate`, `not-assigned`,
      `guard-refused`, `authorization`, `actor-resolution`,
      `request-shape`, `not-found`, `conflict`, `draft-conflict`,
      `migration-plan`, `self-role-strip`, `self-manager`,
      `unknown-manager`, `email-in-use`, and `cross-process-validation`
      (its `{ type, message }` shape today is byte-identical to the
      other 18, so it folds into `PASSTHROUGH` rather than getting its
      own arm). Add a `PUBLISH_VALIDATION` `Set` of the five
      `*-validation` kinds.
- [x] 5.2 Rewrite `parseErrorBody` to check `PASSTHROUGH` first, then
      `PUBLISH_VALIDATION`, then the `validation` and
      `concurrency-conflict` arms, then the `internal` default. Delete
      the 26-arm switch. `err?.type` is `string | undefined`; narrow it
      to a local `const type = err?.type` and guard with
      `type !== undefined` before each `Set.has(type as
      ClientError["type"])` check, per design.md's code — `Set<T>.has`
      rejects an argument typed wider than `T`, so the unnarrowed value
      does not typecheck. In the `PUBLISH_VALIDATION` branch, read
      `err?.issues`, not `err.issues`: narrowing `type` from `err?.type`
      does not back-narrow `err` itself, so `err` stays possibly
      `undefined` there.
- [x] 5.3 Confirm every existing caller of `parseErrorBody` and every
      `ClientError`-typed consumer still compiles: the return shape per
      `type` is unchanged.

## 6. tokens.css cleanup (finding 62)

- [x] 6.1 Re-run the repo-wide grep for `--color-accent-2-`,
      `--color-neutral-100/200/300/400/600/700/800`,
      `--color-accent-100/200/300/500/800/900`, and `--shadow-sm` across
      `packages/web/src` to reconfirm zero references outside
      `tokens.css` (matches the 2026-08-17 audit).
- [x] 6.2 Delete the confirmed-unused custom properties from
      `shell/tokens.css`. Keep `--color-neutral-500`, `--color-neutral-900`,
      `--color-accent-400`, `--color-accent-600`, `--color-accent-700`,
      `--shadow-md`, and `--shadow-lg`. Fix the elevation block's comment
      in the same edit: it currently claims `--shadow-sm` (being deleted
      here) is what the dialog and the shell dropdown menu use, when both
      actually use `--shadow-md`/`--shadow-lg`; restate the comment
      against the two tokens that remain.

## 7. Chrome.tsx native Popover dismissal (finding 63)

- [x] 7.1 Add `build: { target: ["chrome114", "safari17", "firefox125"] }`
      to `vite.config.ts`.
- [x] 7.2 Rebuild (`bun run build` inside the devcontainer) and confirm
      the build succeeds with the new target, and that the CSP
      `transformIndexHtml` plugin still runs (inspect the built
      `index.html`'s `<meta http-equiv="Content-Security-Policy">` tag).
- [x] 7.3 In `Chrome.tsx`, replace the `useState`/`useRef`/`useEffect`
      dismissal trio with `popover="auto"` on the menu `<div>` and
      `popovertarget`/`popovertargetaction="toggle"` on the trigger
      button. Give the menu `<div>` a stable id (`const menuId = useId()`,
      `id={menuId}`) and set the trigger button's `popoverTarget={menuId}`
      — `popovertarget`'s declarative wiring only resolves when its value
      matches the target element's `id`. Mount the menu `<div>`
      unconditionally (drop the `{open &&
      (...)}` guard); the UA stylesheet's own
      `[popover]:not(:popover-open) { display: none }` hides it while
      closed, and a `popovertarget` trigger needs its target present in
      the DOM at all times to resolve. Add `const menuRef =
      useRef<HTMLDivElement>(null)` and `ref={menuRef}` on the menu
      `<div>` itself — a new declaration on a different element than the
      deleted trio's `menu` ref, which was attached to `.shell-account`,
      not `.shell-menu`. The `beforetoggle` listener and the
      `hidePopover()` calls below use this ref. Add `const triggerRef =
      useRef<HTMLButtonElement>(null)` and `ref={triggerRef}` on the
      trigger button; the `beforetoggle` listener attaches to the menu,
      so it needs its own way to reach the trigger's rect. Add the
      `beforetoggle` listener on the menu that, when `event.newState ===
      "open"`, reads `triggerRef.current?.getBoundingClientRect()` and
      sets the menu's inline
      `position: fixed`, `top` (the button's bottom edge plus the
      existing gap), and `right` (viewport width minus the button's right
      edge), per design.md's JS-positioning decision. Give the
      profile-entry, area-switcher, and logout buttons' `onClick`
      handlers an explicit `menuRef.current?.hidePopover()` call before
      their existing action. Native light-dismiss fires only on a
      pointer interaction outside the popover, never on a click of a
      control inside it. The call is load-bearing for the profile entry:
      clicking it while already on `/profile` re-renders inside the same
      `Chrome` instance, with no unmount, so nothing else would close the
      menu. Area-switch (a route change) and logout (a return to
      `LoginScreen`) already unmount `Chrome` on their own, closing the
      menu regardless; their calls are defensive, kept for the same
      reason and the same shape as the profile entry's. The language
      `<select>`'s `onChange` handler keeps no such call, so the menu
      stays open for a further selection.
- [x] 7.4 In `shell.css`, drop `.shell-menu`'s `position: absolute`,
      `right: 0`, and `top: calc(100% + var(--space-1))`; the popover
      top-layer promotion overrides them, and task 7.3's JS now sets the
      equivalent values. In their place, add `left: auto`, `bottom: auto`,
      and `margin: 0` to `.shell-menu`'s own rule, kept permanently rather
      than set inline. The popover UA stylesheet sets `inset: 0` and
      `margin: auto` on a `[popover]` element; without this reset, `top`
      and `right` set in JS still leave `bottom` at the UA's `0` and
      `margin` at `auto`, and CSS auto-margin resolution can re-center the
      menu instead of pinning it below-right of the trigger, per
      design.md's Risk 3.
- [x] 7.5 Keep `aria-expanded` hand-set on the trigger button, derived
      inside the `beforetoggle`/`toggle` listener by checking the menu
      ref's `:popover-open` state rather than from the deleted `open`
      state (the Popover API wires no ARIA state of its own). Comment why
      inline, per design.md.
- [x] 7.6 Confirm the nested language `<select>`'s `onChange` still runs
      and leaves the menu open, and that the profile entry's, the
      area-switcher buttons', and the logout button's `onClick` still run
      their own action and then close the menu via task 7.3's explicit
      `hidePopover()` call.

## 8. Session.expiresAt removal (finding 64)

- [x] 8.1 Grep all of `packages/web` (`src` and `test`) for `expiresAt` to
      find every write and read site. Expect: the `Session` interface,
      `loadSession`, the login flow that builds the initial `Session` from
      `POST /auth/login`'s response, and two test fixtures —
      `test/localeSync.test.ts`'s `SESSION` and `test/session.test.ts`'s
      `session`/`fresh` objects and JSON literals. The grep also surfaces a
      sixth hit that stays unchanged: `api/types.ts`'s
      `LoginResponse.expiresAt`. The server still returns it in
      `POST /auth/login`'s response body (see design.md's non-goals); only
      the client's `Session` type stops storing it. Do not remove this
      field.
- [x] 8.2 Delete the `expiresAt` field from the `Session` interface in
      `shell/session.ts`, its round-trip in `loadSession`, and its write
      at login. Update `session.ts`'s header comment in the same edit: it
      currently explains that `expiresAt` is "recorded, never consulted"
      so a later change can act on it; delete that rationale along with
      the field. Also update `LoginScreen.tsx`'s comment above
      `onLoggedIn` ("Roles and expiry come straight off the login
      response."), the login flow's own write site: drop the expiry
      reference, e.g. "Roles come straight off the login response."
- [x] 8.3 Drop `expiresAt` from `test/localeSync.test.ts`'s `SESSION`
      fixture.
- [x] 8.4 Drop `expiresAt` from `test/session.test.ts`'s fixtures: the
      `session` object, the JSON literal in the "loads a session stored
      before hydration existed" test, and the `fresh` object in the
      "session hydration" `describe` block. Delete the "keeps a past
      expiry usable — a 401 is the only end-of-session signal" test; its
      premise, a stored `expiresAt` that gates nothing, no longer applies
      once the field is gone. Drop "expiry" from the "round-trips a
      persisted session, roles, expiry and both hydrated fields included"
      test's name, since a deleted field no longer round-trips. The
      test's own comment carries no such wording today; no comment edit
      is needed.
- [x] 8.5 Re-run the task 8.1 grep. Confirm it returns exactly one hit,
      `api/types.ts`'s `LoginResponse.expiresAt`, and no others anywhere in
      `packages/web`.
- [x] 8.6 Rewrite `docs/current-state.md`'s "Unified shell" section
      (around line 2536-2540). It quotes `session.ts`'s `Session` shape
      as `{token, actorId, roles, expiresAt}`; drop `expiresAt` from that
      quote. It also carries the sentence "The expiry is recorded and
      never consulted... so storing the value keeps that requirement
      intact"; replace it with a sentence matching task 8.2's rewritten
      `session.ts` header comment, since the field is deleted rather than
      stored-but-unread now.

## 9. Spec sync (unified-shell)

- [x] 9.1 Confirm `specs/unified-shell/spec.md`'s MODIFIED session
      requirement and ADDED dismissal requirement match the shipped
      behavior from tasks 7 and 8 exactly (re-read after implementation,
      before requesting review). Confirm the RENAMED Requirements block's
      FROM line still matches
      `openspec/specs/unified-shell/spec.md`'s current header
      character-for-character, so archiving locates and renames the right
      requirement.

## 10. Verification

This group runs before the real-browser walk in group 11. That order
matches design.md's Migration Plan: the full verification gate first,
then the real-browser task. `packages/web`'s `build` script runs Vite
alone, with no `tsc` step. A type error surfaces only at 10.1, not at
build.

Group 11 stays a separate, later group rather than folding into this
one. This change's browser walk covers eight distinct behaviors across
five findings. Other changes fold a shorter, single-screen walk into
one terminal "Verification" group instead. Splitting it here keeps each
group's own checklist short enough to run and report on independently.

- [x] 10.1 Run `bun run typecheck` inside the devcontainer. Report the
      output.
- [x] 10.2 Run `bun run build` inside the devcontainer. Report the
      output.
- [x] 10.3 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set. Report the pass count and the skip count; a
      single-file rerun does not satisfy this task.
- [x] 10.4 Run the antislop linter (`antislop.py check`) on every
      Markdown file this change touched, including this change's own
      `proposal.md`, `design.md`, `tasks.md`, and
      `specs/unified-shell/spec.md`. Fix any findings.
- [x] 10.5 Run `git diff --check` over the changed files for trailing
      whitespace and blank-at-EOF. Run `git ls-files --eol` and read the
      `w/` column for any CRLF in a touched file.

## 11. Real-browser verification

- [x] 11.1 Build the app (`bun run build`) and serve it from the engine
      per `docs/browser-checks.md`'s existing flow. Drive the checks
      below with `playwright-cli`, per `CLAUDE.md`'s browser-automation
      convention.
- [x] 11.2 ErrorBanner: trigger a failing request on one app screen and
      one admin screen (e.g. an unreachable endpoint or a stubbed 500).
      Confirm the banner renders and the retry button re-issues the
      request.
- [x] 11.3 usePagedList: on one app screen and one admin screen with more
      rows than one page, click load-more and confirm the new rows
      append without replacing the existing ones.
- [x] 11.4 UsersScreen: start a slow action (e.g. toggle disable) and
      confirm the acted-on row's buttons disable for the duration and
      re-enable after.
- [x] 11.5 ProfilePage: open it as a local (editable) account and confirm
      the display-name and locale controls render and save. Open it as a
      federated (non-editable) account and confirm only the id/roles rows
      render, with no form.
- [x] 11.6 Chrome.tsx account menu, the finding-63 focus of this task:
  - [x] 11.6.1 Click the trigger, confirm the menu opens, `aria-expanded`
        becomes `"true"`, and the menu renders below and right-aligned to
        the trigger button, not centered in the viewport (the task 7.3
        positioning task's target).
  - [x] 11.6.2 Click outside the menu, confirm it closes.
  - [x] 11.6.3 Open the menu, press Escape, confirm it closes and focus
        returns to the trigger button.
  - [x] 11.6.4 Open the menu, change the language picker's selection,
        confirm the locale changes and the menu stays open.
  - [x] 11.6.5 Open the menu, click an area-switcher entry (an account
        holding 2+ permitted areas), confirm the menu closes and the
        shell navigates.
  - [x] 11.6.6 Open the menu, click the profile entry, confirm the menu
        closes and the shell navigates to the profile page (the same
        keep-its-own-action behavior as the area-switcher and logout
        entries).
  - [x] 11.6.7 Open the menu, press mouse-down inside it, drag outside,
        and release. Record the observed dismissal behavior against
        design.md's stated risk.
  - [x] 11.6.8 Confirm the oldest browser the new `build.target` names as
        supported still runs login, the task list, and the studio canvas
        correctly, not just the dropdown. Also open the account menu on
        that browser and confirm it opens, positions below and
        right-aligned to the trigger, and dismisses on an outside click.
        The menu is the one surface built on the newest, narrowest slice
        of the Popover API this change uses (`beforetoggle`, for JS
        positioning); every other 11.6.x check runs on whatever single
        browser drives `playwright-cli`, not on the stated floor.
  - [x] 11.6.9 Open the menu, click the logout entry, confirm the menu
        closes and the shell signs the actor out (the same
        keep-its-own-action
        behavior as the area-switcher and profile entries, task 7.6's
        implementation-time note).
- [x] 11.7 Record the 11.6.1-11.6.9 walk as a new entry in
      `docs/browser-checks.md`, sourced to this change
      (`web-client-ponytail-cleanup` task 11.6).
