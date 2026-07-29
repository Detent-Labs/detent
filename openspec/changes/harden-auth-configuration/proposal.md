# Make the authentication configuration fail loudly instead of failing open

## Why

Four defects share one property: the *insecure* state is the one a deployment
reaches by omission, mistake or patience, and nothing anywhere says so.

1. **No auth configured silently disables authentication.**
   `resolveAuthResolver` returns `devHeaderResolver` whenever neither
   `AUTH_JWT_SECRET` nor `AUTH_ISSUERS` is set (`src/http/server.ts:138`), and
   `createServer`'s `resolver` parameter *also* defaults to it (`:169`). That
   resolver trusts `X-Actor-Id`/`X-Actor-Roles` verbatim
   (`src/auth/resolve.ts:36-43`), and authorization is role-only — so an
   anonymous caller sending
   `X-Actor-Roles: system:admin,system:publish,system:developer,system:cancel-any`
   satisfies every `requireRole` gate in the codebase. Nothing surfaces the
   state: startup logs only `HTTP server listening on :${port}`, and the sole
   observable difference is that `POST /auth/login` is unregistered and 404s,
   which reads as a routing bug. The default is documented, but the reason
   recorded for it is test convenience — a test concern setting the production
   security default. One function above, `parseAuthIssuers` throws on a
   malformed `AUTH_ISSUERS`, so the fail-loud discipline already exists here
   and is simply not applied to the more dangerous case.

2. **A one-character signing key is accepted.** `AUTH_JWT_SECRET` goes
   straight into `jwtResolver` as `localSecret` and is reused as
   `loginSecret`; both `TextEncoder().encode(...)` it with no length or
   entropy check. Verified against the vendored jose 6.2.4: `checkKeyLength`
   enforces a minimum only for `RS*`/`PS*`, and raw-imports any `Uint8Array`
   as an HMAC key. `AUTH_JWT_SECRET=x` is a working HS256 deployment. HS256
   tokens are offline-crackable against a weak key — the token is its own
   oracle — and `toActor` takes roles from the claim with no re-read of
   `auth_users`, so a recovered key mints admin at will and disabling the
   account does not help. Setting a weak secret *looks* like correctly
   enabling auth, which makes it a likelier operator error than leaving auth
   off entirely.

3. **The login rate limiter can be switched off from outside.**
   `checkAndRecordAttempt` returns `"ok"` for any not-yet-tracked email once
   the map holds `MAX_TRACKED_EMAILS` (50,000) entries, and entries are
   removed only on a *successful* login — no TTL sweep, no eviction. The
   documented justification assumes the fake emails arrive last; the ordering
   is attacker-controlled and the warm-up is cheap, since an unknown email
   short-circuits before argon2id. A scripted 50k-request warm-up permanently
   disables the 5-per-15-minutes control that the code and
   `docs/current-state.md` both present as the brute-force defense, silently.

4. **Login timing discloses which emails have accounts.** `verifyLogin`
   returns at `src/auth/users.ts:33` when no row matches, skipping
   `Bun.password.verify` entirely, while a known email always pays the full
   argon2id cost — roughly two orders of magnitude apart by the project's own
   ~100 ms figure, separable over the network with no statistical work. The
   function's doc comment claims a caller "cannot learn from this function's
   result which email addresses exist", which is true of the result and false
   of the timing. Enumeration is itself unthrottled, because each distinct
   email is a first attempt.

A fifth item rides along because it is the same blast radius and one line per
file: all four SPAs persist the bearer token to `localStorage` and **no**
`index.html` carries a `Content-Security-Policy`, no `vite.config.ts` adds
headers, and the server sends none. There is no XSS sink today, but a
recovered or exfiltrated admin token provably cannot be revoked for up to 8
hours (`docs/current-state.md:719-721`).

## What Changes

- `resolveAuthResolver` throws unless auth is configured **or**
  `ALLOW_INSECURE_DEV_AUTH=1` is set explicitly; when it is, it logs a loud
  warning naming what is disabled and returns `devHeaderResolver`.
- `createServer`'s `resolver` parameter loses its default, so no call site can
  inherit the dev resolver by omission.
- `resolveAuthResolver` validates `AUTH_JWT_SECRET`, when set, to at least 32
  bytes encoded, and throws naming the variable otherwise — the same treatment
  `parseAuthIssuers` already gives malformed input. `loginSecret` is derived
  from that same validated value.
- `checkAndRecordAttempt` sweeps entries older than `WINDOW_MS` before the
  capacity check, and — if the map is still full — fails **closed** with the
  existing 429 rather than open. The function stays synchronous and
  await-free, preserving its atomicity property.
- `verifyLogin` verifies against a module-level dummy argon2id hash when no
  row matches, so both branches perform exactly one verification.
- Each of the four `packages/*/index.html` files gains a CSP meta tag.

## Capabilities

### New Capabilities

- `frontend-security-headers`: every browser package ships a
  Content-Security-Policy restrictive enough that an injected inline script
  cannot execute and cannot exfiltrate, independent of where the session token
  is stored.

### Modified Capabilities

- `jwt-authentication`: the "no auth configured" state becomes an explicit
  opt-in rather than the default, and a signing key below the HMAC block size
  fails startup.
- `local-user-accounts`: rate-limit tracking sweeps expired entries and fails
  closed at capacity; the unknown-email branch performs the same work as the
  known-email branch.

## Impact

- `src/http/server.ts` — `resolveAuthResolver` (throw + warn + length check),
  `createServer`'s parameter list, `startHttpServer`'s `loginSecret` wiring.
- `src/auth/login.ts` — the sweep and the fail-closed branch in
  `checkAndRecordAttempt`.
- `src/auth/users.ts` — the dummy-hash branch in `verifyLogin`, and the doc
  comment that currently overstates the guarantee.
- `packages/{app,admin,studio,editor}/index.html` — one meta tag each.
- **BREAKING for any deployment or script that starts the server with no auth
  variables** — including the devcontainer and every local run. They must set
  `ALLOW_INSECURE_DEV_AUTH=1` (dev) or configure real auth. This is the
  point of the change; the flag makes the choice visible in the compose file
  and the shell history.
- Tests: two edits, both mechanical. `test/auth-server.test.ts:33` asserts
  the removed no-configuration fallback and changes deliberately; and that
  file's `SECRET` constant (`:17`, 23 bytes) is below the new minimum and is
  fed to `resolveAuthResolver` at seven call sites, so it is lengthened once.
  `test/auth-login.test.ts:19` (28 bytes) reaches `handleLogin` directly
  rather than through the validating function, so it is not forced to change —
  lengthen it anyway rather than leaving a test fixture that models a
  configuration the server now refuses. Every other suite passes
  `devHeaderResolver` into `createServer` explicitly and is unaffected by both
  the throw and the dropped default. New tests cover the throw, the flag, the
  short secret, the sweep, the fail-closed branch and the unknown-email
  verification.
- No token format, no route, no client change: an already-issued token stays
  valid, and none of the four SPAs needs a code change beyond its
  `index.html`.
