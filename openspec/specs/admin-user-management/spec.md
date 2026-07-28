# admin-user-management Specification

## Purpose

The one HTTP carve-out from `local-user-accounts`'s CLI-only administration:
listing local users and toggling their `disabled` state, gated by
`system:admin` alongside every other `/admin/*` route
(`admin-operations-api`). Creating a user, changing a password, or assigning
roles remain CLI-only (`src/auth/cli.ts`) — this capability adds no HTTP path
for any of those three. See the `admin-app` capability for the Users screen
that consumes these routes.

## Requirements

### Requirement: Users are listable by an operator over HTTP

`src/auth/users.ts` SHALL expose `listUsers(db)` returning every row of
`auth_users` as `{ userId, email, roles, disabled }`, excluding
`password_hash`. This SHALL be exposed as `GET /admin/users`, gated by
`system:admin` through the same `requireRole` check every other `/admin/*`
route uses. The list SHALL NOT be paged or filtered — `auth_users` is
CLI-provisioned and expected to stay small.

#### Scenario: Listing users

- **WHEN** `GET /admin/users` is requested by an actor holding `system:admin`
- **THEN** the response is 200 with every user's `userId`, `email`, `roles`
  and `disabled` state

#### Scenario: Password hashes are never returned

- **WHEN** `GET /admin/users` is requested
- **THEN** no entry in the response carries a `password_hash` or any other
  form of the stored credential

#### Scenario: An actor without the role is refused

- **WHEN** `GET /admin/users` is requested with a resolvable credential whose
  `roles` does not include `system:admin`
- **THEN** the response is 403 and no query is performed

### Requirement: A user can be disabled over HTTP

`src/auth/users.ts` SHALL expose `setDisabled(userId, disabled, db)`, which
SHALL set `auth_users.disabled` to the given boolean for the row matching
`user_id = $1` and return the updated `{ userId, email, roles, disabled }`, or
`undefined` when no such `userId` exists. This SHALL be exposed as `POST
/admin/users/:id/disable` (calling `setDisabled(id, true, db)`), gated by
`system:admin`, returning 200 with the updated row on success and 404 when
`setDisabled` returns `undefined`.

Disabling SHALL take effect on that user's *next* login attempt
(`verifyLogin` already rejects `disabled = true`, per `local-user-accounts`).
It SHALL NOT revoke a JWT already issued to that user: token verification
(`jwt-authentication`) performs no per-request database lookup, so a token
issued before the disable remains valid until its own `exp`.

#### Scenario: Disabling a user

- **WHEN** `POST /admin/users/:id/disable` is requested for an existing user
  by an actor holding `system:admin`
- **THEN** the response is 200, the row's `disabled` is `true`, and a
  subsequent login attempt for that user fails

#### Scenario: Disabling an unknown user

- **WHEN** `POST /admin/users/:id/disable` is requested for a `userId` that
  does not exist in `auth_users`
- **THEN** the response is 404

#### Scenario: A token issued before disabling still authenticates until it expires

- **WHEN** a user logs in, is then disabled, and presents the token issued
  before the disable to another route before that token's `exp`
- **THEN** the request resolves to that actor and proceeds, unaffected by the
  disable

### Requirement: A user can be re-enabled over HTTP

`POST /admin/users/:id/enable` SHALL call `setDisabled(id, false, db)`, gated
by `system:admin`, with the same 200/404 mapping as disable.

#### Scenario: Re-enabling a user

- **WHEN** `POST /admin/users/:id/enable` is requested for a disabled user by
  an actor holding `system:admin`
- **THEN** the response is 200, the row's `disabled` is `false`, and that user
  can log in again

#### Scenario: Re-enabling an unknown user

- **WHEN** `POST /admin/users/:id/enable` is requested for a `userId` that
  does not exist in `auth_users`
- **THEN** the response is 404
