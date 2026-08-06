## Why

Three findings in the 2026-08-01 code review (`docs/CODE_REVIEW.md`) share
one shape. The system holds an account directory and a login path. Neither
one decides who acts, after the first second of a session.

**Disabling an account does nothing to a live session (SEC-5).** The engine
reads `disabled` once, in `verifyLogin`. The issued token then carries `sub`
and `roles`, and the resolver checks it against the signing key alone. So
`POST /admin/users/:id/disable` leaves every permission in place for up to
eight hours. The admin area offers that button as the answer to a departure
or a compromise. Today it is a control that looks like it works.

**Login rate limiting counts one email at a time (SEC-3a).** The bucket key
is the normalized email. An attacker who tries one password against ten
thousand accounts meets no limit, because each email opens its own window.
Every try also costs a full argon2id verify, which `verifyLogin` runs on the
unknown-email path too. So one attacker holds a single-threaded runtime busy
while never tripping a counter.

**The capacity backstop denies service (SEC-3b).** At `MAX_TRACKED_EMAILS`
live windows, a login for any untracked email gets `429`. An attacker submits
50,000 distinct addresses inside one window, which is cheap and scriptable.
No untracked account logs in until the window rolls.

The live spec chose that direction deliberately, and gave a reason. Admitting
untracked requests at capacity lets a caller disable the brute-force control
for every account. That reasoning rests on a premise this change removes. A
per-source limit bounds how fast one caller creates entries. Eviction then
stops being a free move for an attacker.

**A delegation target is never checked (ARCH-3).** `delegateClaim` accepts
any `toActorId`. A typo parks the task on an identity that will never claim
it. No error follows, and the `assignment.delegated` event reads like a real
delegation.

## What Changes

- The JWT resolver checks the account on every request that carries a locally
  issued token (`iss: "bps"`). A disabled account raises
  `ActorResolutionError`, so the request gets `401`. An externally issued
  token stays the identity provider's business, unchanged.
- `handleLogin` gains a second bucket, keyed on the client address, with its
  own higher threshold. The two compose: a login must pass both. An address
  the server cannot determine skips the second bucket.
- The client address comes from the socket peer, or from `X-Forwarded-For`
  when the deployment sets `TRUST_PROXY=1`. Without that variable the server
  ignores the header, because anyone can send it.
- **BREAKING** for the recorded capacity behavior: a full map evicts the
  oldest window instead of refusing the request. An evicted entry costs at
  worst one unthrottled try. Refusal costs every untracked account its login.
- `delegateClaim` rejects a target that does not resolve in `auth_users`,
  but only when the delegating actor resolves there. A deployment on an
  external identity provider keeps today's behavior, because it has no
  directory to check against. The check runs after the claimant check, under
  the same row lock. A caller who does not hold the claim therefore still
  meets `NotClaimantError`, and learns nothing about the directory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jwt-authentication`: a new requirement covers the per-request account
  check for locally issued tokens. A second one obliges the composition root
  to wire it.
- `local-user-accounts`: the rate-limit requirement gains the per-source
  bucket. The memory-footprint requirement replaces refusal with eviction,
  and bounds the per-address map the same way.
- `runtime-api`: the delegation requirement gains the target check.
- `admin-user-management`: the disable requirement states that a live session
  ends at once. Its current text requires the opposite, and names the missing
  per-request lookup as the reason. The role-change requirement names that
  same missing lookup and keeps its own outcome. This change restates its
  reason.
- `http-wrapper`: the delegation error gets a status, the way every other
  Runtime API Layer error has one.

## Impact

- `src/auth/jwt.ts`: the local branch reaches the account directory.
- `src/auth/users.ts`: a lookup by `user_id` that answers whether the
  directory holds that account as live. Beside it, one that answers whether
  the directory holds a set of ids at all.
- `src/auth/login.ts`: the second bucket and the eviction path.
- `src/http/server.ts`: `resolveAuthResolver` takes the database handle and
  wires the account lookup. The request handler takes Bun's `server`
  argument and passes a client address to the route handlers. Only the login
  route reads it.
- `src/runtime/api.ts` and `src/engine/transition.ts`: the `delegateClaim`
  target check. The engine gains a validator parameter, not a directory.
- `src/http/errors.ts`: the new error's status mapping.
- `packages/web/src/api/types.ts` and `client.ts`: the new error type, so the
  browser prints the message instead of a generic internal error.
- One new environment variable, `TRUST_PROXY`.
- `README.md`: the environment-variable list.
- `docs/authoring-guide.md`: the delegation paragraph, which today names no
  rule about the target.
- `docs/current-state.md`: the auth entries.
- Tests: `test/auth-jwt.test.ts`, `test/auth-login.test.ts`,
  `test/auth-server.test.ts` and the assignment suites.
