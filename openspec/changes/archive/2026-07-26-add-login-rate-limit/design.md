## Context

`POST /auth/login` (`src/auth/login.ts::handleLogin`) is registered only when
`AUTH_JWT_SECRET` is set (`local-user-accounts` spec). It already gives
unknown-email, wrong-password and disabled-account attempts the same generic
`401` (non-disclosure). What it has never had is a limit on *how many* attempts
one caller can make. `docs/current-state.md` records this as a known gap left
open by `add-authentication`, blunted only by `Bun.password`'s argon2id cost
(~100ms/attempt).

The deployment shape today is a single `Bun.serve` process (`src/http/server.ts
::startHttpServer`); nothing in this codebase runs it behind a load balancer or
as multiple replicas yet.

## Goals / Non-Goals

**Goals:**
- Stop unbounded password-guessing against a single account: after N failed
  attempts for an email within a window, further attempts for that email get
  `429` without hitting `verifyLogin` (no DB round-trip, no argon2id hash).
- Zero new dependencies, zero schema change, zero new HTTP route.
- Fail open on ambiguity: a limiter bug must never lock out a legitimate user
  forever or crash the server; worst case is "try again after the window".

**Non-Goals:**
- Per-IP limiting. Requires threading `Bun.serve`'s `server.requestIP(req)`
  through `createServer`'s currently single-arg `(req: Request) => Promise<Response>`
  signature — every call site and test that builds this `fetch` function would
  need updating for one extra parameter. Out of proportion to the gap being
  closed; per-account limiting already stops the credential-stuffing/
  brute-force scenario the gap is about (repeated guesses against one known
  email).
- Cross-process/shared-store correctness. There is one process today; a
  shared store (Postgres row, Redis) is only worth it once a second process
  exists.
- Any change to the existing non-disclosure behavior (401 body/shape for an
  individual failed attempt is untouched; only the *count* of attempts is now
  bounded).

## Decisions

**Key: normalized email, not IP — but only for the tracker.**
The recorded gap is about guessing one account's password; email is the axis
that matters. The rate-limit map key is `body.email.trim().toLowerCase()`.
**Correction from an earlier draft of this design:** `src/auth/users.ts`'s
`verifyLogin` does a plain `WHERE email = ${email}` — exact, case-sensitive
match, and nothing anywhere in this codebase (`createUser` included)
normalizes a stored email. There is no case-insensitive `unique` constraint to
match. `handleLogin` MUST keep passing `body.email` to `verifyLogin` exactly
as submitted, untouched — normalization exists solely to make the *tracker*
robust to trivial case variation; applying it to the `verifyLogin` call would
lock out any account whose stored email contains an uppercase character.

**Storage: an in-memory `Map<string, { count: number; windowStart: number }>`**
module-level in `src/auth/login.ts`, not a new file/class. A fixed window
(reset the counter when `now - windowStart > WINDOW_MS`) rather than a sliding
window or token bucket — simplest thing that satisfies "N attempts per
window", and the existing codebase already favors the plainest structure that
works (e.g. `checkTypedConfig`, `mapConfigIssues` consolidations rejected
cleverness for directness). A `ponytail:` comment on the `Map` names the
multi-instance ceiling and the upgrade path (a shared store), same pattern as
`idempotency.ts`'s hand-rolled UUIDv5 comment.

**Check-and-increment is one synchronous step, done *before* `await
verifyLogin`.** `handleLogin` is async and `verifyLogin` awaits a DB
round-trip plus an argon2id hash (~100ms) — an eternity in event-loop terms.
If the counter is only incremented *after* that await resolves (as a naive
"check, then verify, then increment-on-failure" reading would do), every
concurrent request for the same email that arrives before the first one's
`verifyLogin` resolves sees the *same* not-yet-incremented count and passes
the check — an attacker sending attempts in parallel instead of serially
bypasses the limit entirely, which defeats the point of this change against
exactly the tooling it exists to stop. The fix costs nothing extra: read the
entry, roll the window if expired, check `count >= MAX_ATTEMPTS` and reject,
otherwise increment the count *right there, synchronously* — all before the
`await`. Because this whole sequence contains no `await`, Bun's single-threaded
event loop guarantees no other request's handler runs in the middle of it, so
the check-and-increment is atomic for free. A successful login then deletes
the entry outright (undoing the pre-emptive increment along with any prior
history for that email), matching "successful login resets counter".

**Bounding the tracker's memory footprint.** Because the key is drawn from
submitted (not yet verified) email strings, an earlier draft's claim that the
map is "bounded by the real user base" does not hold — an attacker can submit
unlimited distinct, never-registered email strings and grow the map without
bound, since a failed attempt's entry is never deleted (only reset in place
on window rollover). Fix: a hard cap, `MAX_TRACKED_EMAILS` (module constant),
checked only when a *new* key would be inserted. At capacity, fail open for
tracking purposes — let the untracked request proceed to `verifyLogin`
exactly as it would without this change, rather than adding eviction logic.
This keeps the map bounded with a one-line branch, no LRU/eviction machinery:
a real deployment's account count sits far below the cap, so legitimate
users always get a tracked slot; only a flood of distinct fake emails
(already out of scope — see Non-Goals on per-IP/enumeration) goes untracked,
which costs nothing this change was trying to fix.

**Testability needs a clock seam.** The check-and-increment logic branches on
elapsed time (`WINDOW_MS` rollover), and this codebase has no fake-timer
convention anywhere (`test/timer.test.ts` asserts against real `Date.now()`
bounds, it doesn't mock time) — waiting 15 real minutes in a test is not an
option. Following this codebase's existing DI convention for every other
dependency (`db: SQL = sql` as a default parameter, not a global), the
check-and-increment step is its own small exported function taking `now: () =>
number = Date.now` as a default parameter, so a test can pass a synthetic
clock. This is not a new abstraction; it is the same optional-parameter-with-
default pattern already used throughout `src/auth` and `src/engine`.

**Limit values: 5 attempts / 15 minutes**, as module constants
(`MAX_ATTEMPTS`, `WINDOW_MS`), not environment-configurable. No caller has
asked for a different value; adding env-var plumbing for an unrequested
knob is exactly the speculative flexibility this project's audits (see
`PONYTAIL-AUDIT.md`) flag and cut elsewhere.

**Reset on success.** A successful login deletes that email's counter entry —
a legitimate user who mistypes their password a few times before succeeding
isn't left partially throttled.

**Where the check sits.** At the top of `handleLogin`, after body-shape
validation (a malformed JSON body shouldn't count as an attempt) and before
`verifyLogin` — the whole point is avoiding the argon2id hash on a
already-blocked email.

**Response shape.** `429` with the same `{ error: { type, message } }`
envelope every other route uses (`type: "rate-limited"`), consistent with
`mapError`'s existing typed-error convention (`authorization` → 403,
`actor-resolution` → 401, etc.), even though this error originates in
`handleLogin` directly rather than `mapError` — no thrown exception, `handleLogin`
returns the `HttpResult` shape directly like every other branch in that function.

**No cleanup/eviction job.** The `Map` only grows with distinct emails that
have ever failed a login; a real deployment's email set is bounded by its user
base, not attacker-controlled (an attacker varying the *email* on every
request to inflate the map does not achieve anything, since each new email
starts a fresh, still-enforced window). Not worth a background sweep for a
map sized like the user table.

## Risks / Trade-offs

- [In-memory counter resets on process restart] → Accepted: matches the
  already-accepted 8-hour-token-with-no-revocation-list posture in
  `jwt-authentication`; a restart is already a bigger event than one skipped
  rate-limit window.
- [No per-IP limiting] → Accepted for now, documented as the upgrade path in
  the `ponytail:` comment and in Impact (proposal.md); revisit if the login
  route ever sees credential-stuffing across many known emails from a small
  IP set, which per-account limiting alone wouldn't catch.
- [Fixed 5/15min may be wrong for some deployment] → Accepted: no
  configurability now; a module constant is a one-line change if a concrete
  deployment needs differ.
- [Unbounded map growth from attacker-supplied distinct emails] →
  Mitigated by `MAX_TRACKED_EMAILS` fail-open-at-capacity (see Decisions);
  not eliminated in a distributed-attacker sense (still bounded per-process
  memory, not per-attacker request budget), but no longer unbounded.
- [Check-and-increment must stay synchronous / await-free to keep its
  atomicity guarantee] → A future edit to this function that inserts an
  `await` between reading and writing the counter silently reintroduces the
  TOCTOU race (finding from this review). Worth a code comment at the call
  site, not just this design doc, since the doc won't be read again.

## Migration Plan

No data migration. Deploy is a normal code release: `handleLogin` change only,
no schema/env var change, fully backward compatible (existing successful
logins unaffected; only a new failure mode — `429` — appears, and only after
repeated failures). No rollback concern beyond reverting the commit.

## Open Questions

None — scope intentionally narrowed to the recorded gap (per-account,
single-process) in this change; see Non-Goals for what's deliberately
deferred.
