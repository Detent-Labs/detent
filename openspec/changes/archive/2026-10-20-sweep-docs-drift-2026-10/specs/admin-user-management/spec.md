## MODIFIED Requirements

<!-- Why: the heading below must match the live requirement heading byte for byte. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: An operator can create a user account over HTTP

`src/auth/users.ts` SHALL expose the existing `createUser(email, password,
roles, displayName, db)`, unchanged. `POST /admin/users` SHALL expose it,
gated by `system:admin`. Every other `/admin/*` route except the data list
routes enforces that role through the same `requireRole` check.

The request body SHALL be `{ email: string, password: string, roles?:
string[] }`. `email` and `password` SHALL each be non-empty after trimming.
`email` SHALL also be a valid address after trimming, by the rule "A new
account's email is a valid address" states. The route SHALL check it before
the write.

A `roles` array the body carries SHALL pass the same bounds `PATCH
/admin/users/:id/roles` already enforces. Each entry SHALL be a non-empty
string of at most 64 characters after trimming. The array SHALL hold at most
64 entries. The route SHALL deduplicate `roles` on first occurrence.
`roles` SHALL default to an empty array when the request omits it.

The route SHALL enforce no minimum length or character-set rule on
`password`. `Bun.password.hash` accepts any input. This route adds no check
the rest of the system lacks.

The request body SHALL have no display name. The route SHALL store none.
`PATCH /admin/users/:id/name` is the one route that writes that column. A
second way in would be a second way to drift. The created account's
`displayName` therefore resolves to its email, the rule
`resolveDisplayName` applies everywhere else.

On success the route SHALL return 201. The body SHALL carry the created
`{ userId, email, roles, disabled, managerUserId, displayName }`.
`auth_users.email` carries a `UNIQUE NOT NULL` constraint. When that
constraint rejects the insert, the route SHALL return 409. No existence check
ahead of the insert races that constraint.

#### Scenario: Creating a user

- **WHEN** an actor holding `system:admin` requests `POST /admin/users` with
  `{ "email": "jane@co.com", "password": "temp-pw-1", "roles":
  ["finance:approver"] }`
- **THEN** the response is 201, the returned user's `email` is
  `jane@co.com`, `roles` is `["finance:approver"]`, `disabled` is `false`,
  and the account can log in with that password

#### Scenario: Creating a user with no roles

- **WHEN** an actor requests `POST /admin/users` with no `roles` field
- **THEN** the response is 201 and the created user's `roles` is `[]`

#### Scenario: A created account's display name is its email

- **WHEN** an actor requests `POST /admin/users`
- **THEN** the response's `displayName` equals the submitted `email`, and
  `auth_users.display_name` holds `NULL` for that row

#### Scenario: The route refuses a duplicate email

- **WHEN** an actor requests `POST /admin/users` naming an `email` another
  `auth_users` row already holds
- **THEN** the response is 409 and the route writes no second row

#### Scenario: The route refuses a missing email or password

- **WHEN** a `POST /admin/users` request omits `email`, omits `password`, or
  sends either as an empty string after trimming
- **THEN** the response is 400 and the route writes no row

#### Scenario: The route refuses an email that is no valid address

- **WHEN** a `POST /admin/users` request carries the `email` `max.muster`, or
  an `email` with a CR and an LF in it
- **THEN** the response is 400 and the route writes no row

#### Scenario: The route refuses an out-of-bounds role set

- **WHEN** a `POST /admin/users` request carries a `roles` entry longer than
  64 characters, or more than 64 entries
- **THEN** the response is 400 and the route writes no row

#### Scenario: The route refuses an actor without the role

- **WHEN** an actor whose resolvable credential's `roles` omits
  `system:admin` requests `POST /admin/users`
- **THEN** the response is 403 and the route writes no row
