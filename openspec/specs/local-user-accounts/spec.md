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
creating a user, changing a password, or assigning roles — those stay
CLI-only. Listing users and toggling `disabled` are the one carve-out,
reachable over HTTP through the `system:admin`-gated `admin-user-management`
capability.
## Requirements
### Requirement: Local users are persisted in an auth_users table

The engine SHALL create an `auth_users` table as part of the existing
`initSchema` DDL in `src/engine/store.ts`, alongside the other tables:

```sql
auth_users (
  user_id         text primary key,
  email           text unique not null,
  password_hash   text not null,
  roles           text[] not null default '{}',
  disabled        boolean not null default false,
  manager_user_id text references auth_users(user_id) on delete set null
)
```

`user_id` SHALL be the value used as `Actor.id`, the same value that appears in
`assignment.candidates`, `assignment.claimedBy` and `startedBy`. The table SHALL
be additive: an installation that never sets an auth environment variable is
unaffected by its presence.

`manager_user_id` SHALL be added by a statement changing an already-created
table. `CREATE TABLE IF NOT EXISTS` does not touch one that exists. A database
predating this change SHALL gain the column on the next start, with `NULL` in
every existing row. The `manager-of-starter-assignment` capability defines what
the column means and what reads it.

#### Scenario: The table is created by initSchema

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: Email is unique

- **WHEN** a second user is created with an email already present in
  `auth_users`
- **THEN** the creation fails and no second row is written

#### Scenario: An existing database gains the manager column

- **WHEN** `initSchema` runs against a database whose `auth_users` was created
  before this change
- **THEN** the table has `manager_user_id` and every pre-existing row holds
  `NULL`

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

Indistinguishability SHALL hold for the response *time* as well as the
response *value*. `verifyLogin` SHALL therefore perform exactly one password
verification on every path, including the no-row path. When no row matches,
it SHALL verify the submitted password against a process-lifetime dummy
argon2id hash.

This dummy hash comes from a random value with the same cost parameters as a
stored hash. Verification then fails regardless. `verifyLogin` SHALL NOT
return before this verification. That early-return shape made an unknown
email roughly two orders of magnitude faster than a known one.

#### Scenario: A disabled user cannot log in

- **WHEN** `verifyLogin` is called with the correct password of a user whose
  `disabled` flag is true
- **THEN** verification fails

#### Scenario: An unknown email fails identically to a wrong password

- **WHEN** the login route is called with an email that exists in no row, and
  separately with an existing email and a wrong password
- **THEN** both responses are the same generic `401` with the same body

#### Scenario: An unknown email still performs a password verification

- **WHEN** `verifyLogin` is called with an email that matches no row
- **THEN** a password verification against the dummy hash is performed before
  it returns, so the unknown-email path does no less work than the
  known-email path

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
reached. This limiter is per-process and in-memory, and it does not
coordinate across multiple server processes. Normalization
(trimming and lowercasing) SHALL apply only to the tracking key; the value
passed to `verifyLogin` SHALL remain the request's original, unmodified
`email` string.

`handleLogin` SHALL apply a second window, keyed on the caller's address, with
its own threshold and the same `WINDOW_MS`. A request SHALL pass both windows
to reach `verifyLogin`, and either one over its threshold SHALL return the
same `429`. The per-address threshold SHALL be high enough that an office
behind one address does not reach it in ordinary use. It bounds the
credential-stuffing case the per-email window cannot see: one password tried
against many accounts.

`handleLogin` SHALL check the address window first, before the email window
records anything. A caller past its address threshold therefore never reaches
the email map. That is what stops one caller from filling that map. The
memory-footprint requirement below rests on this ordering.

A successful login SHALL NOT clear the address window, though it clears the
email one. Clearing it would let a caller who holds one valid account reset
that window whenever they choose. That caller could then try one password
against every other account for free.

#### Scenario: A success does not reset the address window

- **WHEN** one address reaches its threshold of recorded attempts, and it
  holds one valid account. It logged in to that account inside the window
- **THEN** the next request from that address still returns `429`

The caller's address SHALL come from the connection's peer. When the deployment
sets `TRUST_PROXY` to `1`, that address SHALL come from the `X-Forwarded-For`
header instead. The proxy in front of the engine overwrites that header.
Without that variable the server SHALL ignore that header, because any caller
can send it. When the server can determine no address, the second window SHALL
NOT apply, and the per-email window SHALL still apply.

`X-Forwarded-For` holds a comma-separated list. The server SHALL read the
last entry, trimmed, and SHALL ignore every entry in front of it. A proxy
that appends rather than overwrites leaves the caller's own submitted value
in front of its own. Reading the first entry would therefore hand the bucket
key back to the caller. A header the proxy overwrites holds one entry, where
the last entry is that entry.

A request carrying no such header under `TRUST_PROXY` reached this process
without passing the proxy. Its peer is therefore the caller rather than the
proxy. The server SHALL fall back to the peer, which counts that request
rather than exempting it from the window.

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

#### Scenario: One address trying many emails is limited

- **WHEN** one address submits login attempts for many distinct
  emails, past the per-address threshold, inside one window
- **THEN** the next request from that address returns `429`, whatever email
  it names, and `verifyLogin` is not invoked for it

#### Scenario: A spoofed forwarding header is ignored by default

- **WHEN** `TRUST_PROXY` is unset and a caller sends a different
  `X-Forwarded-For` value on every request
- **THEN** every one of those requests counts against the same peer address,
  and the header changes nothing

#### Scenario: A trusted proxy supplies the address

- **WHEN** `TRUST_PROXY` is `1` and the request carries an
  `X-Forwarded-For` value
- **THEN** the per-address window counts against that value, not against the
  proxy's own address

#### Scenario: Entries in front of the proxy's own are ignored

- **WHEN** `TRUST_PROXY` is `1` and a caller sends
  `X-Forwarded-For: <a value it picked>`, which an appending proxy turns into
  `<that value>, <the caller's real address>`
- **THEN** the per-address window counts against the last entry, so the value
  the caller picked changes nothing

### Requirement: Rate-limit tracking has a bounded memory footprint

The tracking map SHALL NOT grow without bound in response to distinct
submitted email values. `checkAndRecordAttempt` populates the map before any
check of whether the corresponding account exists.

Before deciding on capacity, `checkAndRecordAttempt` SHALL remove every entry
whose window started more than `WINDOW_MS` ago. Such an entry carries no
information — it would reset on its next use. Removing it therefore costs
nothing, and it reclaims the slots an intermittent caller left behind.

This sweep SHALL run only on the path where a not-yet-tracked email meets a
full map. It does not run on every request. It SHALL also stay inside the
same synchronous, `await`-free function. This keeps check and increment
atomic against concurrent requests for one email.

The sweep can still leave the map full of live windows.
`checkAndRecordAttempt` SHALL then evict the entry whose window started
earliest. It SHALL track the new email in the slot that frees. It SHALL NOT
refuse the request.

The earlier rule refused it, and gave a reason. Admitting untracked requests
at capacity lets an unauthenticated caller disable the brute-force control
for every account. The per-address window above removes the premise. One
caller can no longer create 50,000 entries inside a window, because the
address window stops that caller first.

What refusal costs is now the larger harm. Every account whose email is not
already tracked loses its login until the window rolls. Eviction costs at most
one untracked try, for the least recently active email.

The same reasoning bounds both directions. An evicted entry belongs to the
oldest window, which is the entry closest to resetting on its own.

The per-address map SHALL carry the same bound, under its own capacity. It
holds one entry per distinct address, and under `TRUST_PROXY` its key
comes from a header. It therefore has the growth this requirement exists to
stop. The email map's sweep, capacity check and earliest-window eviction SHALL
apply to the address map too. This change therefore closes one unbounded map
and does not open a second.

#### Scenario: The address map is bounded the same way

- **WHEN** the per-address map holds its capacity in live windows, and a
  request arrives from a not-yet-tracked address
- **THEN** the sweep removes the expired entries. If the map is still full,
  `checkAndRecordAttempt` evicts the entry with the earliest window start.
  It tracks the new address in the slot that frees

#### Scenario: Expired entries are reclaimed before capacity is judged

- **WHEN** the tracking map holds `MAX_TRACKED_EMAILS` entries of which some
  windows have expired, and a login attempt arrives for a not-yet-tracked
  email
- **THEN** the expired entries are removed and the new email is tracked
  normally, subject to the ordinary 5-per-15-minutes rule

#### Scenario: A map full of live windows evicts the oldest

- **WHEN** the tracking map holds `MAX_TRACKED_EMAILS` entries whose windows
  are all still live, and a login attempt arrives for a not-yet-tracked email
- **THEN** `checkAndRecordAttempt` removes the entry with the earliest window
  start and tracks the new email. The request reaches `verifyLogin`, subject
  to the per-address window

#### Scenario: Already-tracked emails are unaffected by capacity

- **WHEN** the tracking map is at `MAX_TRACKED_EMAILS` capacity
- **THEN** login attempts for emails already present in the map continue to
  be rate-limited normally

#### Scenario: A flood cannot permanently disable the control

- **WHEN** a caller fills the map with distinct email values and then stops
- **THEN** after `WINDOW_MS` those entries no longer count toward capacity,
  and the map returns to its ordinary state

#### Scenario: A flood from one address is stopped before it fills the map

- **WHEN** one address submits distinct email values as fast as it can
- **THEN** the per-address window rejects that caller once it passes the
  per-address threshold. The map does not reach capacity from that caller

### Requirement: Users are administered from a CLI, never over HTTP

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`). It SHALL create a user, set that user's
roles, change a user's password, and set that user's manager.

The engine SHALL expose no HTTP route that creates a user, changes a password, or
registers anyone. It SHALL provide no registration flow, no password-reset flow
and no MFA flow.

Four actions ARE reachable over HTTP. Those are listing users, toggling a user's
`disabled` state, assigning a user's roles, and setting a user's manager. The
`admin-user-management` capability defines five `system:admin`-gated routes for
them.

- `GET /admin/users`
- `POST /admin/users/:id/disable`
- `POST /admin/users/:id/enable`
- `PATCH /admin/users/:id/roles`
- `PATCH /admin/users/:id/manager`

This is the carve-out from CLI-only administration. Creating a user and setting
a password stay outside it. Neither one is reachable except from the CLI.

#### Scenario: A user is created from the CLI

- **WHEN** the CLI's `add-user` command is run with an email, a password and
  roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a
  hash that verifies the given password

#### Scenario: A manager is set from the CLI

- **WHEN** the CLI's manager command is run with a user's email and another
  account's email
- **THEN** that user's `manager_user_id` holds the second account's `user_id`

#### Scenario: No route creates a user or changes a password

- **WHEN** the server's route table is inspected
- **THEN** no route creates a user or sets a password
- **AND** the account-administration routes are exactly the five this
  requirement lists

#### Scenario: A user disabled via the new HTTP route cannot log in

- **WHEN** a user is disabled via `POST /admin/users/:id/disable` and then tries
  to log in
- **THEN** `verifyLogin` rejects the try
- **AND** it rejects it exactly as for a user disabled by any other means
- **AND** this matches the pre-existing "A disabled user cannot log in" scenario

#### Scenario: The CLI and the route write the same column

- **WHEN** `PATCH /admin/users/:id/roles` sets a user's roles
- **AND** the CLI or a login then reads that user's roles
- **THEN** the value read is the one the route wrote, from the same column

