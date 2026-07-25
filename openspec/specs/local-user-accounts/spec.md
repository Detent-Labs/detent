# local-user-accounts Specification

## Purpose

Project-local BPS user accounts for deployments with no external identity
provider: the `auth_users` table, argon2id password hashing/verification
(`src/auth/users.ts`, via `Bun.password` — no added dependency), the
`POST /auth/login` route and its 8-hour token issuance (signed for the
`jwt-authentication` capability's local `"bps"` issuer), the generic-401
non-disclosure rule shared by an unknown email, a wrong password and a
disabled account, and the user-management CLI (`src/auth/cli.ts`). The
engine does not become an identity provider: no registration, password
reset, MFA, session store, refresh tokens or revocation list, and no HTTP
route for creating, modifying or listing users — administration is CLI-only.

## Requirements

### Requirement: Local users are persisted in an auth_users table

The engine SHALL create an `auth_users` table as part of the existing
`initSchema` DDL in `src/engine/store.ts`, alongside the other tables:

```sql
auth_users (
  user_id       text primary key,
  email         text unique not null,
  password_hash text not null,
  roles         text[] not null default '{}',
  disabled      boolean not null default false
)
```

`user_id` SHALL be the value used as `Actor.id`, the same value that appears in
`assignment.candidates`, `assignment.claimedBy` and `startedBy`. The table SHALL
be additive: an installation that never sets an auth environment variable is
unaffected by its presence.

#### Scenario: The table is created by initSchema

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: Email is unique

- **WHEN** a second user is created with an email already present in
  `auth_users`
- **THEN** the creation fails and no second row is written

### Requirement: Passwords are hashed with argon2id and verified against the stored hash

`src/auth/users.ts` SHALL expose `createUser` and `verifyLogin`. `createUser`
SHALL store only an argon2id hash produced by `Bun.password`, never the
plaintext password. `verifyLogin` SHALL verify a submitted password against the
stored hash with `Bun.password.verify` and, on success, return the user's
`user_id` and `roles`.

#### Scenario: A created user's password verifies

- **WHEN** a user is created with a password and `verifyLogin` is then called
  with that user's email and the same password
- **THEN** verification succeeds and returns that user's `user_id` and `roles`

#### Scenario: A wrong password does not verify

- **WHEN** `verifyLogin` is called with a valid email and an incorrect password
- **THEN** verification fails and no identity is returned

#### Scenario: No plaintext password is stored

- **WHEN** a user is created
- **THEN** the stored `password_hash` is an argon2id hash and does not equal the
  submitted password

### Requirement: Unknown, wrong-password and disabled logins are indistinguishable

`verifyLogin` SHALL reject a disabled user (`disabled = true`) even when the
password is correct. An unknown email, an incorrect password and a disabled
user SHALL all produce the same generic failure, so that no caller can learn
from a login response which email addresses exist or which accounts are
disabled.

#### Scenario: A disabled user cannot log in

- **WHEN** `verifyLogin` is called with the correct password of a user whose
  `disabled` flag is true
- **THEN** verification fails

#### Scenario: An unknown email fails identically to a wrong password

- **WHEN** the login route is called with an email that exists in no row, and
  separately with an existing email and a wrong password
- **THEN** both responses are the same generic `401` with the same body

### Requirement: POST /auth/login issues an 8-hour locally-signed token

`src/auth/login.ts` SHALL provide a `POST /auth/login` handler in the existing
`HttpResult` shape. Given a JSON body `{ email, password }` it SHALL call
`verifyLogin` and, on success, sign a JWT with `AUTH_JWT_SECRET` carrying
`iss: "bps"`, `sub: <user_id>`, the user's roles, and an `exp` 8 hours in the
future, returning `200` with `{ token, expiresAt, actor: { id, roles } }`. On
failure it SHALL return `401`. There SHALL be no token refresh, rotation or
revocation mechanism.

#### Scenario: A valid login returns a usable token

- **WHEN** `POST /auth/login` is called with a correct email and password
- **THEN** the response is `200` with a `token`, an `expiresAt` 8 hours ahead,
  and the `actor` that token resolves to

#### Scenario: The issued token authenticates a subsequent request

- **WHEN** a token obtained from `/auth/login` is presented as
  `Authorization: Bearer <token>` on another route
- **THEN** the request resolves to the same `Actor` and proceeds

#### Scenario: A wrong password returns a generic 401

- **WHEN** `POST /auth/login` is called with a valid email and an incorrect
  password
- **THEN** the response is `401` and discloses nothing about the account

### Requirement: The login route is not reachable without a signing key

`POST /auth/login` SHALL be registered only when `AUTH_JWT_SECRET` is set. When
it is unset, the route SHALL NOT exist and SHALL respond `404`. There SHALL be
no state in which a login route is reachable without a signing key.

#### Scenario: No signing key means no login route

- **WHEN** the server runs with `AUTH_JWT_SECRET` unset and `POST /auth/login`
  is requested
- **THEN** the response is `404`

### Requirement: Users are administered from a CLI, never over HTTP

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`) to create a user, set that user's roles,
and change a user's password. The engine SHALL expose no HTTP route for
creating, modifying or listing users, and SHALL provide no registration,
password-reset or MFA flow.

#### Scenario: A user is created from the CLI

- **WHEN** the CLI's `add-user` command is run with an email, a password and
  roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a
  hash that verifies the given password

#### Scenario: No user-administration route exists

- **WHEN** the server's route table is inspected
- **THEN** the only auth route is `POST /auth/login`; there is no route that
  creates, updates, or lists users
