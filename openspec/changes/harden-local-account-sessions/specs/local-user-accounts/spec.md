<!-- Both MODIFIED blocks below copy the live local-user-accounts
     requirements, apart from what this change edits. That file carries the
     findings already, and a rewrite here would make the delta and its
     destination disagree. This directive dies with the change, at archive
     time. -->
<!-- antislop: allow-file passive-voice sentence-length run-ons long-words synonym-rotation em-dash -->

## MODIFIED Requirements

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

`handleLogin` SHALL apply a second window, keyed on the client address, with
its own threshold and the same `WINDOW_MS`. A request SHALL pass both windows
to reach `verifyLogin`, and either one over its threshold SHALL return the
same `429`. The per-address threshold SHALL be high enough that an office
behind one address does not reach it in ordinary use. It bounds the
credential-stuffing case the per-email window cannot see: one password tried
against many accounts.

The address window SHALL be checked first, before the email window records
anything. A caller past its address threshold therefore never reaches the
email map, which is what stops one caller from filling that map. The
memory-footprint requirement below rests on this ordering.

A successful login SHALL NOT clear the address window, though it clears the
email one. Clearing it would let a caller who holds one valid account reset
that window whenever they choose, and so try one password against every other
account for free.

#### Scenario: A success does not reset the address window

- **WHEN** one address reaches its threshold of recorded attempts, having
  logged in successfully to an account it holds at some point inside the
  window
- **THEN** the next attempt from that address still returns `429`

The client address SHALL come from the connection's peer. When the deployment
sets `TRUST_PROXY` to `1`, it SHALL come from the `X-Forwarded-For` header
instead, which the proxy in front of the engine overwrites. Without that
variable the server SHALL ignore that header, because any caller can send it.
When the server can determine no address, the second window SHALL NOT apply,
and the per-email window SHALL still apply.

`X-Forwarded-For` holds a comma-separated list. The server SHALL read the
last entry, trimmed, and SHALL ignore every entry in front of it. A proxy
that appends rather than overwrites leaves the caller's own submitted value
in front of its own, so reading the first entry would hand the bucket key
back to the caller. A header the proxy overwrites holds one entry, where the
last entry is that entry. A request carrying no such header under
`TRUST_PROXY` reached this process without passing the proxy, so its peer is
the caller rather than the proxy: the server SHALL fall back to the peer,
which counts that request rather than exempting it from the window.

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

- **WHEN** one client address submits login attempts for many distinct
  emails, past the per-address threshold, inside one window
- **THEN** the next attempt from that address returns `429`, whatever email
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

If the sweep still leaves the map full of live windows, `checkAndRecordAttempt`
SHALL evict the entry whose window started earliest, and SHALL track the new
email in the slot that frees. It SHALL NOT refuse the request.

The earlier rule refused it, and gave a reason: admitting untracked requests
at capacity lets an unauthenticated caller disable the brute-force control
for every account. The per-address window above removes the premise. One
caller can no longer create 50,000 entries inside a window, because the
address window stops that caller first. What refusal costs is now the larger
harm: every account whose email is not already tracked loses its login until
the window rolls. Eviction costs at most one untracked try, for the least
recently active email.

The same reasoning bounds both directions. An evicted entry belongs to the
oldest window, which is the entry closest to resetting on its own.

The per-address map SHALL carry the same bound, under its own capacity. It
holds one entry per distinct client address, and under `TRUST_PROXY` its key
comes from a header. It therefore has the growth this requirement exists to
stop. The sweep, the capacity check and the eviction of the earliest window
SHALL apply to it as they apply to the email map, so this change closes one
unbounded map and does not open a second.

#### Scenario: The address map is bounded the same way

- **WHEN** the per-address map holds its capacity in live windows, and an
  attempt arrives from a not-yet-tracked address
- **THEN** the expired entries are swept, and if the map is still full the
  entry with the earliest window start is evicted and the new address is
  tracked in the slot that frees

#### Scenario: Expired entries are reclaimed before capacity is judged

- **WHEN** the tracking map holds `MAX_TRACKED_EMAILS` entries of which some
  windows have expired, and a login attempt arrives for a not-yet-tracked
  email
- **THEN** the expired entries are removed and the new email is tracked
  normally, subject to the ordinary 5-per-15-minutes rule

#### Scenario: A map full of live windows evicts the oldest

- **WHEN** the tracking map holds `MAX_TRACKED_EMAILS` entries whose windows
  are all still live, and a login attempt arrives for a not-yet-tracked email
- **THEN** the entry with the earliest window start is removed, the new email
  is tracked, and the request reaches `verifyLogin` subject to the per-address
  window

#### Scenario: Already-tracked emails are unaffected by capacity

- **WHEN** the tracking map is at `MAX_TRACKED_EMAILS` capacity
- **THEN** login attempts for emails already present in the map continue to
  be rate-limited normally

#### Scenario: A flood cannot permanently disable the control

- **WHEN** a caller fills the map with distinct email values and then stops
- **THEN** after `WINDOW_MS` those entries no longer count toward capacity,
  and the map returns to its ordinary state

#### Scenario: A flood from one address is stopped before it fills the map

- **WHEN** one client address submits distinct email values as fast as it can
- **THEN** the per-address window rejects that caller once it passes the
  per-address threshold, so the map does not reach capacity from that caller
