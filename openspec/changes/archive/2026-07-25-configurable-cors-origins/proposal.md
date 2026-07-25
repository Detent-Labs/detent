## Why

`Access-Control-Allow-Origin: *` is hardcoded in `src/http/server.ts`
(`CORS_ORIGIN_HEADER`, spread into both `toResponse` and
`preflightResponse`) and written into the `http-wrapper` spec as a
requirement. It exists for one real reason: the editor's Vite dev server runs
on a different port than the engine, so a browser would otherwise block the
Player's `fetch` calls.

That default is correct for a laptop and wrong for anything reachable. A
wildcard origin means any web page a user visits can call this API from their
browser. Today the blast radius is bounded — the shipped `devHeaderResolver`
takes identity from an `X-Actor-Id` header, which a cross-origin page cannot
forge onto a request it does not control — but that bound is an accident of
the dev resolver, not a property of the wrapper. The moment the auth change
lands a cookie- or session-backed resolver, a wildcard origin becomes a
straightforward CSRF surface. Fixing the transport now, while it is a
self-contained change, is cheaper than remembering to fix it inside the auth
change.

This is transport hardening only. Authentication remains out of scope and
keeps its own change.

## What Changes

- **Allowed origins become configuration, not a constant.** `createServer`
  gains an allowed-origins parameter; `startHttpServer` supplies it from a
  `CORS_ALLOWED_ORIGINS` environment variable, matching how `DATABASE_URL`
  and `PORT` already enter the process at the composition root.
- **Three behaviors, one setting:**
  - unset → **no CORS headers emitted at all** (secure default; same-origin
    frontends and every non-browser client are unaffected, since CORS is
    purely a browser mechanism)
  - `*` → wildcard, exactly today's behavior, but now an explicit opt-in a
    reader can see in the deployment config
  - a comma-separated origin list → the request's `Origin` is echoed back
    only when it is on the list, and omitted otherwise
- **`Vary: Origin` on every response that echoes an origin**, so a shared
  cache cannot serve origin A's allowed response to origin B.
- **A preflight from a disallowed origin still answers 204**, just without
  the CORS headers — the browser blocks it. No new status code, no new error
  family; preflight handling stays uniform.
- **BREAKING for a caller that relied on the implicit wildcard.** A local dev
  setup running the editor against the engine must now set
  `CORS_ALLOWED_ORIGINS` (to `*`, or to the Vite origin). The devcontainer
  and docs carry that setting so the documented workflow keeps working.
- Out of scope, deliberately: `Access-Control-Allow-Credentials`. The Player
  sends no cookies — actor identity travels in headers — so nothing needs it
  today, and enabling credentialed CORS is a decision that belongs with
  whichever auth mechanism actually introduces a cookie.

## Capabilities

### New Capabilities

_None._ This tightens an existing behavior rather than adding one.

### Modified Capabilities

- `http-wrapper`: the requirement asserting every response carries
  `Access-Control-Allow-Origin: *` is replaced by one where the origin header
  is configuration-driven (absent / wildcard / allowlist-echo), and the
  preflight requirement that hardcodes `*` in its normative text follows the
  same configured value. The two preflight requirements that delegate ("the
  standard CORS headers", "the same CORS headers the existing routes use")
  need no edit — they inherit the central rule by reference.

## Impact

- `src/http/server.ts` — `CORS_ORIGIN_HEADER` becomes an origin-resolving
  function; `createServer` and `startHttpServer` gain the parameter. The
  route table, handlers, and `errors.ts` are untouched.
- `test/http.test.ts` — roughly ten existing assertions hardcode
  `Access-Control-Allow-Origin: *`; they move to an explicitly-configured
  server, plus new cases for unset / allowlist-hit / allowlist-miss / `Vary`.
- `.devcontainer/docker-compose.yml` and `docs/current-state.md` — carry
  `CORS_ALLOWED_ORIGINS` so the documented editor-against-engine workflow
  still works out of the box.
- `packages/editor` — no code change. Its Player already sends no
  credentials; only the server it points at needs the setting.
- No change to `src/schema/definition.ts`, the Runtime API Layer, or any
  engine internals. The JSON contract is untouched.
