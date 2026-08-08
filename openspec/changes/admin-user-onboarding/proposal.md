## Why

Admin > Users can list accounts, disable or enable them, and change roles
and manager. It cannot create an account. It cannot recover an account whose
password no one remembers. Both requests still route through someone with
shell access, who runs `src/auth/cli.ts add-user` or `set-password`.

`ROADMAP.md` (stage 10b) and `docs/current-state.md` already name this as
the one deliberate gap left when `admin-user-management` first shipped
HTTP-only user administration. This change closes it. The two `auth_users`
mutations that still need a shell get an HTTP door. The `system:admin` role
gates each one, the same way it already gates every other write on this
screen.

## What Changes

- Add `POST /admin/users`, gated by `system:admin`: creates a local account
  (`{ email, password, roles? }`). It mirrors `cli.ts`'s `add-user` command
  and calls the existing `createUser` in `src/auth/users.ts`.
- Add `POST /admin/users/:id/password`, gated by `system:admin`: sets a new
  password on an existing account. Adds `setPasswordById(userId, password,
  db)` to `src/auth/users.ts`, keyed by `userId` like
  `setDisabled`/`setRolesById`/`setManagerById`. The existing `setPassword`
  stays as it is, keyed by email, for `cli.ts`'s own recovery path.
- Add pagination (`limit`/`cursor`) to `GET /admin/users` and `listUsers`.
  Every other admin list route (`/instances`, `/admin/outbox`,
  `/admin/timers`) already bounds its result set. This one does not.
- Add "New user" and "Reset password" actions to the admin Users screen
  (`packages/web/src/areas/admin/screens/UsersScreen.tsx`). Both follow the
  register-row and inline-editor style the roles and manager editors already
  use. Each carries a caveat line the way `ROLE_CAVEAT` and `MANAGER_CAVEAT`
  do today.
- This change does not add hard delete. Disable stays the only retirement
  path: `store.ts` states outright that nothing deletes an account today.
- This change does not add a password-strength floor. `Bun.password.hash`
  keeps accepting any input.
- This change does not add a self-service reset flow: no emailed link, no
  reset-token table, no unauthenticated consume route. An admin sets the
  password directly, on the account holder's behalf.

Exploration of this change surfaced the three points above and set them
aside on purpose.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `admin-user-management`: adds account creation and admin-set password
  reset as HTTP-reachable operations, and adds pagination to the user list
  read. No existing requirement changes. Disabling, role assignment and
  manager assignment keep behaving exactly as specced today.

## Impact

- `src/auth/users.ts`: adds `setPasswordById`. `listUsers` gains
  `limit`/`cursor` parameters and a bounded query.
- `src/http/admin-routes.ts`: adds `handleAdminCreateUser` and
  `handleAdminSetUserPassword`. `handleAdminListUsers` reads the new query
  parameters.
- `src/http/server.ts`: registers the two new routes.
- `packages/web/src/areas/admin/api/client.ts` and `api/types.ts`: adds
  `createUser` and `setUserPassword` functions and their request and
  response types. `listUsers` gains optional paging parameters in this
  layer too.
- `packages/web/src/areas/admin/screens/UsersScreen.tsx` and
  `screens/usersLogic.ts`: adds the "New user" and "Reset password" UI.
  Any new pure helpers get tests, the same way `parseRoles` and
  `managerChoices` do today.
- `test/auth-users.test.ts`: the `listUsers()` signature change breaks its
  7 existing call sites. Each one moves to the new `Page<UserSummary>`
  shape.
- `scripts/seed.ts`: `seedUser`'s `listUsers(sql)` call moves to the new
  signature.
- No schema migration. `auth_users` already carries every column these
  routes need: `email`, `password_hash`, `roles`, `disabled`,
  `manager_user_id`.
- No change to `src/auth/cli.ts`. `add-user` and `set-password` stay the
  CLI's own paths. This change does not delete them.
