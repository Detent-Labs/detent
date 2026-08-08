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
- Keep the Users screen's manager control offering every account once the list
  pages. `UsersScreen.tsx` passes its loaded rows to `managerChoices` and
  `managerLabel` (`screens/usersLogic.ts`). Both read that array as the whole
  account set. A page of 50 would otherwise drop every account past it from the
  choices. An existing pointer to one would show as a raw `user_id`.
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
  read. Disabling, role assignment and manager assignment keep behaving
  exactly as specced today.
- `local-user-accounts`: one requirement there names the HTTP carve-out as five
  routes. It also states that no route creates a user or sets a password. This
  change adds two such routes. That requirement leaves, and one naming seven
  replaces it. The CLI commands, the absent registration flow and the absent
  MFA flow stay as they are.
- `admin-app`: its Users-screen requirement states the screen "SHALL NOT offer
  creating a user or changing a password". It also states that the screen lists
  every local user. This change adds both controls and pages the list. It also
  pins the manager control's choices to the whole account set.

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
- `test/http-admin.test.ts`: two tests assert the state this change ends. "no
  route creates a user, sets a password, or registers one" expects 404 from
  `POST /admin/users`. It expects the same from `POST
  /admin/users/user_x/password`. The users-route preflight test expects
  `Access-Control-Allow-Methods: GET`. `server.ts` derives that answer from the
  route table. A second method on one path moves it.
- `scripts/seed.ts`: `seedUser`'s `listUsers(sql)` call moves to the new
  signature.
- `src/auth/users.ts`'s module docstring states that creating a user and
  changing a password are CLI-only. Both stop being true here.
- `packages/web/src/api/client.ts`'s `parseErrorBody` gains an `email-in-use`
  case. The browser check found the 409 reading as "The server hit an error".
  That switch is a third closed list, beside the `ClientError` union and the
  area's `describeError`. The same pass added the missing `self-manager` and
  `unknown-manager` cases. That gap predates this change. Both refusals of
  `PATCH /admin/users/:id/manager` reached the screen as the generic text.
  `packages/web/test/errors.test.ts` covers all three.
- `openspec/specs/local-user-accounts/spec.md` and
  `openspec/specs/admin-app/spec.md`: each gains a delta. This change also
  updates each capability's `## Purpose` in place. OpenSpec drops a delta's own
  Purpose for a capability that already exists.
- `ROADMAP.md` stage 10b and `docs/current-state.md` both state that account
  creation and password change stay CLI-only.
- No schema migration. `auth_users` already carries every column these
  routes need: `email`, `password_hash`, `roles`, `disabled`,
  `manager_user_id`.
- No change to `src/auth/cli.ts`. `add-user` and `set-password` stay the
  CLI's own paths. This change does not delete them.
