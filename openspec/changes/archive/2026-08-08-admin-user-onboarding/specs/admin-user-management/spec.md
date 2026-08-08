## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
### Requirement: Users are listable by an operator over HTTP

`src/auth/users.ts` SHALL expose `listUsers(page, db)` returning a `Page` of
`auth_users` rows as `{ userId, email, roles, disabled, managerUserId, displayName }`,
excluding `password_hash`. `displayName` SHALL be the resolved value the
`local-user-accounts` capability defines (`COALESCE(display_name, email)`),
never null or empty. `GET /admin/users` SHALL expose this read, gated by
`system:admin` through the same `requireRole` check every other `/admin/*`
route uses.

The route SHALL translate `limit` and `cursor` query parameters, the same
way `GET /admin/outbox` and `GET /admin/timers` do. A `limit` that is not a
positive integer SHALL fail as a request error. The route SHALL cap `limit`
at `MAX_LIST_LIMIT`. An absent `limit` SHALL default to 50, the same
default `listOutbox` and `listPendingTimers` apply. The list SHALL stay
ordered by `email` ascending, keyset-paged on `(email, user_id)` to break
ties between two accounts sharing no email.

#### Scenario: Listing users

- **WHEN** an actor holding `system:admin` requests `GET /admin/users`
- **THEN** the response is 200 with a page of users, each carrying `userId`,
  `email`, `roles`, `disabled`, `managerUserId` and `displayName`

#### Scenario: A user with no display name lists with their email

- **WHEN** `GET /admin/users` lists a user whose `display_name` is `NULL`
- **THEN** that row's `displayName` equals that user's `email`

#### Scenario: Password hashes are never returned

- **WHEN** an actor requests `GET /admin/users`
- **THEN** no entry in the response carries a `password_hash` or any other
  form of the stored credential

#### Scenario: The route refuses an actor without the role

- **WHEN** an actor whose resolvable credential's `roles` omits
  `system:admin` requests `GET /admin/users`
- **THEN** the response is 403 and the route runs no query

#### Scenario: Paging

- **WHEN** an actor requests `GET /admin/users?limit=2` and more than two
  accounts exist
- **THEN** the response carries two users and a cursor. The same route with
  that cursor carries the following users, in `email` order

#### Scenario: An absent limit defaults to 50

- **WHEN** an actor requests `GET /admin/users` with no `limit` and more
  than 50 accounts exist
- **THEN** the response carries 50 users and a cursor

## ADDED Requirements

### Requirement: An operator can create a user account over HTTP

`src/auth/users.ts` SHALL expose the existing `createUser(email, password,
roles, displayName, db)`, unchanged. `POST /admin/users` SHALL expose it,
gated by `system:admin`. Every other `/admin/*` route enforces that role
through the same `requireRole` check.

The request body SHALL be `{ email: string, password: string, roles?:
string[] }`. `email` and `password` SHALL each be non-empty after trimming.

A `roles` array the body carries SHALL pass the same bounds `PATCH
/admin/users/:id/roles` already enforces. Each entry SHALL be a non-empty
string of at most 64 characters after trimming. The array SHALL hold at most
64 entries. The route SHALL deduplicate `roles` on first occurrence.
`roles` SHALL default to an empty array when the request omits it.

The route SHALL enforce no minimum length or character-set rule on
`password`. `Bun.password.hash` accepts any input. This route adds no check
the rest of the system lacks.

The request body SHALL carry no display name. The route SHALL store none.
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

#### Scenario: The route refuses an out-of-bounds role set

- **WHEN** a `POST /admin/users` request carries a `roles` entry longer than
  64 characters, or more than 64 entries
- **THEN** the response is 400 and the route writes no row

#### Scenario: The route refuses an actor without the role

- **WHEN** an actor whose resolvable credential's `roles` omits
  `system:admin` requests `POST /admin/users`
- **THEN** the response is 403 and the route writes no row

### Requirement: An operator can reset a user's password over HTTP

`src/auth/users.ts` SHALL expose `setPasswordById(userId, password, db)`,
keyed by `userId` like `setDisabled`/`setRolesById`/`setManagerById`. It
SHALL hash `password` with `Bun.password.hash` and set
`auth_users.password_hash` for the row matching `user_id = $1`. It SHALL
return the updated `{ userId, email, roles, disabled, managerUserId, displayName }`, or
`undefined` when no such `userId` exists. The existing `setPassword(email,
password, db)` SHALL keep its behavior and its email key, since
`src/auth/cli.ts` calls it.

`POST /admin/users/:id/password` SHALL expose `setPasswordById`, gated by
`system:admin`. The request body SHALL be `{ password: string }`, non-empty
after trimming. The route SHALL enforce no minimum length or character-set
rule, the same as account creation.

On success the route SHALL return 200 with the updated row. When
`setPasswordById` returns `undefined`, the route SHALL return 404. When
`password` is absent or empty after trimming, the route SHALL return 400.

Resetting a password SHALL NOT revoke a token already issued to that user. A
JWT carries no password-derived claim. An outstanding token keeps
authenticating until it expires, or until an operator disables the account.
The route SHALL NOT write to `disabled`.

#### Scenario: Resetting a password

- **WHEN** an actor holding `system:admin` requests `POST
  /admin/users/:id/password` for an existing user, with `{ "password":
  "new-pw-1" }`
- **THEN** the response is 200, and that user's next login with `new-pw-1`
  succeeds

#### Scenario: The old password stops working

- **WHEN** an operator resets a user's password
- **THEN** a login try with the previous password fails

#### Scenario: A token issued before the reset keeps authenticating

- **WHEN** a user logs in and an operator then resets their password
- **AND** that user presents the token issued before the reset to a route it
  already authorized
- **THEN** the request succeeds, unaffected by the reset

#### Scenario: Resetting an unknown user's password

- **WHEN** an actor requests `POST /admin/users/:id/password` for a
  `userId` absent from `auth_users`
- **THEN** the response is 404 and the route writes no row

#### Scenario: The route refuses an empty password

- **WHEN** a `POST /admin/users/:id/password` request sends `{ "password":
  "" }` or `{ "password": "   " }`
- **THEN** the response is 400 and the stored hash stays unchanged

#### Scenario: The route refuses an actor without the role

- **WHEN** an actor whose resolvable credential's `roles` omits
  `system:admin` requests `POST /admin/users/:id/password`
- **THEN** the response is 403 and the stored hash stays unchanged
