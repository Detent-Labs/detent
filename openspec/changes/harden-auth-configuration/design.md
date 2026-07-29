## Context

`jwt-authentication` made the resolver selectable by environment and kept
`devHeaderResolver` as the fallback so that the then-existing test suite and
the examples stayed green. `local-user-accounts` added local accounts, the
8-hour token, and a 5-per-15-minutes login rate limit with an explicitly
documented fail-open at capacity. Each decision was reasonable in the change
that made it; the composite is a server that is fully unauthenticated when
nothing is configured, accepts a one-character HMAC key when something is,
and whose brute-force control can be turned off by an unauthenticated caller.

The common shape is a security control whose *off* state is silent. This
change does not add a control; it makes each existing one's off state either
impossible or explicit.

The CSP item is here rather than in a frontend change because it belongs to
the same asset — the bearer token — and because it is one line per file with
no design work of its own. Its value is entirely prospective: there is no XSS
sink in the tree today (the single `innerHTML` write is mermaid with
`securityLevel: "strict"`), and the mitigation exists for the token, which is
in `localStorage` in all four SPAs and unrevocable for up to 8 hours.

## Goals / Non-Goals

**Goals:**

- Starting the server with no authentication configured is impossible by
  accident: it either fails, or the operator wrote the flag that says they
  meant it.
- A signing key too weak for HS256 fails startup rather than deploying.
- The login rate limiter cannot be disabled by an unauthenticated caller.
- An unknown email is not distinguishable from a known one by response time.
- An injected script in any SPA origin cannot execute or exfiltrate.

**Non-Goals:**

- Moving the token out of `localStorage` into an httpOnly cookie. That
  requires credentialed CORS, which `docs/current-state.md:326` already scopes
  as separate work, and it is a larger change than the exposure justifies on
  its own. The CSP is deliberately the cheap mitigation that does not block on
  it.
- Token revocation / per-request `auth_users` re-read. Real, recorded in
  `docs/current-state.md:719-721`, and a different capability (it trades the
  stateless-token property for a DB read per request).
- Per-IP or global login rate limiting. The current control is per-email by
  design; making it per-IP is a different control with its own proxy/trust
  questions.
- Server-sent security headers (`X-Frame-Options`, HSTS, a server-side CSP for
  API responses). The engine serves JSON to non-browser clients; the browser
  packages own their own headers, and a production deployment fronting them
  with a real web server will set headers there.
- Rotating or provisioning secrets. This change validates what it is given.

## Decisions

**An explicit opt-in flag, not deleting `devHeaderResolver`.** The dev
resolver earns its keep: it is what makes the trust boundary swappable, and
41 test suites wire it directly into `createServer`. Deleting it would force
every suite through JWT minting for no security gain, since a test that
constructs its own resolver is not a deployment. `ALLOW_INSECURE_DEV_AUTH=1`
moves the decision from "what did the environment happen to omit" to "what did
someone write down", which is the property that was missing.

**The flag is checked in the composition root, not in `resolve.ts`.**
`devHeaderResolver` stays exactly as it is — a plain resolver a host may wire.
The dangerous thing was never the resolver; it was `resolveAuthResolver`
*selecting* it silently and `createServer` *defaulting* to it. Both are
composition-root concerns, and both are fixed there.

**Drop the `createServer` parameter default in the same change.** Keeping the
default would leave a second, quieter path to the same state: any call site
that omits the argument gets the unsigned-header resolver with no flag and no
warning. Since every existing caller already passes one explicitly, removing
the default costs nothing and closes the path permanently. This is what makes
the fix structural rather than a startup-time check that a future caller can
route around.

**Warn loudly *and* return, rather than warn-only or throw-only.** With the
flag set, the operator has stated intent, so throwing would be wrong; but the
state must remain visible for the life of the process's logs, because the
symptom of a wrongly-flagged deployment (everything works, for everyone) is
indistinguishable from a healthy one. The warning names the headers being
trusted, so a log search for it answers "is this server authenticated?".

**32 bytes, measured after `TextEncoder` encoding.** HS256 is HMAC-SHA-256;
RFC 7518 §3.2 requires a key of at least the hash output size, 256 bits. Bytes
rather than characters because that is what is actually handed to the HMAC —
a 32-character key of multi-byte characters is fine, a 20-character one is
not, and counting characters would accept keys the RFC rejects. The check
lives beside `parseAuthIssuers`' malformed-value throw so both configuration
failures behave the same way, and the error message names the variable and
suggests `openssl rand -base64 32`.

**Sweep first, then fail closed.** The sweep is not a nicety: entries older
than `WINDOW_MS` carry no information — they would reset on next use anyway —
so evicting them costs nothing and reclaims every slot an intermittent
attacker leaves behind. Only a map still full of *live* windows reaches the
capacity branch, and there the safe answer is 429. This inverts the failure:
today a full map means "no rate limiting for anyone new", after this it means
"new emails are throttled until a window expires". The sweep is O(map size) in
the worst case; it runs only on the miss path at capacity, not on every
request, so the common path stays O(1).

**Accepting a login-availability failure over a silently disabled control.**
Failing closed means a sustained flood of distinct emails (≈55/s to keep 50k
live windows) can make new logins 429 until windows expire. That is a real
denial of service and it is the right trade: it is loud, self-healing within
15 minutes, and visible in the response the user gets, whereas the current
behavior is an unbounded, silent, permanent removal of the brute-force
defense. If the availability side ever bites, the upgrade path is the one the
existing `ponytail:` comment already names — a shared store — plus a per-IP
control, not a return to fail-open.

**One dummy hash per process, created as a promise at module scope.**
`const DUMMY_HASH = Bun.password.hash(crypto.randomUUID())` without top-level
`await`, awaited inside `verifyLogin`. Top-level await would make importing
`users.ts` asynchronous for every consumer including `src/auth/cli.ts`, to
save nothing: the promise resolves long before the first login in any real
process, and awaiting a settled promise is free. Generating it from a random
UUID means no attacker-known plaintext maps to it. The comparison must be
`await Bun.password.verify(password, row?.password_hash ?? await DUMMY_HASH)`
so the *same* call runs on both paths — an `if` that verifies twice, or that
verifies then discards, reintroduces a measurable difference.

**CSP injected at build time, not written into `index.html`.** A static meta
tag in `index.html` would break `bun run dev`: `@vitejs/plugin-react` injects
the react-refresh preamble as an inline module script, which `script-src
'self'` forbids. Injecting via `transformIndexHtml` with `apply: "build"`
gives the production artifact a real policy and leaves the dev server alone —
and the dev server is not the thing being protected, since a dev origin holds
a dev token. The `connect-src` entry is derived from `VITE_API_URL` at build
time (falling back to `'self'`, which is what `API_BASE = ""` already means),
so the policy matches whatever origin the build actually calls.

**`style-src` keeps `'unsafe-inline'`.** The threat model is script execution
and exfiltration; inline *styles* are used by the SPAs and by mermaid, and
forbidding them buys defense against a narrow style-injection class at the
cost of breaking rendering. `script-src 'self'`, `object-src 'none'`,
`base-uri 'none'` and a pinned `connect-src` are what actually carry the
mitigation.

## Risks / Trade-offs

- **Every existing local/dev workflow that starts the server with no auth
  variables now fails to start** → Intended, and the loudest part of this
  change. Mitigated by shipping the flag in
  `.devcontainer/docker-compose.yml` in the same change, so the standard
  workflow keeps working with the insecurity now written down.
- **An operator sets `ALLOW_INSECURE_DEV_AUTH=1` in production to make an
  error go away** → Possible; no configuration flag can prevent it. The
  warning is written to be quotable in an incident review, and the flag name
  contains the word "insecure" precisely so that its presence in a production
  compose file is self-indicting.
- **A deployment with a short-but-secret key fails to start after upgrade** →
  Intended; it names the variable and the fix. Rotating a signing key
  invalidates issued tokens, so operators should expect one round of
  re-logins.
- **Fail-closed rate limiting is a new availability surface** → Analyzed
  above; accepted deliberately.
- **The dummy-hash verification adds ~100 ms to every unknown-email login**,
  which is the point, but it also means an unauthenticated caller can now cost
  the server an argon2id hash per request → Already true for every *known*
  email, and the rate limiter (now fail-closed) is what bounds it. The
  combination is the correct ordering: throttle first, then spend the CPU.
- **CSP is absent in dev**, so a dev-only injection vector is unmitigated →
  Accepted; the dev origin holds a dev token against a dev database. Stated
  explicitly so nobody reads the requirement as broader than it is.
- **A future SPA feature needing an external origin (an image CDN, an
  analytics endpoint) will hit the policy** → That is the policy working. The
  requirement says the policy is updated in the change that adds the
  dependency, the same rule `pin-frontend-dev-ports` uses for the CORS
  allowlist.

## Migration Plan

1. Land the server-side changes and the devcontainer flag together, so the
   standard dev workflow never sees a broken commit.
2. Deployments: before upgrading, either set `AUTH_JWT_SECRET` to a ≥32-byte
   value (`openssl rand -base64 32`) / configure `AUTH_ISSUERS`, or set
   `ALLOW_INSECURE_DEV_AUTH=1` deliberately. A server that starts is a server
   whose auth posture someone chose.
3. Changing `AUTH_JWT_SECRET` invalidates every locally-issued token; users
   log in again. There is no stored state to migrate — no schema change, no
   data change.
4. The rate-limit and `verifyLogin` changes need no operator action; both are
   in-process and take effect on restart.
5. Rollback is reverting the commit. The only externally visible artifact is
   the environment flag, which a reverted server ignores.

## Open Questions

- Should `ALLOW_INSECURE_DEV_AUTH` also be refused when `NODE_ENV=production`?
  Deliberately not decided: the repo does not otherwise branch on `NODE_ENV`,
  and adding a second, implicit switch would undercut the "one explicit
  decision" property this change is built on.
- Should the warning be emitted once at startup or on every resolved request?
  Startup only, here. Per-request would guarantee visibility in any log slice
  but would make the insecure mode the noisiest thing in the log, which
  invites suppression.
