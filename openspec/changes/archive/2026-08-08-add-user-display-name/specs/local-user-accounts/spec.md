## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: Local users are persisted in an auth_users table

The engine creates an `auth_users` table in `initSchema`
(`src/engine/store.ts`), alongside the other tables:

```sql
auth_users (
  user_id         text primary key,
  email           text unique not null,
  password_hash   text not null,
  roles           text[] not null default '{}',
  disabled        boolean not null default false,
  manager_user_id text references auth_users(user_id) on delete set null,
  display_name    text
)
```

`Actor.id` SHALL equal `user_id`. `assignment.candidates`,
`assignment.claimedBy` and `startedBy` SHALL carry that same value. The table
SHALL stay additive: an installation that never sets an auth environment
variable never touches it.

A migration SHALL add `manager_user_id` and `display_name` to an
already-created table, since `CREATE TABLE IF NOT EXISTS` skips a table that
exists already. That migration SHALL leave `NULL` in both columns on every
pre-existing row. The `manager-of-starter-assignment` capability defines what
`manager_user_id` means. This capability defines what `display_name` means
and how it resolves (see "A user's display name resolves to a non-empty
value").

#### Scenario: initSchema creates the table

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: Email stays unique

- **WHEN** someone creates a second user with an email already stored in
  `auth_users`
- **THEN** the creation fails and no second row exists afterward

#### Scenario: An existing database gains the manager and display-name columns

- **WHEN** `initSchema` runs against a database whose `auth_users` predates
  this change
- **THEN** the table has `manager_user_id` and `display_name`, and every
  pre-existing row holds `NULL` in both

<!-- antislop: allow passive-voice -->
### Requirement: Passwords are hashed with argon2id and verified against the stored hash

`src/auth/users.ts` SHALL expose `createUser` and `verifyLogin`. `createUser`
SHALL store only an argon2id hash `Bun.password` produces, never the
plaintext password. It SHALL accept an optional display name and trim that
value. It SHALL store `NULL` when the trimmed result is empty or the caller
omits the argument. Otherwise it SHALL store the trimmed value.

`verifyLogin` SHALL verify a submitted password against the stored hash
with `Bun.password.verify`. On success it SHALL return the user's
`user_id` and `roles`. It SHALL also return the resolved display name (see
"A user's display name resolves to a non-empty value").

#### Scenario: A created user's password verifies

- **WHEN** someone creates a user with a password, then calls `verifyLogin`
  with that user's email and the same password
- **THEN** verification succeeds and returns that user's `user_id`, `roles`,
  and resolved display name

#### Scenario: A wrong password fails verification

- **WHEN** someone calls `verifyLogin` with a valid email and an incorrect
  password
- **THEN** verification fails and returns no identity

#### Scenario: The stored hash never equals the plaintext password

- **WHEN** someone creates a user
- **THEN** the stored `password_hash` is an argon2id hash, and it does not
  equal the submitted password

### Requirement: POST /auth/login issues an 8-hour locally-signed token

`src/auth/login.ts` SHALL provide a `POST /auth/login` handler in the existing
`HttpResult` shape. It SHALL read a JSON body `{ email, password }` and call
`verifyLogin`. On success it SHALL sign a JWT with `AUTH_JWT_SECRET` carrying
`iss: "bps"`, `sub: <user_id>`, the user's roles, and an `exp` 8 hours ahead.
It SHALL return `200` with `{ token, expiresAt, actor: { id, roles,
displayName } }`. `displayName` SHALL equal the resolved value `verifyLogin`
returns, never null or empty. A rejected login SHALL return `401`. No token
refresh, rotation or revocation mechanism SHALL exist.

#### Scenario: A valid login returns a usable token

- **WHEN** someone calls `POST /auth/login` with a correct email and password
- **THEN** the response is `200` with a `token`, an `expiresAt` 8 hours ahead,
  and the `actor` that token resolves to, including a non-empty
  `displayName`

#### Scenario: The issued token authenticates a subsequent request

- **WHEN** a caller presents a token obtained from `/auth/login` as
  `Authorization: Bearer <token>` on another route
- **THEN** the request resolves to the same `Actor` and proceeds

#### Scenario: A wrong password returns a generic 401

- **WHEN** someone calls `POST /auth/login` with a valid email and an
  incorrect password
- **THEN** the response is `401` and discloses nothing about the account

<!-- antislop: allow passive-voice -->
### Requirement: Users are administered from a CLI, never over HTTP

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`). It SHALL create a user, set that
user's roles, change a user's password, and set that user's manager. It
SHALL also set that user's display name. `add-user` SHALL accept an optional
trailing display-name argument. `createUser` trims that argument the same
way for every caller, per the requirement above. A whitespace-only value
from the CLI therefore leaves `display_name` `NULL`, the same as an
omitted argument.

The engine SHALL expose no HTTP route that creates a user, changes a
password, or registers anyone. No registration flow, password-reset flow or
MFA flow SHALL exist.

<!-- antislop: allow synonym-rotation -->
Five actions on another account ARE reachable over HTTP, all of them under
`/admin/users`. Those are listing users, toggling a user's `disabled` state,
and assigning a user's roles. They also include setting a user's manager and
setting a user's display name. The `admin-user-management` capability defines
six `system:admin`-gated routes for them. "User" names the account
administered here.

- `GET /admin/users`
- `POST /admin/users/:id/disable`
- `POST /admin/users/:id/enable`
- `PATCH /admin/users/:id/roles`
- `PATCH /admin/users/:id/manager`
- `PATCH /admin/users/:id/name`

This is the carve-out from CLI-only administration. Creating a user and
setting a password stay outside it. Only the CLI reaches either one.

#### Scenario: The CLI creates a user

- **WHEN** someone runs the CLI's `add-user` command with an email, a
  password and roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a
  hash that verifies the given password

#### Scenario: The CLI creates a user with a display name

- **WHEN** someone runs the CLI's `add-user` command with an email, a
  password, roles, and a display name
- **THEN** a row exists in `auth_users` holding that trimmed display name

#### Scenario: A whitespace-only display name from the CLI resolves to email

- **WHEN** someone runs the CLI's `add-user` or `set-name` command with a
  whitespace-only string as the display name
- **THEN** that user's `display_name` is `NULL`, not an empty string, and
  the resolved display name is that user's email

#### Scenario: The CLI sets a manager

- **WHEN** someone runs the CLI's manager command with a user's email and
  another account's email
- **THEN** that user's `manager_user_id` holds the second account's
  `user_id`

#### Scenario: The CLI sets a display name

- **WHEN** someone runs the CLI's `set-name` command with a user's email and
  a display name
- **THEN** that user's `display_name` holds the trimmed value

#### Scenario: No route creates a user or changes a password

- **WHEN** the server's route table shows every registered route
- **THEN** no route creates a user or sets a password. The operator-facing
  account-administration routes under `/admin/users` are exactly the six this
  requirement lists

#### Scenario: A user disabled via the HTTP route cannot log in

- **WHEN** someone disables a user via `POST /admin/users/:id/disable`, then
  that user tries to log in
- **THEN** `verifyLogin` rejects the try exactly as it rejects a user
  disabled by any other means. This matches the pre-existing "A disabled
  user cannot log in" scenario

#### Scenario: The CLI and the route write the same column

- **WHEN** `PATCH /admin/users/:id/roles` sets a user's roles, and the CLI or
  a login then reads that user's roles
- **THEN** the read returns the value the route wrote, from the same column

## ADDED Requirements

### Requirement: A user's display name resolves to a non-empty value

`src/auth/users.ts` SHALL resolve every user's displayable name from one
place, as `COALESCE(display_name, email)`. Every caller reading a
displayable name, `verifyLogin`, `listUsers`, and any later function for the
same purpose alike, SHALL use that one resolution. None SHALL compute a
resolution of its own. The resolved value SHALL never be `NULL` or an empty
string.

#### Scenario: A user with no display name resolves to their email

- **WHEN** a caller resolves the displayable name of a user whose
  `display_name` is `NULL`
- **THEN** the resolved value equals that user's `email`

#### Scenario: A user with a display name resolves to it

- **WHEN** a caller resolves the displayable name of a user whose
  `display_name` holds a non-null string
- **THEN** the resolved value equals that string, not the email

### Requirement: Every write path bounds the display name at 200 characters

`src/auth/users.ts` SHALL normalize a display name from one place. That
place SHALL trim the value. It SHALL also refuse a trimmed value longer than
200 characters. Every write path SHALL use it. That covers `createUser`, the
two setters below, and the self-service account write.

A refusal SHALL raise an error the `src/auth` layer declares, not an HTTP
error type. The two routes that accept a display name SHALL check the bound
before they write. Each therefore answers `400`, and neither reaches that
error. The CLI SHALL report the error message and exit non-zero.

#### Scenario: The CLI refuses a display name past the bound

- **WHEN** someone runs the CLI's `set-name` command with a display name
  longer than 200 characters
- **THEN** the command reports the refusal, exits non-zero, and that user's
  `display_name` holds the value it held before

#### Scenario: A display name of exactly 200 characters reaches the column

- **WHEN** someone sets a display name of exactly 200 characters
- **THEN** the column holds that value
