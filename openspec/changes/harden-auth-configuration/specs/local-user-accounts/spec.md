## MODIFIED Requirements

### Requirement: Unknown, wrong-password and disabled logins are indistinguishable

`verifyLogin` SHALL reject a disabled user (`disabled = true`) even when the
password is correct. An unknown email, an incorrect password and a disabled
user SHALL all produce the same generic failure, so that no caller can learn
from a login response which email addresses exist or which accounts are
disabled.

Indistinguishability SHALL hold for the response *time* as well as the
response *value*. `verifyLogin` SHALL therefore perform exactly one password
verification on every path, including the no-row path: when no row matches, it
SHALL verify the submitted password against a process-lifetime dummy argon2id
hash generated from a random value with the same cost parameters as a stored
hash, and then fail. Returning before the verification — the shape that makes
an unknown email roughly two orders of magnitude faster than a known one —
SHALL NOT be used.

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

### Requirement: Rate-limit tracking has a bounded memory footprint

The tracking map SHALL NOT grow without bound in response to distinct
submitted email values, since the map is populated before any check of
whether the corresponding account exists.

Before deciding on capacity, `checkAndRecordAttempt` SHALL remove every entry
whose window started more than `WINDOW_MS` ago. Such an entry carries no
information — it would reset on its next use — so removing it costs nothing
and reclaims the slots an intermittent caller left behind. This sweep SHALL
run only on the path where a not-yet-tracked email meets a full map, not on
every request, and SHALL stay inside the same synchronous, `await`-free
function so that check and increment remain atomic against concurrent
requests for one email.

If the map still holds `MAX_TRACKED_EMAILS` entries with live windows after
the sweep, a login request for a not-yet-tracked email SHALL be **refused**
with the same `429` an over-limit email receives, rather than admitted
untracked. Refusing is the safe direction: admitting untracked requests at
capacity lets any unauthenticated caller disable the brute-force control for
every account by submitting enough distinct email values, and does so
silently and permanently. Refusing is bounded instead by the window — it
resolves itself within `WINDOW_MS` — and is visible to the caller it affects.

#### Scenario: Expired entries are reclaimed before capacity is judged

- **WHEN** the tracking map holds `MAX_TRACKED_EMAILS` entries of which some
  windows have expired, and a login attempt arrives for a not-yet-tracked
  email
- **THEN** the expired entries are removed and the new email is tracked
  normally, subject to the ordinary 5-per-15-minutes rule

#### Scenario: A map full of live windows refuses new emails

- **WHEN** the tracking map holds `MAX_TRACKED_EMAILS` entries whose windows
  are all still live, and a login attempt arrives for a not-yet-tracked email
- **THEN** the response is `429` with the existing `rate-limited` error type,
  and `verifyLogin` is not called

#### Scenario: Already-tracked emails are unaffected by capacity

- **WHEN** the tracking map is at `MAX_TRACKED_EMAILS` capacity
- **THEN** login attempts for emails already present in the map continue to
  be rate-limited normally

#### Scenario: A flood cannot permanently disable the control

- **WHEN** a caller fills the map with distinct email values and then stops
- **THEN** after `WINDOW_MS` those entries no longer count toward capacity,
  and the next not-yet-tracked email is admitted and tracked
