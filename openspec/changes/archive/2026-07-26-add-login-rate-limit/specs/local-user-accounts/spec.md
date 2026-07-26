## ADDED Requirements

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
