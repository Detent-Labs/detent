## 1. Prerequisite

- [ ] 1.1 Confirm the team has applied `add-user-display-name`:
      `auth_users` has `display_name`, and `src/auth/users.ts` exposes
      the `COALESCE(display_name, email)` resolution helper. Do not
      start section 2 until this holds.

## 2. Backend: schema and account routes

- [ ] 2.1 Add an additive migration for `auth_users.locale text` in
      `src/engine/store.ts`'s `initSchema`, following the
      `manager_user_id`/`display_name` pattern. No backfill.
- [ ] 2.2 Add read/write support for `locale` in `src/auth/users.ts`:
      the `UserRow`/`UserSummary` interfaces, the `toSummary` mapper, and
      the `SELECT`/`RETURNING` column lists in `listUsers`,
      `setRolesById`, `setDisabled`, and `setManagerById`. Add a new
      single-row lookup keyed on `user_id` for `GET /account/me` (do not
      reuse `listUsers`, which returns every account). Update
      `test/auth-users.test.ts`'s `setDisabled`/`setRolesById`
      assertions (currently `toEqual({ userId, email, roles, disabled,
      managerUserId: undefined })`) to add `locale: undefined`, matching
      the precedent set when `managerUserId` was added.
- [ ] 2.3 Add `src/http/account-routes.ts` with `GET /account/me`: local
      account returns `{ id, displayName, email, roles, managerUserId,
      locale, editable: true }`; an actor with no `auth_users` row
      returns `{ id, roles, editable: false }`, never `404`.
- [ ] 2.4 Add `PATCH /account/me` in the same module: body limited to
      `displayName`/`locale`, both optional; reject an unknown body key,
      an out-of-bound `displayName`, or an unsupported `locale`, each
      with `400`; reject a federated actor's write with `403`.
- [ ] 2.5 Wire `src/http/account-routes.ts` into `src/http/server.ts`,
      alongside the existing admin and studio route modules.
- [ ] 2.6 Add `account-self-service` test coverage for every scenario in
      `specs/account-self-service/spec.md`.
- [ ] 2.7 Add `local-user-accounts` test coverage for the `locale` column
      migration scenario in `specs/local-user-accounts/spec.md`.

## 3. Frontend: session and hydration

- [ ] 3.1 Extend `packages/web/src/shell/session.ts`'s `Session` type
      with optional `displayName`/`locale`.
- [ ] 3.2 Add a post-login call to `GET /account/me` that fills in
      `displayName`/`locale` once it resolves, without blocking login on
      it.
- [ ] 3.3 Confirm a stored session predating this change (no
      `displayName`/`locale`) still loads as valid, per the
      `unified-shell` delta's compatibility scenario.

## 4. Frontend: profile page

- [ ] 4.1 Invoke `/frontend-design:frontend-design` for the profile
      page's visual direction before building it. Follow
      `.claude/rules/design-language.md`: ruled rows, zero border-radius,
      the existing `.shell-*` class-naming convention, mono face
      reserved for machine-matched values (`id`), catalog-driven
      `t(locale, key)` strings for every label.
- [ ] 4.2 Extend `packages/web/src/shell/routing.ts`'s `ShellLocation`/
      `matchShell` with a case for the profile page. Extend `App.tsx`'s
      render branching to route it.
- [ ] 4.3 Add the profile page component under `packages/web/src/shell/`,
      reached through the new `ShellLocation` case.
- [ ] 4.4 Thread a new profile-menu prop through `Chrome.tsx` and all 5
      of its call sites (`App.tsx`'s forbidden-area branch and the four
      area roots: `packages/web/src/areas/{app,admin,studio,reporting}/
      root.tsx`), so the account menu's new entry navigates to the page.
- [ ] 4.5 Render the read-only fields (`email`, `roles`,
      `managerUserId`) and an editable form for `displayName`/`locale`,
      calling `PATCH /account/me` on submit.
- [ ] 4.6 Render the federated-actor case (`editable: false`) as an
      explanatory, identity-only state, showing only `id` and `roles`.
- [ ] 4.7 Add `unified-shell` test coverage for the profile-page
      scenarios in `specs/unified-shell/spec.md`, including the new
      `ShellLocation` case in `packages/web/test/routing.test.ts`.

## 5. Frontend: account-scoped locale

- [ ] 5.1 Wire the account menu's existing language picker to call
      `PATCH /account/me` when a session exists, in addition to the
      existing `localStorage` write.
- [ ] 5.2 Confirm the pre-login picker (login screen) still writes only
      to `localStorage` and calls no account route.
- [ ] 5.3 Add `unified-shell` test coverage for the language-picker
      scenarios in `specs/unified-shell/spec.md`.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` and confirm it passes.
- [ ] 6.2 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
- [ ] 6.3 Run the antislop linter over every Markdown file this change
      touched.
- [ ] 6.4 Run `git diff --check` for trailing whitespace and
      blank-lines-at-EOF.
- [ ] 6.5 Manually verify in a real browser: log in, open the account
      menu, open the profile page, change the display name and locale,
      reload, and confirm both persist.
