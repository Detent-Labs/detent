## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
<!-- antislop: allow synonym-rotation -->
### Requirement: Users are listable by an operator over HTTP

`src/auth/users.ts` SHALL expose `listUsers(db)`, returning every row of
`auth_users` as `{ userId, email, roles, disabled, managerUserId,
displayName }`, excluding
`password_hash`. `displayName` SHALL be the resolved value the
`local-user-accounts` capability defines (`COALESCE(display_name, email)`),
never null or empty. The engine SHALL expose this as `GET /admin/users`,
gated by `system:admin` through the same `requireRole` check every other
`/admin/*` route uses. The route SHALL NOT page or filter the list.
`auth_users` stays small: the CLI provisions it, not self-service
registration.

#### Scenario: Listing users

- **WHEN** an actor holding `system:admin` requests `GET /admin/users`
- **THEN** the response is 200 with every user's `userId`, `email`, `roles`,
  `disabled` state, `managerUserId`, and resolved `displayName`

#### Scenario: A user with no display name lists with their email

- **WHEN** `GET /admin/users` lists a user whose `display_name` is `NULL`
- **THEN** that row's `displayName` equals that user's `email`

#### Scenario: Password hashes are never returned

- **WHEN** someone requests `GET /admin/users`
- **THEN** no entry in the response carries a `password_hash` or any other
  form of the stored credential

#### Scenario: The listing route refuses an actor without the role

- **WHEN** someone requests `GET /admin/users` with a resolvable credential
  whose `roles` does not include `system:admin`
- **THEN** the response is 403 and no query runs

## ADDED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: A user's display name is settable over HTTP

This requirement's name mirrors two siblings above. Those are "A user's
roles are assignable over HTTP" and "A user's manager is assignable over
HTTP". All three sit on the same `system:admin`-gated route table.

`src/auth/users.ts` SHALL expose a function setting `auth_users.display_name`
for the row matching `user_id = $1`. It SHALL return the updated user
summary, including the resolved `displayName`. It SHALL return `undefined`
when no such `userId` exists.

The engine SHALL expose this as `PATCH /admin/users/:id/name`, gated by
`system:admin` through the same `requireRole` check every other `/admin/*`
route uses. The request body SHALL be `{ displayName: string | null }`.
`null` SHALL clear `display_name` back to `NULL`, so the resolved value
falls back to that user's email.

The route SHALL trim the submitted `displayName` before storing it. It SHALL
reject, with 400, a non-null `displayName` that is empty after trimming or
longer than 200 characters. Neither rejection SHALL write a row.

The route SHALL return 200 with the updated row on success. It SHALL return
404 when the target user does not exist.

#### Scenario: Setting a display name

- **WHEN** an actor holding `system:admin` requests `PATCH
  /admin/users/:id/name` for an existing user, with `{ "displayName": "Rita
  Alvarez" }`
- **THEN** the response is 200, the returned row's `displayName` is `"Rita
  Alvarez"`, and `auth_users.display_name` holds that value

#### Scenario: Clearing a display name falls back to email

- **WHEN** someone requests `PATCH /admin/users/:id/name` with `{
  "displayName": null }` for a user whose email is `rita@example.com`
- **THEN** the response is 200, `auth_users.display_name` is `NULL`, and the
  returned row's resolved `displayName` is `"rita@example.com"`

#### Scenario: The route trims surrounding whitespace before storage

- **WHEN** someone requests `PATCH /admin/users/:id/name` with `{
  "displayName": "  Rita Alvarez  " }`
- **THEN** the response is 200 and `auth_users.display_name` holds `"Rita
  Alvarez"`, without the surrounding whitespace

#### Scenario: The route refuses an empty display name

- **WHEN** someone requests `PATCH /admin/users/:id/name` with `{
  "displayName": "   " }`
- **THEN** the response is 400 and no row changes

#### Scenario: The route refuses an over-long display name

- **WHEN** a `PATCH /admin/users/:id/name` request carries a `displayName`
  longer than 200 characters
- **THEN** the response is 400 and no row changes

#### Scenario: Setting a display name on an unknown user

- **WHEN** someone requests `PATCH /admin/users/:id/name` for a `userId`
  absent from `auth_users`
- **THEN** the response is 404 and no row changes

#### Scenario: The name route refuses an actor without the role

- **WHEN** someone requests `PATCH /admin/users/:id/name` with a resolvable
  credential whose `roles` does not include `system:admin`
- **THEN** the response is 403 and no row changes
