# admin-user-management Specification

## Purpose

The HTTP carve-out from `local-user-accounts`'s CLI-only administration:
listing local users, toggling their `disabled` state, and assigning their
roles, gated by `system:admin` alongside every other `/admin/*` route
(`admin-operations-api`). Creating a user and changing a password remain
CLI-only (`src/auth/cli.ts`) — this capability adds no HTTP path for either.
See the `admin-app` capability for the Users screen that consumes these
routes.
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

Disabling SHALL take effect on that user's next request, not on their next
login. The resolver reads the account behind every locally issued token, so a
token issued before the disable stops resolving at once. See
`jwt-authentication`. The login path SHALL keep rejecting a disabled account
as it does today.

An externally issued token SHALL keep its own issuer's behavior. This engine
holds no `auth_users` row for such an actor, so `setDisabled` does not reach
that identity. Revoking it is the identity provider's operation.

#### Scenario: Disabling a user

- **WHEN** `POST /admin/users/:id/disable` is requested for an existing user
  by an actor holding `system:admin`
- **THEN** the response is 200, the row's `disabled` is `true`, and a
  subsequent login attempt for that user fails

#### Scenario: Disabling an unknown user

- **WHEN** `POST /admin/users/:id/disable` is requested for a `userId` that
  does not exist in `auth_users`
- **THEN** the response is 404

#### Scenario: A token issued before disabling stops authenticating

- **WHEN** a user logs in, is then disabled, and presents the token issued
  before the disable to another route before that token's `exp`
- **THEN** the request is rejected with `401`, and the route's handler does
  not run

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

### Requirement: A user's roles are assignable over HTTP

`src/auth/users.ts` SHALL expose `setRolesById(userId, roles, db)`. It SHALL
set `auth_users.roles` to the given array for the row matching `user_id = $1`.
It SHALL return the updated `{ userId, email, roles, disabled }`, or
`undefined` when no such `userId` exists.

This SHALL be exposed as `PATCH /admin/users/:id/roles`, gated by
`system:admin` through the same `requireRole` check every other `/admin/*`
route uses. The request body SHALL be `{ roles: string[] }`. The submitted
array SHALL replace the user's whole role set, so an omitted role is a removed
role.

The route SHALL return 200 with the updated row on success, and 404 when
`setRolesById` returns `undefined`.

The existing `setRoles(email, roles, db)` SHALL keep its behaviour and its
email key, since `src/auth/cli.ts` calls it.

#### Scenario: Assigning roles

- **WHEN** `PATCH /admin/users/:id/roles` is requested for an existing user by
  an actor holding `system:admin`, with `{ "roles": ["finance:approver"] }`
- **THEN** the response is 200, the returned row's `roles` is
  `["finance:approver"]`, and `auth_users` holds exactly that set

#### Scenario: A role the request omits is removed

- **WHEN** a user holding `["a", "b"]` is sent `{ "roles": ["a"] }`
- **THEN** the response is 200 and that user holds `["a"]` alone

#### Scenario: Assigning roles to an unknown user

- **WHEN** `PATCH /admin/users/:id/roles` is requested for a `userId` that does
  not exist in `auth_users`
- **THEN** the response is 404 and no row is written

#### Scenario: An actor without the role is refused

- **WHEN** `PATCH /admin/users/:id/roles` is requested with a resolvable
  credential whose `roles` does not include `system:admin`
- **THEN** the response is 403 and no row is written

### Requirement: A role assignment is bounded and normalized

`PATCH /admin/users/:id/roles` SHALL reject six request bodies. Each rejection
SHALL return 400 and write no row.

- `roles` is absent.
- `roles` is not an array.
- An entry is not a string.
- An entry is empty after trimming.
- An entry is longer than 64 characters.
- The array holds more than 64 entries.

Before writing, the route SHALL trim each entry and SHALL drop duplicates,
preserving the first occurrence's order.

The route SHALL enforce no character set on a role string. A process body names
whatever role it wants, and `src/auth/cli.ts` has always written role strings
unchecked.

#### Scenario: A non-array body is refused

- **WHEN** the body is `{ "roles": "finance:approver" }`
- **THEN** the response is 400 and no row is written

#### Scenario: An entry that is empty after trimming is refused

- **WHEN** the body is `{ "roles": ["a", "   "] }`
- **THEN** the response is 400 and no row is written

#### Scenario: An over-long entry is refused

- **WHEN** the body holds an entry of 65 characters
- **THEN** the response is 400 and no row is written

#### Scenario: An over-large set is refused

- **WHEN** the body holds 65 entries
- **THEN** the response is 400 and no row is written

#### Scenario: Entries are trimmed and deduplicated

- **WHEN** the body is `{ "roles": [" a ", "b", "a"] }`
- **THEN** the response is 200 and the stored set is `["a", "b"]`

#### Scenario: A role string with unusual characters is accepted

- **WHEN** the body holds a role string that no `system:*` pattern matches, of
  legal length and non-empty after trimming
- **THEN** the response is 200 and that string is stored verbatim

### Requirement: An actor cannot strip its own admin role

`PATCH /admin/users/:id/roles` SHALL return 409 and SHALL write no row under
one condition. The path's `:id` equals the resolved actor's own id, and the
submitted role set does not contain `system:admin`. This keeps the admin area
from locking out the one actor holding it open. That actor's only recovery
would be the server shell this capability exists to replace.

The guard SHALL cover the calling actor alone. Stripping `system:admin` from
any other user SHALL succeed, including when no other holder remains.

The guard SHALL run before the row is read, so it decides ahead of the 404. An
actor authenticated by an external issuer may hold `system:admin` from a `sub`
that matches no `auth_users` row, which `jwt-authentication` allows. That actor
SHALL receive the 409, not the 404: the rule governs the actor, not the row.

The route SHALL return this 409 as an inline typed body of the existing
envelope shape. The 404 above it takes the same form. `POST
/admin/users/:id/disable` already returns its own 404 that way. The route SHALL
add no error class and no mapping entry to `src/http/errors.ts`.
`admin-operations-api` requires that. No `/admin/*` route brings a new error
type or a new response envelope with it.

#### Scenario: Self-stripping the admin role is refused

- **WHEN** an actor holding `system:admin` sends `PATCH /admin/users/:id/roles`
  for its own id, with a `roles` set that omits `system:admin`
- **THEN** the response is 409 and that user's roles are unchanged

#### Scenario: An actor may change its own other roles

- **WHEN** an actor holding `["system:admin", "a"]` sends `{ "roles":
  ["system:admin", "b"] }` for its own id
- **THEN** the response is 200 and the stored set is `["system:admin", "b"]`

#### Scenario: Another admin's role may be stripped

- **WHEN** an actor holding `system:admin` sends a `roles` set omitting
  `system:admin` for a different user who holds it
- **THEN** the response is 200 and that user no longer holds `system:admin`

#### Scenario: The guard decides ahead of the unknown-user 404

- **WHEN** an actor whose own id matches no `auth_users` row sends a `roles`
  set omitting `system:admin` for that same id
- **THEN** the response is 409, not 404, and no row is written

#### Scenario: The refusal uses the existing error envelope

- **WHEN** the route answers 409
- **THEN** the body carries the same `{ error: { type, message } }` shape the
  disable route's 404 carries, and `src/http/errors.ts` gained no error class
  for it

### Requirement: A role change does not reach an already-issued token

A role assignment SHALL take effect on that user's *next* login. It SHALL NOT
change the roles carried by a JWT already issued to that user. The resolver
reads the account behind a locally issued token to learn whether that account
is still live, and it reads nothing else. `Actor.roles` keeps coming from the
token's own `roles` claim. A token issued before the assignment therefore
keeps that claim until its `exp`.

Reading `roles` from that same row instead would make a grant reach a live
session. This requirement records that the change did not do so. A disable
ends a session outright, so the operator has one control that acts at once. A
grant is not that control.

#### Scenario: A token issued before the change keeps its old roles

- **WHEN** a user logs in and then has a role granted
- **AND** that user presents the token issued before the grant to a route
  gated by that role
- **THEN** the request is refused, unaffected by the grant

#### Scenario: The next login carries the new roles

- **WHEN** that user logs in again after the grant
- **THEN** the issued token's `roles` claim holds the granted role

### Requirement: A user's manager is assignable over HTTP

`src/auth/users.ts` SHALL expose a function setting `auth_users.manager_user_id`
for the row matching `user_id = $1`. It SHALL return the updated user summary. It
SHALL return `undefined` when no such `userId` exists.

This SHALL be exposed as `PATCH /admin/users/:id/manager`, gated by
`system:admin` through the same `requireRole` check every other `/admin/*` route
uses. The request body SHALL be `{ managerUserId: string | null }`, where `null`
clears the pointer.

The route SHALL return 200 with the updated row on success. It SHALL return 404
when the target user does not exist.

<!-- antislop: allow synonym-rotation -->
The route SHALL reject two cases with 400. Those are a `managerUserId` naming no
account, and a `managerUserId` equal to the `:id` being changed. A self-pointer
would name the starter as their own approver. That is an operator mistake rather
than an organizational fact. "Operator" is this spec's word for the administrator
persona, distinct from "user", the account being administered.

The route SHALL NOT reject a pointer closing a cycle between two accounts.
Nothing traverses the pointer, so a cycle has no effect.

#### Scenario: Assigning a manager

- **WHEN** `PATCH /admin/users/:id/manager` is requested for an existing user by
  an actor holding `system:admin`, with another existing account's id
- **THEN** the response is 200, the returned row names that manager, and
  `auth_users` holds it

#### Scenario: Clearing a manager

- **WHEN** `PATCH /admin/users/:id/manager` is requested with
  `{ "managerUserId": null }`
- **THEN** the response is 200 and that user's `manager_user_id` is `NULL`

#### Scenario: A manager naming no account is refused

- **WHEN** `PATCH /admin/users/:id/manager` names a `userId` absent from
  `auth_users`
- **THEN** the response is 400 and no row is written

#### Scenario: A user cannot be their own manager

- **WHEN** `PATCH /admin/users/:id/manager` names the same user being changed
- **THEN** the response is 400 and no row is written

#### Scenario: Assigning a manager to an unknown user

- **WHEN** `PATCH /admin/users/:id/manager` is requested for a `userId` that
  does not exist in `auth_users`
- **THEN** the response is 404 and no row is written

#### Scenario: An actor without the role is refused

- **WHEN** `PATCH /admin/users/:id/manager` is requested with a resolvable
  credential whose `roles` does not include `system:admin`
- **THEN** the response is 403 and no row is written

