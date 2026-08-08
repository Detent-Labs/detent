## 1. Schema

- [x] 1.1 Add a nullable `display_name text` column to `auth_users` in
      `initSchema` (`src/engine/store.ts`), via `ALTER TABLE ... ADD COLUMN
      IF NOT EXISTS`, alongside the existing `manager_user_id` migration
      statement.

## 2. Resolution and user functions (src/auth/users.ts)

- [x] 2.1 Add a resolution helper implementing `COALESCE(display_name,
      email)`, used by every function below that reads a displayable name.
- [x] 2.2 Update `createUser` to accept an optional `displayName`
      parameter. Trim it. Store `NULL` when the trimmed result is empty or
      the caller omits the argument, the trimmed value otherwise. Never
      store an empty string.
- [x] 2.3 Update `scripts/seed.ts:91`'s `createUser` call to pass
      `undefined` for the new `displayName` argument, keeping `sql` as the
      final positional argument.
- [x] 2.4 Update `verifyLogin` to return the resolved display name
      alongside `userId` and `roles`. Its `SELECT` reads `user_id,
      password_hash, roles, disabled` only today. Add `display_name` and
      `email` (or the resolved expression) to both the query and the inline
      row type at `users.ts:40-44`.
- [x] 2.5 Update `UserRow`, `toSummary`, and the `SELECT`/`RETURNING`
      column list in `listUsers`, `setRolesById`, `setDisabled`, and
      `setManagerById` to include `display_name`, resolved through 2.1's
      helper. All four share `toSummary`; missing one leaves that route's
      returned `displayName` silently wrong (falling back to email) for an
      account that has a real value set.
- [x] 2.6 Add `setDisplayName(userId, displayName, db)`, mirroring
      `setRolesById`/`setManagerById`. Trim the input the same way 2.2
      does: an empty-after-trim value stores as `NULL`, never `""`. `null`
      itself also clears the column to `NULL`. Return the updated
      `UserSummary`, or `undefined` for an unknown `userId`. The shared
      `normalizeDisplayName` does both jobs: it stores the empty case as
      `NULL`, and it throws past the 200-character bound, on every write
      path. The HTTP route still answers 400 on empty and over-length input,
      because it validates before it writes (see 5.2).
- [x] 2.7 Add `setDisplayNameByEmail(email, displayName, db)`, the
      email-keyed sibling of `setDisplayName`, mirroring `setManagerByEmail`
      (`users.ts:171`). Resolve the id through the existing `userIdForEmail`
      helper, throw `no such user: <email>` when it resolves to nothing,
      then delegate to `setDisplayName` so the trim and the `NULL`
      normalization stay in one place. The CLI's `set-name` (4.2) calls
      this, not `setDisplayName`.
- [x] 2.8 Update the exact-equality assertions in `test/auth-users.test.ts`
      that the new fields break: line 47 (`verifyLogin`), line 119
      (`setDisabled`), line 128 (`setRolesById`). Add the resolved
      `displayName` to each literal, which for these fixtures is the
      account's email, since none of them sets a display name. Keep
      `toEqual`: a switch to `toMatchObject` would stop the suite from
      noticing a field that should not be there.

## 3. Login response (src/auth/login.ts)

- [x] 3.1 Add `displayName` to the `actor` object in `handleLogin`'s `200`
      response, from the value `verifyLogin` now returns.

## 4. CLI (src/auth/cli.ts)

- [x] 4.1 Add an optional trailing display-name argument to `add-user`.
- [x] 4.2 Add a `set-name <email> <display-name>` command mirroring
      `set-roles`/`set-password`/`set-manager`, calling `setDisplayNameByEmail`
      (2.7).
- [x] 4.3 Update the file's top-of-file usage comment to document both. State
      there that an account with a display name and no roles passes an empty
      roles argument: `add-user <email> <password> "" <display-name>`.

## 5. Admin HTTP route (src/http/admin-routes.ts, src/http/server.ts)

- [x] 5.1 Add `handleAdminSetUserName` (or equivalent) to
      `admin-routes.ts`, gated by `system:admin` through the existing
      `requireRole` check every other `/admin/*` route uses. Register it
      in `src/http/server.ts`'s route table as `PATCH
      /admin/users/:userId/name`, alongside the existing
      `/admin/users/:userId/manager` entry at `server.ts:496-497`:

      ```ts
      { method: "PATCH", segments: seg("/admin/users/:userId/manager"),
        handler: (p, req) => handleAdminSetUserManager(p[0]!, req, resolver, db) },
      ```

      That single entry also registers the route's CORS preflight. There is
      no second OPTIONS table. The branch at `server.ts:608-611` matches the
      request path against this same table and answers with every method the
      table holds for that pattern:

      ```ts
      if (req.method === "OPTIONS") {
        const methods = routes.filter((r) => match(r.segments, parts) !== null).map((r) => r.method);
        if (methods.length > 0) return preflightResponse(methods.join(", "), allowedOrigins, origin);
      }
      ```

      So a route registered anywhere else than this table gets no preflight.
      Without a preflight the admin screen's name save fails in a browser and
      nowhere else: the `PATCH` never leaves. 6.8's preflight test is what
      proves the entry landed in the table.
- [x] 5.2 Validate the request body `{ displayName: string | null }`:
      trim a non-null value, reject empty-after-trim or over 200 characters
      with `400`, `null` clears to `NULL`. Return `200` with the updated row
      on success, `404` for an unknown user. The bound and the
      empty-after-trim check ship as one exported helper in
      `src/auth/users.ts`, a `DISPLAY_NAME_MAX_LENGTH` constant plus a
      `validateDisplayName(value)` the route calls. A later self-scoped route
      calls that same helper instead of re-deriving the bound.

## 6. Tests

- [x] 6.1 Schema: an existing database gains `display_name` as `NULL` on
      the next `initSchema` run.
- [x] 6.2 `createUser`/`verifyLogin`: resolution falls back to email when
      `display_name` is `NULL`, and returns the stored value otherwise.
- [x] 6.3 `createUser` and `setDisplayName`: a whitespace-only or empty
      display name, from the CLI or a direct call, stores as `NULL`, never
      `""`, and resolves to email.
- [x] 6.4 `POST /auth/login`: the `200` response includes a non-empty
      `actor.displayName`.
- [x] 6.5 `listUsers`/`GET /admin/users`: the response includes resolved
      `displayName` per row, falling back to email the same way.
- [x] 6.6 `setRolesById`/`setDisabled`/`setManagerById` (via their admin
      routes): the returned row's `displayName` reflects a real stored
      value, not a fallback to email, for an account that has one set.
- [x] 6.7 CLI: `add-user` with and without a trailing display name;
      `set-name` against an existing account.
- [x] 6.8 `PATCH /admin/users/:id/name`: set, clear-to-null, trim
      whitespace, refuse empty-after-trim, refuse over-long, `404` for an
      unknown user, `403` for a caller without `system:admin`. Add a
      preflight test mirroring `test/http-admin.test.ts:648`: an `OPTIONS`
      request to `http://x/admin/users/user_x/name` returns `204` with
      `Access-Control-Allow-Methods: PATCH`. Every sibling mutating route
      has one — line 614 (enable, `POST`), line 640 (roles, `PATCH`), line
      648 (manager, `PATCH`). The header value is exactly `PATCH`: no other
      table entry matches that path, so the derived list holds one method.
      This test needs no database, like its three siblings.

## 7. Documentation

- [x] 7.1 `docs/current-state.md`: add `display_name`/`displayName` to the
      `auth_users` schema description and the `listUsers` field list.
- [x] 7.2 `docs/openapi.yaml`: give `LoginResponse.actor` its own schema
      (`LoginActor`, `{ id, roles, displayName }`, all three required)
      instead of the `$ref` to the shared `Actor`. Leave `Actor` at line
      1008 as it is: it documents the trusted authorization identity, which
      this change does not extend.
- [x] 7.3 When `opsx:sync` or `opsx:archive` writes the
      `admin-user-management` capability back, extend its Purpose paragraph
      to read "listing local users, toggling their `disabled` state, and
      assigning their roles, manager and display name". Purpose carries no
      requirement text, so no delta covers it.
- [x] 7.4 Sync or archive `add-user-display-name` BEFORE
      `add-personal-profile-page`. Both MODIFY the requirement "Local users
      are persisted in an auth_users table". The body in
      `add-personal-profile-page` is a superset of the body here. It adds
      the `locale` column and the scenario "An existing database gains the
      locale column". A MODIFIED delta replaces the whole requirement block
      at sync time. The reverse order overwrites the superset with the body
      here and drops `locale`.

## 8. Verification

- [x] 8.1 Run `bun run typecheck` and confirm no errors.
- [x] 8.2 Run `bun run build` and confirm it succeeds.
- [x] 8.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      the skip count stays at its prior baseline (no suite silently
      skipped) and read the verdict off named test results, not the pass
      count alone.
- [x] 8.4 Run the antislop linter over every Markdown file this proposal
      touched (already clean for proposal.md, design.md, and both delta
      specs at authoring time; re-run if any of them updates further
      during implementation).
- [x] 8.5 Run `git diff --check` for trailing whitespace and blank lines
      at end of file, and `git ls-files --eol` for CRLF (per CLAUDE.md:
      `git diff --check` does not report a CR byte).
