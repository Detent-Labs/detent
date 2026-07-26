## Why

`docs/current-state.md` records `POST /auth/login` as a known, deliberately
unaddressed operational gap from `add-authentication`: the only brake against
credential-stuffing or password-guessing today is `Bun.password`'s argon2id
cost (~100ms/attempt), with no request-rate limiter. The route is reachable by
anyone once `AUTH_JWT_SECRET` is set, and every failure mode (unknown email,
wrong password, disabled account) intentionally looks identical, which is
exactly the shape an unthrottled brute-force attempt exploits.

## What Changes

- Add an in-memory, per-account (normalized email) rate limiter in front of
  `verifyLogin` inside `handleLogin`: after N failed attempts for an email
  within a fixed window, further attempts for that email return `429` without
  touching the database or the argon2id hash, until the window rolls over.
- A successful login clears that email's counter.
- The limiter is process-local (a `Map`, no new dependency, no schema
  change). It is a single `Bun.serve` process today, so this closes the
  recorded gap without adding shared-store infrastructure; the multi-instance
  ceiling is documented in code as a `ponytail:`-style comment with the
  upgrade path (a shared store, e.g. a Postgres-backed counter or Redis, if
  the deployment ever runs more than one process).
- Per-IP limiting is explicitly out of scope for this change (see Impact).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `local-user-accounts`: `POST /auth/login` gains a new requirement — repeated
  failed attempts for the same email within a window are rate-limited with a
  `429` response, independent of the existing generic-401 non-disclosure
  behavior for individual failures.

## Impact

- `src/auth/login.ts`: `handleLogin` gains a rate-limit check keyed by
  normalized email, and a reset on success.
- `test/http.test.ts` / `test/auth-login.test.ts` (wherever login is
  currently tested): new tests for the 429 path and window rollover.
- No schema, dependency, or HTTP route surface change (still `POST
  /auth/login`, plus a new possible status code on the same route).
- Explicitly not addressed: per-IP limiting (would need `Bun.serve`'s
  `server.requestIP(req)` threaded through `createServer`'s single-arg
  `fetch`, a larger surface change than this gap justifies today), and
  cross-process/shared-store limiting (no second process exists yet).
- `packages/editor/src/player/{types.ts,client.ts,PlayerView.tsx}`: a
  `rate-limited` `ClientError` variant so the Player's login form surfaces the
  429 message distinctly instead of folding it into the generic `internal`
  bucket (caught during verification — the generic bucket already showed the
  right text, this just gives it its own type instead of reusing "internal"
  for two different situations).
