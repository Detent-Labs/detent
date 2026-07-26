# local-user-accounts Specification

## Purpose

Project-local BPS user accounts for deployments with no external identity
provider: the `auth_users` table, argon2id password hashing/verification
(`src/auth/users.ts`, via `Bun.password` — no added dependency), the
`POST /auth/login` route and its 8-hour token issuance (signed for the
`jwt-authentication` capability's local `"bps"` issuer), the generic-401
non-disclosure rule shared by an unknown email, a wrong password and a
disabled account, a per-email in-memory rate limiter on repeated login
attempts, and the user-management CLI (`src/auth/cli.ts`). The engine does
not become an identity provider: no registration, password reset, MFA,
session store, refresh tokens or revocation list, and no HTTP route for
creating, modifying or listing users — administration is CLI-only.

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

### Requirement: Repeated failed login attempts for one email are rate-limited

`handleLogin` SHALL track login attempts per normalized email
(`email.trim().toLowerCase()`) in a fixed window: each attempt is recorded
optimistically, before its outcome is known, so the check for whether an
email is currently blocked and the recording of the new attempt happen as
one atomic step. After `MAX_ATTEMPTS` attempts recorded for an email within
`WINDOW_MS`, further login requests for that email within the same window
SHALL return `429` with `{ error: { type: "rate-limited", message } }` and
SHALL NOT call `verifyLogin`. A successful login SHALL clear that email's
recorded attempts entirely, so only unsuccessful attempts ever persist as
counted state. The window SHALL reset (count starts over) once `WINDOW_MS`
has elapsed since the window began, independent of whether the limit was
reached. This limiter is per-process, in-memory, and does not track requests
by IP address or coordinate across multiple server processes. Normalization
(trimming and lowercasing) SHALL apply only to the tracking key; the value
passed to `verifyLogin` SHALL remain the request's original, unmodified
`email` string.

#### Scenario: An email under the limit is unaffected

- **WHEN** `POST /auth/login` is called with a wrong password for an email
  fewer than `MAX_ATTEMPTS` times within the window
- **THEN** each call still reaches `verifyLogin` and returns the existing
  generic `401`

#### Scenario: An email over the limit is rejected without touching verifyLogin

- **WHEN** `POST /auth/login` has already failed `MAX_ATTEMPTS` times for the
  same normalized email within the current window
- **THEN** a further call for that email returns `429` with
  `{ error: { type: "rate-limited", message } }`, and `verifyLogin` is not
  invoked for that call

#### Scenario: A successful login resets the counter

- **WHEN** an email has some failed attempts recorded (fewer than
  `MAX_ATTEMPTS`) and then logs in successfully
- **THEN** the failed-attempt counter for that email is cleared, so a
  subsequent wrong-password attempt is treated as the first failure of a new
  window

#### Scenario: The window rolls over

- **WHEN** an email has reached `MAX_ATTEMPTS` failed attempts and `WINDOW_MS`
  has since elapsed
- **THEN** a further login attempt for that email is evaluated against
  `verifyLogin` again (not rejected with `429`) and starts a new window

#### Scenario: Rate limiting is keyed by email, not by request source

- **WHEN** the same email is used to attempt login `MAX_ATTEMPTS` times from
  different IP addresses within one window
- **THEN** the next attempt for that email is rejected with `429` regardless
  of which IP address it comes from

#### Scenario: Case and whitespace variation in the submitted email do not bypass the limit

- **WHEN** an email reaches `MAX_ATTEMPTS` failed attempts, and a further
  request submits the same address with different letter casing or
  surrounding whitespace (e.g. ` Foo@Bar.com` vs `foo@bar.com`)
- **THEN** the further request is still rejected with `429`, and the email
  value passed to `verifyLogin` is never altered by this normalization (an
  account whose stored email contains uppercase characters is unaffected by
  this requirement and continues to authenticate exactly as before this
  change)

### Requirement: Rate-limit tracking has a bounded memory footprint

The tracking map SHALL NOT grow without bound in response to distinct
submitted email values, since the map is populated before any check of
whether the corresponding account exists. When the map already holds
`MAX_TRACKED_EMAILS` distinct entries and a login request arrives for an
email not already tracked, the engine SHALL NOT add a new entry for it and
SHALL instead let that request proceed to `verifyLogin` untracked, rather
than evicting an existing entry or growing past the cap.

#### Scenario: Tracking stops growing at capacity

- **WHEN** the tracking map already holds `MAX_TRACKED_EMAILS` distinct
  entries
- **THEN** a login attempt for a not-yet-tracked email is not added to the
  map and is evaluated by `verifyLogin` as if no rate limiting existed for
  that request

#### Scenario: Already-tracked emails are unaffected by capacity

- **WHEN** the tracking map is at `MAX_TRACKED_EMAILS` capacity
- **THEN** login attempts for emails already present in the map continue to
  be rate-limited normally

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
