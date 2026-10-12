## MODIFIED Requirements

### Requirement: Repeated failed login attempts for one email are rate-limited

`handleLogin` SHALL track login tries per normalized email
(`email.trim().toLowerCase()`) in a fixed window. It SHALL record each try
before it knows the outcome. The check for a blocked email and the recording of
the new try SHALL happen as one atomic step.

After `MAX_ATTEMPTS` tries for an email within `WINDOW_MS`, further login
requests for that email within the same window SHALL return `429` with
`{ error: { type: "rate-limited", message } }`. They SHALL NOT call
`verifyLogin`. A successful login SHALL clear that email's recorded tries
entirely, so only failed tries persist as counted state. The window SHALL reset
(the count starts over) once `WINDOW_MS` has elapsed since the window began,
whatever the count reached.

The windows SHALL live in the tenant's own database. Every server process of
that tenant shares them, and a restart keeps them. A window of one tenant SHALL
NOT count, block or clear a window of another.

Normalization (trimming and lowercasing) SHALL apply only to the tracking key.
The value passed to `verifyLogin` SHALL remain the request's original,
unmodified `email` string.

`handleLogin` SHALL apply a second window, keyed on the caller's address, with
its own threshold and the same `WINDOW_MS`. A request SHALL pass both windows
to reach `verifyLogin`, and either one over its threshold SHALL return the
same `429`. The per-address threshold SHALL be high enough that an office
behind one address does not reach it in ordinary use. It bounds the
credential-stuffing case the per-email window cannot see: one password tried
against many accounts.

`handleLogin` SHALL check the address window first, before the email window
records anything. A caller past its address threshold therefore never reaches
the email window. That is what stops one caller from adding rows for many
distinct emails. The expiry requirement below rests on this ordering.

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

<!-- antislop: allow passive-voice -->
#### Scenario: An email under the limit is unaffected

- **WHEN** `POST /auth/login` receives a wrong password for an email fewer than
  `MAX_ATTEMPTS` times within the window
- **THEN** each request still reaches `verifyLogin` and returns the existing
  generic `401`

<!-- antislop: allow passive-voice -->
#### Scenario: An email over the limit is rejected without touching verifyLogin

- **WHEN** `POST /auth/login` has already failed `MAX_ATTEMPTS` times for the
  same normalized email within the current window
- **THEN** a further request for that email returns `429` with
  `{ error: { type: "rate-limited", message } }`
- **AND** the request does not invoke `verifyLogin`

#### Scenario: A successful login resets the counter

- **WHEN** an email has some failed tries recorded (fewer than
  `MAX_ATTEMPTS`) and then logs in successfully
- **THEN** the login clears the failed-try counter for that email
- **AND** a later wrong password counts as the first failure of a new window

#### Scenario: The window rolls over

- **WHEN** an email has reached `MAX_ATTEMPTS` failed tries and `WINDOW_MS`
  has since elapsed
- **THEN** a further login try for that email reaches `verifyLogin` again,
  without a `429`, and starts a new window

<!-- antislop: allow passive-voice trailing-negation -->
#### Scenario: Rate limiting is keyed by email, not by request source

- **WHEN** the same email tries to log in `MAX_ATTEMPTS` times from different
  IP addresses within one window
- **THEN** the next try for that email returns `429`, whatever IP address it
  comes from

#### Scenario: Case and whitespace variation in the submitted email do not bypass the limit

- **WHEN** an email reaches `MAX_ATTEMPTS` failed tries
- **AND** a further request submits the same address with other letter casing
  or surrounding whitespace (for example ` Foo@Bar.com` against `foo@bar.com`)
- **THEN** the further request still returns `429`
- **AND** the email value passed to `verifyLogin` keeps its original form
- **AND** an account whose stored email has uppercase characters
  authenticates exactly as before

<!-- antislop: allow passive-voice -->
#### Scenario: One address trying many emails is limited

- **WHEN** one address submits login tries for many distinct emails, past the
  per-address threshold, inside one window
- **THEN** the next request from that address returns `429`, whatever email it
  names, and `verifyLogin` does not run for it

<!-- antislop: allow passive-voice -->
#### Scenario: A spoofed forwarding header is ignored by default

- **WHEN** `TRUST_PROXY` is unset and a caller sends a different
  `X-Forwarded-For` value on every request
- **THEN** every one of those requests counts against the same peer address

#### Scenario: A trusted proxy supplies the address

- **WHEN** `TRUST_PROXY` is `1` and the request carries an
  `X-Forwarded-For` value
- **THEN** the per-address window counts against that value and not against
  the proxy's own address

<!-- antislop: allow passive-voice -->
#### Scenario: Entries in front of the proxy's own are ignored

- **WHEN** `TRUST_PROXY` is `1` and a caller sends
  `X-Forwarded-For: <a value it picked>`, which an appending proxy turns into
  `<that value>, <the caller's real address>`
- **THEN** the per-address window counts against the last entry, so the value
  the caller picked changes nothing

#### Scenario: An email of 5000 characters is an ordinary wrong password

- **WHEN** `POST /auth/login` receives an email of 5000 characters with a wrong
  password
- **THEN** the response is the existing generic `401`
- **AND** the request counts toward that email's window like any other

#### Scenario: Two processes share one count

- **WHEN** two server processes of one tenant together receive
  `MAX_ATTEMPTS` wrong-password tries for one email inside one window
- **THEN** the next try for that email, on either process, returns `429`

#### Scenario: Concurrent attempts cannot all pass the check

- **WHEN** more than `MAX_ATTEMPTS` tries for one email arrive at the same
  moment, on one process or on several
- **THEN** at most `MAX_ATTEMPTS` of them reach `verifyLogin`, and the rest
  return `429`

#### Scenario: A restart keeps the windows

- **WHEN** an email has reached `MAX_ATTEMPTS` failed tries and the server
  process restarts inside the window
- **THEN** the next try for that email returns `429`

#### Scenario: Two tenants share one email and one address

- **WHEN** tenants `acme` and `beta` each hold an account with the same email
- **AND** `MAX_ATTEMPTS` wrong-password tries for that email arrive on
  `beta`'s host
- **THEN** a login on `acme`'s host for that email still reaches `verifyLogin`
- **AND** a successful login on `acme`'s host leaves `beta`'s window alone
- **AND** the next wrong-password try on `beta`'s host returns `429`

## REMOVED Requirements

### Requirement: Rate-limit tracking has a bounded memory footprint

**Reason**: The windows no longer sit in process memory, so no map needs a
capacity or an eviction rule. The replacement requirement bounds the table by
expiry.
**Migration**: None. See "The rate-limit table drops expired rows".

## ADDED Requirements

### Requirement: The rate-limit table drops expired rows

Each login request SHALL delete every row whose window has ended, before it
checks a window. An ended row has no information, since its next use would
start a new window.

#### Scenario: An ended window leaves no row behind

- **WHEN** a window has ended, and a login try for another email arrives
- **THEN** the ended window's row no longer exists after that try

#### Scenario: A flood of distinct emails shrinks once it stops

- **WHEN** a caller submits many distinct emails and then stops
- **THEN** after `WINDOW_MS` and one further login try, none of those rows
  remains

### Requirement: A failure of the rate-limit check refuses the login

`handleLogin` SHALL NOT call `verifyLogin` when it cannot read or write a
window. The request SHALL fail with the existing `500` response. The check
SHALL NOT lapse.

#### Scenario: The database is unavailable

- **WHEN** a login arrives and the database refuses the rate-limit query
- **THEN** the response is `500` and `verifyLogin` is not invoked
