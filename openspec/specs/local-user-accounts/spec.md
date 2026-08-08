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
not become an identity provider: no registration, no self-service password
reset, no MFA, no session store, no refresh tokens and no revocation list.
Eight account-administration routes under `/admin/users` carry every account
write. They list users, create one, toggle `disabled`, assign roles, a manager
and a display name, and set a password, all through the `system:admin`-gated
`admin-user-management` capability. The CLI keeps its own email-keyed commands
beside them.
## Requirements
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
  display_name    text,
  locale          text
)
```

`Actor.id` SHALL equal `user_id`. `assignment.candidates`,
`assignment.claimedBy` and `startedBy` SHALL carry that same value. The
table SHALL stay additive: an installation that never sets an auth
environment variable never touches it.

A migration SHALL add `manager_user_id`, `display_name` and `locale` to an
already-created table, since `CREATE TABLE IF NOT EXISTS` skips a table that
exists already. That migration SHALL leave `NULL` in all three columns on
every pre-existing row. The `manager-of-starter-assignment` capability
defines what `manager_user_id` means. This capability defines what
`display_name` means and how it resolves (see "A user's display name
resolves to a non-empty value"). The `account-self-service` capability
defines what `locale` means and how a caller sets it.

#### Scenario: initSchema creates the table

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: Email stays unique

- **WHEN** someone creates a second user with an email already stored in
  `auth_users`
- **THEN** the creation fails and no second row exists afterward

#### Scenario: An existing database gains the manager and display-name columns

- **WHEN** `initSchema` runs against a database whose `auth_users`
  predates the `manager_user_id` and `display_name` columns
- **THEN** the table has `manager_user_id` and `display_name`, and every
  pre-existing row holds `NULL` in both

#### Scenario: An existing database gains the locale column

- **WHEN** `initSchema` runs against a database whose `auth_users`
  predates the `locale` column
- **THEN** the table has `locale`, and every pre-existing row holds `NULL`
  in it

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

<!-- antislop: allow passive-voice -->
### Requirement: Account administration is reachable over HTTP, and the CLI keeps its own path

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`). It SHALL create a user, set that user's
roles, change a user's password, and set that user's manager. It SHALL also set
that user's display name. Each command SHALL keep its email key. A person at a
terminal types an address, not a `user_id`.

`add-user` SHALL accept an optional trailing display-name argument.
`createUser` trims that argument the same way for every caller, per the
requirement above. A whitespace-only value from the CLI therefore leaves
`display_name` `NULL`, the same as an omitted argument.

The engine SHALL provide no registration flow, no self-service password-reset
flow and no MFA flow. No route SHALL let an unauthenticated caller create an
account or set a password.

Eight routes SHALL administer accounts over HTTP. The `admin-user-management`
capability defines them, and `system:admin` gates each one.

- `GET /admin/users`
- `POST /admin/users`
- `POST /admin/users/:id/disable`
- `POST /admin/users/:id/enable`
- `PATCH /admin/users/:id/roles`
- `PATCH /admin/users/:id/manager`
- `PATCH /admin/users/:id/name`
- `POST /admin/users/:id/password`

The CLI SHALL stay the recovery path for a deployment where no account holds
`system:admin`. That state locks all eight routes, and a shell is what remains.

#### Scenario: The CLI creates a user

- **WHEN** the CLI's `add-user` command runs with an email, a password and roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a hash
  that verifies the given password

#### Scenario: The CLI creates a user with a display name

- **WHEN** the CLI's `add-user` command runs with an email, a password, roles,
  and a display name
- **THEN** a row exists in `auth_users` holding that trimmed display name

#### Scenario: A whitespace-only display name from the CLI resolves to email

- **WHEN** the CLI's `add-user` or `set-name` command runs with a
  whitespace-only string as the display name
- **THEN** that user's `display_name` is `NULL`, not an empty string, and the
  resolved display name is that user's email

#### Scenario: The CLI sets a manager

- **WHEN** the CLI's manager command runs with a user's email and another
  account's email
- **THEN** that user's `manager_user_id` holds the second account's `user_id`

#### Scenario: The CLI sets a display name

- **WHEN** the CLI's `set-name` command runs with a user's email and a display
  name
- **THEN** that user's `display_name` holds the trimmed value

#### Scenario: No route outside the admin gate creates an account

- **WHEN** a reader walks the server's route table
- **THEN** no route creates a user or sets a password outside the eight this
  requirement lists
- **AND** each of those eight refuses an actor whose roles omit `system:admin`

#### Scenario: No route registers a caller

- **WHEN** an unauthenticated caller looks for a registration route
- **THEN** the server's route table holds none

#### Scenario: The HTTP disable route stops a login

- **WHEN** `POST /admin/users/:id/disable` disables a user, and that user then
  tries to log in
- **THEN** `verifyLogin` rejects the try
- **AND** it rejects it exactly as for a user any other path disabled

#### Scenario: The CLI and the route write the same column

- **WHEN** `PATCH /admin/users/:id/roles` sets a user's roles
- **AND** the CLI or a login then reads that user's roles
- **THEN** the value read is the one the route wrote, from the same column

#### Scenario: The CLI and the route store a password the same way

- **WHEN** the CLI's `set-password` sets a password for one account
- **AND** `POST /admin/users/:id/password` sets a password for another account
- **THEN** each row holds a `Bun.password.hash` result, and a login verifies both

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
