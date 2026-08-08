## 1. Prerequisite

- [x] 1.1 Confirm the team has applied `add-user-display-name`:
      `auth_users` has `display_name`, and `src/auth/users.ts` exposes
      the `COALESCE(display_name, email)` resolution helper. Do not
      start section 2 until this holds.

## 2. Backend: schema and account routes

- [x] 2.1 Add an additive migration for `auth_users.locale text` in
      `src/engine/store.ts`'s `initSchema`, following the
      `manager_user_id`/`display_name` pattern. No backfill.
- [x] 2.2 Add read/write support for `locale` in `src/auth/users.ts`: add
      it to the `UserRow` interface, and add a new single-row lookup keyed
      on `user_id` for `GET`/`PATCH /account/me` (do not reuse `listUsers`,
      which returns every account). Leave `UserSummary`, `toSummary` and the
      `SELECT`/`RETURNING` column lists in `listUsers`, `setRolesById`,
      `setDisabled` and `setManagerById` alone: widening them would change
      four `/admin/users` response bodies that `admin-user-management` pins
      as `{ userId, email, roles, disabled }`, and this change ships no
      delta for that capability. `test/auth-users.test.ts`'s
      `setDisabled`/`setRolesById` assertions therefore stay valid
      unchanged.
- [x] 2.3 Add `src/http/account-routes.ts` with `GET /account/me`: local
      account returns `{ id, displayName, storedDisplayName, email, roles,
      managerUserId, locale, editable: true }`; an actor with no
      `auth_users` row returns `{ id, roles, editable: false }`, never
      `404`. `storedDisplayName` carries the raw `display_name` column, and
      is `null` where the account set no name. The federated answer gains
      neither name field.
- [x] 2.4 Add `PATCH /account/me` in the same module: body limited to
      `displayName`/`locale`, both optional; reject an unknown body key,
      an out-of-bound `displayName`, or an unsupported `locale`, each
      with `400`; reject a federated actor's write with `403`.
- [x] 2.5 Wire `src/http/account-routes.ts` into `src/http/server.ts`,
      alongside the existing admin and studio route modules.
- [x] 2.6 Add `account-self-service` test coverage for every scenario in
      `specs/account-self-service/spec.md`, in a new
      `test/http-account.test.ts` mirroring `test/http-admin.test.ts`'s
      shape: create an `auth_users` row, then set `X-Actor-Id` to its
      `user_id`, as `test/http-admin.test.ts:302` does. Keep it out of
      `test/http-admin.test.ts`, whose routes are all admin-gated.
- [x] 2.7 Add `local-user-accounts` test coverage for the `locale` column
      migration scenario in `specs/local-user-accounts/spec.md`, in
      `test/auth-users.test.ts` beside the existing `initSchema adds
      manager_user_id` test at line 155.
- [x] 2.8 Document `GET` and `PATCH /account/me` in `docs/openapi.yaml`:
      the auth requirement (a token, no role), the request and response
      schemas, and the `400`/`401`/`403` statuses, per
      `http-api-documentation`'s "Each route documents auth, schema, and
      errors". Neither entry claims `404`.
- [x] 2.9 Cover the `http-api-documentation` delta's "The self-scoped
      account routes appear" scenario in
      `test/openapi-exclusions.test.ts`, the suite that already asserts
      documented paths. Assert `documentedPaths` contains `/account/me`,
      and slice that entry out of the document to assert it states a token
      requirement and no role. Mirror the existing `/ui-strings`
      assertions, which pair a `toContain` on `documentedPaths` with a
      sliced-entry check.
- [x] 2.10 Cover the locale-only write in `test/http-account.test.ts`: an
      account whose `display_name` is `NULL` sends `PATCH /account/me` with
      `{ "locale": "de" }`, and the column stays `NULL` while the returned
      `displayName` stays the email. Add the at-bound accept case beside it:
      a `displayName` of exactly `DISPLAY_NAME_MAX_LENGTH` characters
      answers `200` and reaches the column.

## 3. Frontend: session and hydration

- [x] 3.1 Extend `packages/web/src/shell/session.ts`'s `Session` type
      with optional `displayName`/`locale`, and pass both through
      `loadSession`'s explicit object literal
      (`packages/web/src/shell/session.ts:41`), which rebuilds the object
      field by field and would otherwise drop them on every reload.
      `persistSession` uses `JSON.stringify` and needs no change.
- [x] 3.2 Hydrate `displayName`/`locale` with a `GET /account/me` call
      whenever a session exists and either field is missing: after login,
      and after `loadSession()` restores a stored session on mount
      (`packages/web/src/shell/App.tsx:38`). Do not block login or first
      render on it. Add the call to
      `packages/web/src/api/client.ts`, beside `login`.
- [x] 3.3 Add a test that a stored session with no `displayName`/`locale`
      loads as valid and triggers the hydration call, per the
      `unified-shell` delta's compatibility scenario. Extend
      `packages/web/test/session.test.ts`'s round-trip assertion (line 16)
      to carry `displayName` and `locale`.
- [x] 3.4 Adopt a hydrated `locale` as the active UI locale in `App.tsx`
      when `localStorage` holds no `app.locale` value, and write it there.
      Leave a stored value alone, so a language chosen on this browser
      survives. `packages/web/src/i18n/locale.ts` keeps its signatures and
      stays token-free.
- [x] 3.5 Cover the hydration scenarios in the `unified-shell` delta: a
      session that hydrates `displayName` and `locale` after
      login, a hydrated locale adopted where `localStorage` holds no
      `app.locale`, and a stored `app.locale` that survives hydration.
      `loadLocale`/`persistLocale` take an injectable storage argument, so
      `packages/web/test/locale.test.ts`'s fake-storage object covers the
      last two with no DOM.

## 4. Frontend: profile page

- [x] 4.1 Invoke `/frontend-design:frontend-design` for the profile
      page's visual direction before building it. Follow
      `.claude/rules/design-language.md`: ruled rows, zero border-radius,
      the existing `.shell-*` class-naming convention, mono face
      reserved for machine-matched values (`id`), catalog-driven
      `t(locale, key)` strings for every label.
- [x] 4.2 Extend `packages/web/src/shell/routing.ts`'s `ShellLocation`/
      `matchShell` with a `{ kind: "profile" }` case matching `/profile`
      as a whole first segment, beside the existing `login` case, and add
      a `PROFILE_PATH` constant beside `LOGIN_PATH`. A deeper path under
      `/profile` stays `{ kind: "unknown" }`. Extend `App.tsx`'s render
      branching to route the new case.
- [x] 4.3 Add the profile page component under `packages/web/src/shell/`,
      reached through the new `ShellLocation` case.
- [x] 4.4 Render the page inside `Chrome`: widen `ChromeProps.area` from
      `Area` to `Area | "profile"`, and add an `area.profile` key to
      `packages/web/src/i18n/catalogs/shell.ts` in EN and DE. Widening the
      union leaves the four existing `<Chrome area="app">`-style call sites
      valid. The area switcher needs no change: `"profile"` is in no
      actor's permitted set, so it lists every area that actor may enter.
- [x] 4.5 Add `onGoToProfile` to `ChromeProps` and supply it at all 6 of
      `Chrome`'s call sites. Five exist today: `App.tsx:85`, the
      forbidden-area branch, plus the four area roots
      (`packages/web/src/areas/{app,admin,studio,reporting}/root.tsx`).
      Each area root builds the prop from the `go` it already receives
      (`onGoToProfile={() => go(PROFILE_PATH)}`), so `AreaRootProps` gains
      no member. The forbidden-area branch supplies it the same way. The
      sixth call site is new: task 4.4's profile branch in `App.tsx`
      renders `<Chrome area="profile" roles={session.roles} locale={locale}
      onLocaleChange={changeLocale} onLogout={logout} onGoToArea={(a) =>
      go(areaHref(a, "/"))} onGoToProfile={() => go(PROFILE_PATH)}>` around
      the profile page. That is the same prop set the forbidden-area branch
      already supplies at line 85.
- [x] 4.6 Render the read-only fields (`email`, `roles`,
      `managerUserId`) and an editable form for `displayName`/`locale`,
      calling `PATCH /account/me` on submit.
- [x] 4.7 Render the federated-actor case (`editable: false`) as an
      explanatory, identity-only state, showing only `id` and `roles`.
- [x] 4.8 Cover the `unified-shell` delta's path scenario, "The profile
      path matches as a whole segment". In
      `packages/web/test/routing.test.ts`'s `matchShell` block, add a case
      asserting `/profile` matches the new `ShellLocation`, and a case
      asserting a deeper path such as `/profile/settings` does not
      half-match. `unified-shell`'s "An area's router ships match,
      round-trip and half-match coverage" requires both. Routing coverage
      reaches neither of the two presentation scenarios; task 4.9 does.
- [x] 4.9 Put the page's presentation decision in a pure
      `packages/web/src/shell/profileFields.ts`, which maps a `GET
      /account/me` response to the rows the page renders. Tasks 4.6 and 4.7
      render what it returns and hold no branching of their own. The same
      module seeds the form: the name box takes `storedDisplayName`, the raw
      column, never the resolved `displayName`. An account that set no name
      opens the form with an empty box, so a save that changed the locale
      alone writes no email into the column. Cover both
      presentation scenarios in a new
      `packages/web/test/profileFields.test.ts`: an `editable: true`
      response yields `email`, `roles`, `managerUserId`, `displayName` and
      `locale`, per "A signed-in actor opens the profile page from the
      account menu"; an `editable: false` response yields `id` and `roles`
      and no editable row, per "A federated actor sees an identity-only
      profile page". Neither case needs a DOM, which every file in
      `packages/web/test/` assumes. A browser walk cannot reach the
      federated case: `POST /auth/login` issues an `iss: "bps"` token only
      (`src/auth/login.ts`), and such a token guarantees a local
      `auth_users` row.

## 5. Frontend: account-scoped locale

- [x] 5.1 Wire the account menu's existing language picker to call
      `PATCH /account/me` when a session exists, in addition to the
      existing `localStorage` write. The wiring lands in `App.tsx`'s
      `changeLocale` (`packages/web/src/shell/App.tsx:54-57`), which
      already holds both the session and the `persistLocale` call.
      `changeLocale` calls the seam task 5.3 extracts and keeps no
      branching of its own.
      `packages/web/src/i18n/locale.ts` stays unchanged.
- [x] 5.2 Confirm no locale change is reachable before login, so no
      pre-login path can reach an account route. `LoginScreen.tsx` takes
      `{ locale, onLoggedIn }` and renders email, password and submit only.
      The one picker sits in the account menu (`Chrome.tsx:66`), which
      never renders without a session.
- [x] 5.3 Extract the picker's decision into a pure
      `packages/web/src/shell/localeSync.ts`. `syncLocaleChange(next,
      { session, storage, patchAccount })` writes the locale to `storage`
      through `persistLocale`, calls `patchAccount` only when a session
      exists, and returns that session with `locale` set to `next`. Cover
      both language-picker scenarios in a new
      `packages/web/test/localeSync.test.ts`, with the fake storage object
      `packages/web/test/locale.test.ts` already builds and a recording
      `patchAccount` stub: signed in, the stub receives the chosen locale
      and the returned session carries it; with no session, the stub stays
      uncalled and only `storage` is written. Neither case needs a DOM.

## 6. Documentation

- [x] 6.1 `docs/current-state.md`: add `locale` to the `auth_users` schema
      description, beside the `manager_user_id` entry at line 2536, and
      record the new `src/http/account-routes.ts` module and its two
      routes.
- [x] 6.2 `docs/browser-checks.md`: record the profile-page walk from task
      7.6 as an entry naming this change, per `development-toolchain`'s
      "A browser check lands as an assertion or as a checklist entry".

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm it passes.
- [x] 7.2 Run `bun run build` and confirm it succeeds.
- [x] 7.3 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
- [x] 7.4 Run the antislop linter over every Markdown file this change
      touched.
- [x] 7.5 Run `git diff --check` for trailing whitespace and
      blank-lines-at-EOF, and `git ls-files --eol` for CRLF in the
      worktree. `git diff --check` does not report a CR byte.
- [x] 7.6 Manually verify in a real browser: log in, open the account
      menu, open the profile page, change the display name and locale,
      reload, and confirm both persist.
