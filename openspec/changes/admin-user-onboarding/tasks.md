## 1. `src/auth/users.ts`

- [x] 1.1 Add `setPasswordById(userId, password, db)`: hash with
      `Bun.password.hash`, update `auth_users.password_hash` for
      `user_id = $1`, return the updated `UserSummary` via `RETURNING`, or
      `undefined` when no such row exists. Leave `setPassword` untouched.
      Update the module docstring at the top of `src/auth/users.ts`, which
      states that creating a user and changing a password are CLI-only. Name
      the two new routes there, the way it already names the `/admin/users*`
      carve-out.
- [x] 1.2 Update `listUsers` to `listUsers(page, db)`, accepting
      `{ limit?: number; cursor?: string }` and returning `Page<UserSummary>`
      (imported from `src/engine/admin-queries.ts`, where `MAX_LIST_LIMIT`
      already lives too). Add a private `DEFAULT_LIST_LIMIT = 50` to
      `src/auth/users.ts`, matching `admin-queries.ts`'s own private
      constant, and apply `Math.min(page.limit ?? DEFAULT_LIST_LIMIT,
      MAX_LIST_LIMIT)` the way `listOutbox` does. Keyset-page on `(email,
      user_id)` ascending, decoding the incoming cursor with
      `decodeCursor(cursor, 2)` and encoding the outgoing one with
      `encodeCursor`.
- [x] 1.3 Update the two existing callers of the old `listUsers(db)`
      signature. `test/auth-users.test.ts` calls it with no arguments 7
      times, treating the result as an array; each call moves to reading
      `.items` off the returned `Page<UserSummary>`. `scripts/seed.ts`'s
      `seedUser` calls `listUsers(sql)` positionally; it moves to
      `listUsers({}, sql)`, reading `.items` off the result.

## 2. `src/http/admin-routes.ts`

- [x] 2.1 Reuse the existing `parseRoles` helper (already used by
      `handleAdminSetUserRoles`) from the new create-user handler too,
      unchanged.
- [x] 2.2 Add `handleAdminCreateUser`: resolve actor, `requireRole(actor,
      ADMIN_ROLE)`, parse `{ email, password, roles? }`, reject a missing or
      blank-after-trim `email`/`password` with 400, validate `roles` with
      `parseRoles`, call `createUser`, return 201 with the created row.
      Catch the `auth_users_email_key` unique-violation (SQLSTATE 23505) and
      return 409, mirroring `isManagerForeignKeyViolation`'s pattern for the
      manager foreign key.
- [x] 2.3 Add `handleAdminSetUserPassword`: resolve actor, `requireRole`,
      parse `{ password }`, reject a missing or blank-after-trim value with
      400, call `setPasswordById`, return 200 with the updated row or 404
      when it returns `undefined`.
- [x] 2.4 Update `handleAdminListUsers` to read `limit`/`cursor` from the
      query string via the existing `parseLimit` helper (capped at
      `MAX_LIST_LIMIT`) and pass them through to `listUsers`.

## 3. Route registration

- [x] 3.1 Register `POST /admin/users` -> `handleAdminCreateUser` and `POST
      /admin/users/:userId/password` -> `handleAdminSetUserPassword` alongside
      the other `/admin/users*` routes in `src/http/server.ts`. That table
      spells its capture segment `:userId`; the specs write `:id` for the same
      segment, so follow the file. The CORS preflight answer derives from this
      table, so registration is the whole of it.

## 4. `packages/web` admin API layer

- [x] 4.1 In `packages/web/src/areas/admin/api/types.ts`, add an optional
      `cursor?: string` field to `UserPage` (it already carries `items:
      UserSummary[]`), matching `OutboxPage`/`PendingTimerPage`.
- [x] 4.2 In `packages/web/src/areas/admin/api/client.ts`, update `listUsers`
      to accept optional `{ limit?: number; cursor?: string }` and to build
      the query string the way `listOutbox`/`listPendingTimers` already do.
      Add `createUser(email, password, roles, token)` (`POST /admin/users`)
      and `setUserPassword(userId, password, token)` (`POST
      /admin/users/:id/password`), following `setUserRoles`'s shape.

## 5. Admin Users screen

- [x] 5.1 Run `/frontend-design:frontend-design` for the "New user" and
      "Reset password" UI before building it, per this repo's UI-work
      convention.
- [x] 5.2 Add a "New user" action opening an inline creation form (email,
      password, roles), in the register-row style `UsersScreen.tsx` already
      uses for its role and manager editors, following the visual direction
      from 5.1 and `.claude/rules/design-language.md`.
- [x] 5.3 Add a "Reset password" action per row, opening an inline editor for
      the new password, with a caveat line stating a reset does not revoke an
      already-issued token, the same pattern `ROLE_CAVEAT`/`MANAGER_CAVEAT`
      set.
- [x] 5.4 Wire the screen's `load()` to the paginated `listUsers` call: request
      `MAX_LIST_LIMIT` and follow the returned cursor until none comes back,
      then render every account it holds. No "Load more" control. The manager
      column reads the full set on every row at rest, so the screen holds every
      account either way, and a control that hid rows already in memory would
      be a second mechanism for nothing. This ships in the same commit as
      1.2's default page size, so an operator with more than 50 accounts never
      loses visibility into the rest.
- [x] 5.5 Add any new pure helpers this UI needs to `usersLogic.ts`, each
      covered by a unit test the way `parseRoles`/`managerChoices` are today.
      Outcome: none were needed. The creation form's roles field reuses
      `parseRoles`, which `admin-usersLogic.test.ts` already covers, and both
      new editors hold plain strings the route validates.
- [x] 5.6 Confirm the screen never renders a partial set. `managerChoices` and
      `managerLabel` both read the array `load()` fills, and 5.4's walk is what
      makes that array complete. Neither helper changes. Leave a comment at the
      walk naming what breaks without it: an account past one page leaves the
      dropdown, and a row pointing at one renders its raw `user_id` through
      `managerLabel`'s fallback.

## 6. Tests

- [x] 6.1 `test/` (or the existing auth test file): unit tests for
      `setPasswordById`: it updates the hash, returns the row, returns
      `undefined` for an unknown id, and a login with the new password
      succeeds while the old one fails.
- [x] 6.2 Unit tests for paginated `listUsers`: it pages correctly, orders by
      email, breaks ties on `(email, user_id)`, and defaults to 50 rows when
      `limit` is omitted. The default-limit case needs 51 accounts. Insert
      those rows with one statement carrying a constant `password_hash` string
      rather than calling `createUser` 51 times: that function runs
      `Bun.password.hash` (argon2id) per account, and this case asserts a page
      size, never a credential.
- [x] 6.3 HTTP-level tests for `POST /admin/users`: success (201), missing
      `system:admin` (403), missing/blank email or password (400), duplicate
      email (409), out-of-bounds roles (400), default empty `roles`.
- [x] 6.4 HTTP-level tests for `POST /admin/users/:id/password`: success
      (200) plus a follow-up login proving the new password works and the
      old one does not, unknown user (404), missing `system:admin` (403),
      blank password (400), and a token issued before the reset still
      authenticating afterward.
- [x] 6.5 HTTP-level test for `GET /admin/users` pagination: `limit` plus
      cursor walks the full set with no duplicate or dropped row.
- [x] 6.6 Update the two `test/http-admin.test.ts` tests the new routes make
      false. "no route creates a user, sets a password, or registers one"
      keeps only the entries that stay absent (`PUT /admin/users`, `POST
      /admin/users/user_x/email`, `POST /auth/register`); its comment names the
      new routes as the reason the other two entries left. The users-route
      preflight test expects `Access-Control-Allow-Methods: GET` and now reads
      two methods, so set it to the value `server.ts` derives, read off the
      run rather than guessed.
- [x] 6.7 `packages/web/test/admin-usersLogic.test.ts`: a case pinning
      `managerLabel`'s two answers apart. Over the full account set it resolves
      an email; over a set missing that account it falls back to the raw
      `user_id`. That fallback is what 5.4's walk exists to keep out of the UI.

## 7. Documentation

- [x] 7.1 Update `openspec/specs/admin-user-management/spec.md`'s `##
      Purpose` section directly (a delta's own `## Purpose` is ignored for an
      existing capability). Replace "Creating a user and changing a
      password remain CLI-only... this capability adds no HTTP path for
      either" with wording naming the new HTTP paths, while still noting
      `src/auth/cli.ts`'s `add-user` and `set-password` stay as the CLI's
      own paths.
- [x] 7.2 Update the `## Purpose` of
      `openspec/specs/local-user-accounts/spec.md` and of
      `openspec/specs/admin-app/spec.md` directly, for the reason 7.1 gives. `local-user-accounts` calls listing and disabling "the one
      carve-out" from CLI-only administration; `admin-app` describes the Users
      screen in its own opening paragraph. Both name the state this change
      ends.
- [x] 7.3 Update `ROADMAP.md` stage 10b and `docs/current-state.md`'s
      admin-user-management history note. Both say account creation and
      password change stay CLI-only. This is not optional: CLAUDE.md names
      stale roadmap status as a defect class this repository produced more than
      once, and no gate catches it.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`.
- [x] 8.2 Run `bun run build`.
- [x] 8.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm the
      skip count, not only the pass count, and read the verdict off named
      test results rather than a single-file rerun.
- [x] 8.4 Run the antislop linter (`scripts/gates/prose.sh` equivalent, or
      the `antislop` skill directly) over every Markdown file this change
      touched, including this change's own `openspec/changes/` artifacts.
- [x] 8.5 Run `git diff --check` for trailing whitespace and blank-at-EOF,
      and `git ls-files --eol` to confirm no CRLF landed in a touched file.
- [ ] 8.6 Manually verify in a real browser: create a user, log in as that
      user, reset a password from another admin session, confirm the old
      password fails and the new one works, and confirm pagination on the
      Users screen with more accounts than one page holds. Record any new
      check this surfaces in `docs/browser-checks.md`, per that doc's split
      rule with `development-toolchain`.
