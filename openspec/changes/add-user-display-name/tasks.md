## 1. Schema

- [ ] 1.1 Add a nullable `display_name text` column to `auth_users` in
      `initSchema` (`src/engine/store.ts`), via `ALTER TABLE ... ADD COLUMN
      IF NOT EXISTS`, alongside the existing `manager_user_id` migration
      statement.

## 2. Resolution and user functions (src/auth/users.ts)

- [ ] 2.1 Add a resolution helper implementing `COALESCE(display_name,
      email)`, used by every function below that reads a displayable name.
- [ ] 2.2 Update `createUser` to accept an optional `displayName`
      parameter. Trim it. Store `NULL` when the trimmed result is empty or
      the caller omits the argument, the trimmed value otherwise. Never
      store an empty string.
- [ ] 2.3 Update `scripts/seed.ts:91`'s `createUser` call to pass
      `undefined` for the new `displayName` argument, keeping `sql` as the
      final positional argument.
- [ ] 2.4 Update `verifyLogin` to return the resolved display name
      alongside `userId` and `roles`.
- [ ] 2.5 Update `UserRow`, `toSummary`, and the `SELECT`/`RETURNING`
      column list in `listUsers`, `setRolesById`, `setDisabled`, and
      `setManagerById` to include `display_name`, resolved through 2.1's
      helper. All four share `toSummary`; missing one leaves that route's
      returned `displayName` silently wrong (falling back to email) for an
      account that has a real value set.
- [ ] 2.6 Add `setDisplayName(userId, displayName, db)`, mirroring
      `setRolesById`/`setManagerById`. Trim the input the same way 2.2
      does: an empty-after-trim value stores as `NULL`, never `""`. `null`
      itself also clears the column to `NULL`. Return the updated
      `UserSummary`, or `undefined` for an unknown `userId`. This function
      normalizes; it does not reject — the 400-on-empty/over-length
      rejection stays at the HTTP route (see 5.2).

## 3. Login response (src/auth/login.ts)

- [ ] 3.1 Add `displayName` to the `actor` object in `handleLogin`'s `200`
      response, from the value `verifyLogin` now returns.

## 4. CLI (src/auth/cli.ts)

- [ ] 4.1 Add an optional trailing display-name argument to `add-user`.
- [ ] 4.2 Add a `set-name <email> <display-name>` command mirroring
      `set-roles`/`set-password`/`set-manager`.
- [ ] 4.3 Update the file's top-of-file usage comment to document both.

## 5. Admin HTTP route (src/http/admin-routes.ts, src/http/server.ts)

- [ ] 5.1 Add `handleAdminSetUserName` (or equivalent) to
      `admin-routes.ts`, gated by `system:admin` through the existing
      `requireRole` check every other `/admin/*` route uses. Register it
      in `src/http/server.ts`'s route table as `PATCH
      /admin/users/:userId/name`, alongside the existing
      `/admin/users/:userId/manager` entry.
- [ ] 5.2 Validate the request body `{ displayName: string | null }`:
      trim a non-null value, reject empty-after-trim or over 200 characters
      with `400`, `null` clears to `NULL`. Return `200` with the updated row
      on success, `404` for an unknown user.

## 6. Tests

- [ ] 6.1 Schema: an existing database gains `display_name` as `NULL` on
      the next `initSchema` run.
- [ ] 6.2 `createUser`/`verifyLogin`: resolution falls back to email when
      `display_name` is `NULL`, and returns the stored value otherwise.
- [ ] 6.3 `createUser` and `setDisplayName`: a whitespace-only or empty
      display name, from the CLI or a direct call, stores as `NULL`, never
      `""`, and resolves to email.
- [ ] 6.4 `POST /auth/login`: the `200` response includes a non-empty
      `actor.displayName`.
- [ ] 6.5 `listUsers`/`GET /admin/users`: the response includes resolved
      `displayName` per row, falling back to email the same way.
- [ ] 6.6 `setRolesById`/`setDisabled`/`setManagerById` (via their admin
      routes): the returned row's `displayName` reflects a real stored
      value, not a fallback to email, for an account that has one set.
- [ ] 6.7 CLI: `add-user` with and without a trailing display name;
      `set-name` against an existing account.
- [ ] 6.8 `PATCH /admin/users/:id/name`: set, clear-to-null, trim
      whitespace, refuse empty-after-trim, refuse over-long, `404` for an
      unknown user, `403` for a caller without `system:admin`.

## 7. Documentation

- [ ] 7.1 `docs/current-state.md`: add `display_name`/`displayName` to the
      `auth_users` schema description and the `listUsers` field list.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck` and confirm no errors.
- [ ] 8.2 Run `bun run build` and confirm it succeeds.
- [ ] 8.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      the skip count stays at its prior baseline (no suite silently
      skipped) and read the verdict off named test results, not the pass
      count alone.
- [ ] 8.4 Run the antislop linter over every Markdown file this proposal
      touched (already clean for proposal.md, design.md, and both delta
      specs at authoring time; re-run if any of them updates further
      during implementation).
- [ ] 8.5 Run `git diff --check` for trailing whitespace and blank lines
      at end of file, and `git ls-files --eol` for CRLF (per CLAUDE.md:
      `git diff --check` does not report a CR byte).
