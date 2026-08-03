<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

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
change the roles carried by a JWT already issued to that user. Token
verification (`jwt-authentication`) performs no per-request database lookup. A
token issued before the assignment therefore keeps its own `roles` claim until
its `exp`.

#### Scenario: A token issued before the change keeps its old roles

- **WHEN** a user logs in and then has a role granted
- **AND** that user presents the token issued before the grant to a route
  gated by that role
- **THEN** the request is refused, unaffected by the grant

#### Scenario: The next login carries the new roles

- **WHEN** that user logs in again after the grant
- **THEN** the issued token's `roles` claim holds the granted role
