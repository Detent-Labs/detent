## 1. Engine: user administration functions

- [x] 1.1 Add `listUsers(db)` to `src/auth/users.ts`, selecting `user_id,
      email, roles, disabled` (never `password_hash`) from `auth_users`.
- [x] 1.2 Add `setDisabled(userId, disabled, db)` to `src/auth/users.ts`,
      updating `auth_users SET disabled = $1 WHERE user_id = $2 RETURNING
      user_id, email, roles, disabled` and returning the updated row, or
      `undefined` for an unknown `userId` (one function/one update, like
      `setRoles`/`setPassword` — but keyed by `userId`, not `email`; see
      design.md).
- [x] 1.3 Extend `test/auth-users.test.ts`: `listUsers` returns every user
      without `password_hash`; `setDisabled` flips the flag and returns the
      updated row, or `undefined` for an unknown `userId`; a user disabled via
      `setDisabled` then fails `verifyLogin` exactly like one disabled
      directly in the DB.

## 2. HTTP: admin routes

- [x] 2.1 Add `handleAdminListUsers`, `handleAdminDisableUser`,
      `handleAdminEnableUser` to `src/http/admin-routes.ts`, following the
      existing `guarded`/`resolveActor`/`requireRole(actor, ADMIN_ROLE)` shape.
      Disable/enable return 200 with the updated `{userId, email, roles,
      disabled}` `setDisabled` already returns, or 404 when it returns
      `undefined`.
- [x] 2.2 Wire `GET /admin/users`, `POST /admin/users/:id/disable`, `POST
      /admin/users/:id/enable` in `src/http/server.ts`, alongside the
      existing `/admin/*` routes.
- [x] 2.3 Add matching `OPTIONS` preflight branches for the three new routes
      in `src/http/server.ts`, following the existing `admin/outbox`/
      `admin/timers` pattern (204, CORS headers, no handler invoked) —
      `http-wrapper`'s standing "each of its routes" preflight requirement
      already covers these, this is just wiring it up.
- [x] 2.4 Extend `test/http-admin.test.ts`: list/disable/enable happy paths
      (asserting `userId`/`email`/`roles`/`disabled` and no `password_hash`),
      404 on an unknown id, 403 for an actor without `system:admin`, 401 for
      an unresolvable credential.
- [x] 2.5 Extend `test/auth-login.test.ts` with an end-to-end round trip:
      log in, disable the same user via `POST /admin/users/:id/disable`
      (using a separately signed `system:admin` token), then verify the
      pre-disable token still authenticates a request while a fresh login
      attempt for that user now fails — closes the gap `/opsx:verify` found
      (the non-revocation claim in `admin-user-management`'s spec was
      previously argued from architecture, not asserted by a test).

## 3. Frontend: Users screen

- [x] 3.1 Add `listUsers`/`disableUser`/`enableUser` functions plus their
      request/response types to the existing `packages/admin/src/api/
      client.ts` and `types.ts` (one shared client module, not per-resource
      files — follow `listOutbox`/`retryOutboxRow`'s shape in `client.ts`).
- [x] 3.2 Add `packages/admin/src/screens/UsersScreen.tsx`: table of
      email/roles/disabled with a disable/enable action per row, a
      confirmation dialog on disable stating the session-caveat copy from
      `admin-app`'s spec delta, and the existing refresh-control +
      refetch-on-focus convention (`useRefresh.ts`).
- [x] 3.3 Add the `/users` route to `packages/admin/src/routing.ts` and a nav
      entry in `App.tsx`, alongside Instances/Outbox/Timers.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` across the workspace.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun — the DB-backed suites share one database and
      contend when run back-to-back in isolation).
