## 1. `src/auth/users.ts`

- [ ] 1.1 Add `setPasswordById(userId, password, db)`: hash with
      `Bun.password.hash`, update `auth_users.password_hash` for
      `user_id = $1`, return the updated `UserSummary` via `RETURNING`, or
      `undefined` when no such row exists. Leave `setPassword` untouched.
- [ ] 1.2 Update `listUsers` to `listUsers(page, db)`, accepting
      `{ limit?: number; cursor?: string }` and returning `Page<UserSummary>`
      (imported from `src/engine/admin-queries.ts`, where `MAX_LIST_LIMIT`
      already lives too). Add a private `DEFAULT_LIST_LIMIT = 50` to
      `src/auth/users.ts`, matching `admin-queries.ts`'s own private
      constant, and apply `Math.min(page.limit ?? DEFAULT_LIST_LIMIT,
      MAX_LIST_LIMIT)` the way `listOutbox` does. Keyset-page on `(email,
      user_id)` ascending, decoding the incoming cursor with
      `decodeCursor(cursor, 2)` and encoding the outgoing one with
      `encodeCursor`.
- [ ] 1.3 Update the two existing callers of the old `listUsers(db)`
      signature. `test/auth-users.test.ts` calls it with no arguments 7
      times, treating the result as an array; each call moves to reading
      `.items` off the returned `Page<UserSummary>`. `scripts/seed.ts`'s
      `seedUser` calls `listUsers(sql)` positionally; it moves to
      `listUsers({}, sql)`, reading `.items` off the result.

## 2. `src/http/admin-routes.ts`

- [ ] 2.1 Reuse the existing `parseRoles` helper (already used by
      `handleAdminSetUserRoles`) from the new create-user handler too,
      unchanged.
- [ ] 2.2 Add `handleAdminCreateUser`: resolve actor, `requireRole(actor,
      ADMIN_ROLE)`, parse `{ email, password, roles? }`, reject a missing or
      blank-after-trim `email`/`password` with 400, validate `roles` with
      `parseRoles`, call `createUser`, return 201 with the created row.
      Catch the `auth_users_email_key` unique-violation (SQLSTATE 23505) and
      return 409, mirroring `isManagerForeignKeyViolation`'s pattern for the
      manager foreign key.
- [ ] 2.3 Add `handleAdminSetUserPassword`: resolve actor, `requireRole`,
      parse `{ password }`, reject a missing or blank-after-trim value with
      400, call `setPasswordById`, return 200 with the updated row or 404
      when it returns `undefined`.
- [ ] 2.4 Update `handleAdminListUsers` to read `limit`/`cursor` from the
      query string via the existing `parseLimit` helper (capped at
      `MAX_LIST_LIMIT`) and pass them through to `listUsers`.

## 3. Route registration

- [ ] 3.1 Register `POST /admin/users` -> `handleAdminCreateUser` and `POST
      /admin/users/:id/password` -> `handleAdminSetUserPassword` alongside
      the other `/admin/users*` routes.

## 4. `packages/web` admin API layer

- [ ] 4.1 In `packages/web/src/areas/admin/api/types.ts`, add an optional
      `cursor?: string` field to `UserPage` (it already carries `items:
      UserSummary[]`), matching `OutboxPage`/`PendingTimerPage`.
- [ ] 4.2 In `packages/web/src/areas/admin/api/client.ts`, update `listUsers`
      to accept optional `{ limit?: number; cursor?: string }` and to build
      the query string the way `listOutbox`/`listPendingTimers` already do.
      Add `createUser(email, password, roles, token)` (`POST /admin/users`)
      and `setUserPassword(userId, password, token)` (`POST
      /admin/users/:id/password`), following `setUserRoles`'s shape.

## 5. Admin Users screen

- [ ] 5.1 Run `/frontend-design:frontend-design` for the "New user" and
      "Reset password" UI before building it, per this repo's UI-work
      convention.
- [ ] 5.2 Add a "New user" action opening an inline creation form (email,
      password, roles), in the register-row style `UsersScreen.tsx` already
      uses for its role and manager editors, following the visual direction
      from 5.1 and `.claude/rules/design-language.md`.
- [ ] 5.3 Add a "Reset password" action per row, opening an inline editor for
      the new password, with a caveat line stating a reset does not revoke an
      already-issued token, the same pattern `ROLE_CAVEAT`/`MANAGER_CAVEAT`
      set.
- [ ] 5.4 Wire the screen's `load()` to the new paginated `listUsers` call,
      adding a "Load more" control consistent with how the outbox and
      timers screens page (or confirm and reuse their existing pattern if one
      is already shared). This ships in the same commit as 1.2's default
      page size, so an operator with more than 50 accounts never loses
      visibility into the rest.
- [ ] 5.5 Add any new pure helpers this UI needs to `usersLogic.ts`
      (e.g. request-shape formatting), each covered by a unit test the way
      `parseRoles`/`managerChoices` are today.

## 6. Tests

- [ ] 6.1 `test/` (or the existing auth test file): unit tests for
      `setPasswordById`: it updates the hash, returns the row, returns
      `undefined` for an unknown id, and a login with the new password
      succeeds while the old one fails.
- [ ] 6.2 Unit tests for paginated `listUsers`: it pages correctly, orders by
      email, breaks ties on `(email, user_id)`, and defaults to 50 rows when
      `limit` is omitted.
- [ ] 6.3 HTTP-level tests for `POST /admin/users`: success (201), missing
      `system:admin` (403), missing/blank email or password (400), duplicate
      email (409), out-of-bounds roles (400), default empty `roles`.
- [ ] 6.4 HTTP-level tests for `POST /admin/users/:id/password`: success
      (200) plus a follow-up login proving the new password works and the
      old one does not, unknown user (404), missing `system:admin` (403),
      blank password (400), and a token issued before the reset still
      authenticating afterward.
- [ ] 6.5 HTTP-level test for `GET /admin/users` pagination: `limit` plus
      cursor walks the full set with no duplicate or dropped row.

## 7. Documentation

- [ ] 7.1 Update `openspec/specs/admin-user-management/spec.md`'s `##
      Purpose` section directly (a delta's own `## Purpose` is ignored for an
      existing capability). Replace "Creating a user and changing a
      password remain CLI-only... this capability adds no HTTP path for
      either" with wording naming the new HTTP paths, while still noting
      `src/auth/cli.ts`'s `add-user` and `set-password` stay as the CLI's
      own paths.
- [ ] 7.2 (Optional) Update `ROADMAP.md` stage 10b and
      `docs/current-state.md`'s admin-user-management history note, both of
      which still say account creation and password change stay CLI-only
      after 7.1 corrects the capability spec's own Purpose.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`.
- [ ] 8.2 Run `bun run build`.
- [ ] 8.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm the
      skip count, not only the pass count, and read the verdict off named
      test results rather than a single-file rerun.
- [ ] 8.4 Run the antislop linter (`scripts/gates/prose.sh` equivalent, or
      the `antislop` skill directly) over every Markdown file this change
      touched, including this change's own `openspec/changes/` artifacts.
- [ ] 8.5 Run `git diff --check` for trailing whitespace and blank-at-EOF,
      and `git ls-files --eol` to confirm no CRLF landed in a touched file.
- [ ] 8.6 Manually verify in a real browser: create a user, log in as that
      user, reset a password from another admin session, confirm the old
      password fails and the new one works, and confirm pagination on the
      Users screen with more accounts than one page holds. Record any new
      check this surfaces in `docs/browser-checks.md`, per that doc's split
      rule with `development-toolchain`.
