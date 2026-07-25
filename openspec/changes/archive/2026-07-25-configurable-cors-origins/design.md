## Context

`src/http/server.ts` holds one constant:

```ts
const CORS_ORIGIN_HEADER = { "Access-Control-Allow-Origin": "*" };
```

spread into `toResponse` (every ordinary response) and `preflightResponse`
(every `OPTIONS`). That is the entire CORS implementation — there is no
origin inspection, no configuration, no `Vary`.

It was written for a real constraint: `packages/editor`'s Vite dev server and
the engine listen on different ports, so the Player's `fetch` is cross-origin
and a browser blocks it without the header. The wildcard solved that in one
line and has been correct for every use the project has had so far.

What makes it worth changing now rather than later:

- The read/query change just landed publish and cancel as HTTP routes. The
  wrapper is no longer read-plus-submit; it can create and destroy process
  definitions.
- The auth change is next. If it introduces a cookie or session credential,
  a wildcard origin turns directly into CSRF — and it would then have to be
  fixed *inside* the auth change, mixing transport hardening into an already
  large piece of work.
- Today's exposure is genuinely bounded, but by luck: `devHeaderResolver`
  reads identity from `X-Actor-Id`, and a cross-origin page cannot attach a
  custom header to a request without triggering a preflight it cannot pass.
  That is a property of the dev resolver, not of the wrapper, and it
  disappears silently when the resolver is swapped.

Constraints inherited:

- **Composition-root configuration.** `DATABASE_URL` and `PORT` are the only
  two `process.env` reads in `src/`, both at the point the process starts.
  A third follows the same shape rather than inventing a config module.
- **`createServer` stays injectable.** It already takes its registries, db,
  and resolver as parameters so tests can call `fetch(req)` with no port.
  Origins join that list; tests configure them explicitly instead of
  mutating `process.env`.
- **No new error family.** `errors.ts::mapError` is the single place statuses
  are decided, and CORS produces no application error — a blocked request is
  blocked by the browser, not answered with a status.

## Goals / Non-Goals

**Goals:**

- The permitted origins are a deployment decision, visible in configuration.
- The secure choice is the default: unset means no cross-origin browser
  access, not unrestricted access.
- Today's behavior remains reachable verbatim (`*`) so the documented
  editor-against-engine workflow is a config line, not a rewrite.
- Caching correctness when the response varies by request origin.

**Non-Goals:**

- Authentication or CSRF tokens. This change removes a precondition for one
  class of CSRF; it does not implement request authentication.
- `Access-Control-Allow-Credentials`. Nothing sends cookies today (the Player
  carries actor identity in headers), and credentialed CORS is a decision
  that belongs with whatever first introduces a cookie. Note that `*` and
  credentials are mutually exclusive per the CORS spec — a future
  credentialed resolver will therefore *have* to use the allowlist mode,
  which is another reason to build the allowlist now.
- Per-route origin policy. One policy for the whole wrapper; no requirement
  motivates finer granularity.
- `Access-Control-Max-Age`, exposed-headers, or any other CORS knob nothing
  has asked for.

## Decisions

### Unset means no headers, not wildcard

The alternative — keep `*` as the fallback and treat configuration as
opt-in-to-security — was rejected. A default that is safe only when someone
remembers to change it is the same defect in a new place; the whole point of
the change is that the permissive setting should be something a reader can
*see*. Unset emitting nothing is also the least surprising reading of "no
origins are allowed."

The cost is one papercut: `bun run serve` no longer serves the editor's dev
origin until `CORS_ALLOWED_ORIGINS` is set. That is paid once, in the
devcontainer environment and the docs, and it makes the dev-only nature of
the wildcard explicit at exactly the place someone would look.

Worth stating plainly because it is easy to misread as a bigger break than it
is: **CORS is browser-enforced on cross-origin requests.** An unset
configuration changes nothing for `curl`, for a server-to-server caller, for
the test suite calling `createServer`'s `fetch` directly, or for a frontend
served from the same origin as the API. It changes exactly one thing: a
browser page on a *different* origin can no longer read the response.

### One setting, three modes — not a mode flag plus a list

`CORS_ALLOWED_ORIGINS` unset / `*` / `a,b,c` covers every case with one
value. A separate `CORS_MODE` enum plus an origins list would be two things
that can disagree (mode=allowlist with an empty list, mode=wildcard with a
populated one). The parse is a handful of lines: split on commas, trim, drop
empties; a single `*` entry is the wildcard.

### Echo the origin; never reflect it unchecked

In allowlist mode the response carries the *request's* origin when it matches,
not the configured string, because a browser compares the header against its
own origin literally. The dangerous version of this pattern — reflecting
whatever `Origin` arrives, unchecked — is exactly what the allowlist test
prevents, and it is worth a comment at the call site since "echo the origin"
reads identically in both the safe and unsafe implementations.

### `Vary: Origin` whenever the answer depends on the origin

Without it, any shared cache (CDN, corporate proxy) may store the response
computed for an allowed origin and serve it to a disallowed one, silently
undoing the allowlist. Emitted in allowlist mode for both hits and misses —
the header describes what the response *depends on*, which is true either
way. Not needed for the wildcard or unset modes, where the response does not
vary by origin.

### A disallowed preflight is 204-without-headers, not 403

Returning an error status for a preflight would be inventing a new failure
mode: browsers do not surface preflight status to page code beyond "blocked,"
so a 403 is no more informative to the caller and is more code plus a new
error shape. Answering 204 and omitting the origin header lets the browser do
what it already does. It also keeps preflight handling a single uniform path
regardless of configuration.

### Origins are resolved per request, not baked into a constant

The current constant is spread into two response builders. It becomes a small
function `corsHeaders(requestOrigin)` those two call, closing over the
configured set. That keeps both response paths agreeing by construction —
the bug this design most wants to avoid is a preflight and its real response
disagreeing about the allowed origin, which is exactly what two hand-written
header literals would eventually produce.

## Risks / Trade-offs

- **A deployment upgrades and its frontend breaks.** → The behavior change is
  called out as BREAKING in the proposal, the migration is one environment
  variable, and the devcontainer/docs ship the setting so the documented
  workflow is unaffected. The failure is also loud and immediate in a browser
  console, not silent.
- **Someone sets `CORS_ALLOWED_ORIGINS=*` in production to make an error go
  away.** → Cannot be prevented in code, and deliberately not blocked (a
  legitimate public read-only API might want it). It is now at least a
  visible, greppable line in a deployment config rather than an invisible
  default.
- **Origin comparison is exact-string.** → No wildcard subdomains, no scheme
  or port normalization. `https://app.example` does not match
  `https://app.example:443` even though a browser considers them the same.
  Accepted: exact matching is what the CORS spec's own comparison does, and
  the alternative (a URL-normalizing matcher) is more code and more ways to
  be wrong for a case nothing has requested.
- **Ten existing test assertions hardcode `*`.** → Mechanical update, and
  they get stronger: each becomes explicit about the configuration it is
  testing rather than depending on a global default.

## Migration Plan

Additive and configuration-only; no data, no schema, no stored artifact
changes. Deploy order does not matter. Rollback is reverting the code — the
environment variable becomes inert.

For the documented local workflow, `.devcontainer/docker-compose.yml` gains
`CORS_ALLOWED_ORIGINS` alongside the existing `DATABASE_URL`, so a fresh
container serves the editor's dev origin without anyone reading this document
first.

## Open Questions

- Should `CORS_ALLOWED_ORIGINS` accept a scheme-less host (`app.example`) and
  assume `https://`? Deferred — exact origins are unambiguous, and the
  convenience form invites the port/scheme mismatch the exact form avoids.
- When the auth change lands a cookie-based resolver, it will need
  `Access-Control-Allow-Credentials: true` and must drop wildcard support for
  credentialed requests. That is a follow-on to *that* change; the allowlist
  mode this change builds is the precondition it will need.
