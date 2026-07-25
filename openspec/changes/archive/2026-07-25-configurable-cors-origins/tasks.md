## 1. Origin resolution in the HTTP wrapper

- [x] 1.1 Add an allowed-origins parser in `src/http/server.ts`: split a comma-separated string, trim, drop empties; a single `*` entry is the wildcard mode; an empty/absent value is the "no headers" mode
- [x] 1.2 Replace the `CORS_ORIGIN_HEADER` constant with a `corsHeaders(requestOrigin)` function closing over the configured set, returning `{}` (unset), `{"Access-Control-Allow-Origin": "*"}` (wildcard), or the echoed origin plus `Vary: Origin` (allowlist hit) / `Vary: Origin` alone (allowlist miss) — with a comment at the echo site stating that the origin is echoed only after an allowlist check, since the safe and unsafe versions of this pattern read identically
- [x] 1.3 Call it from both `toResponse` and `preflightResponse` so the real response and its preflight cannot disagree about the allowed origin
- [x] 1.4 Thread the configured origins through `createServer` as a parameter (alongside the existing registries/db/resolver injection), and supply it in `startHttpServer` from `process.env.CORS_ALLOWED_ORIGINS`, matching the `PORT`/`DATABASE_URL` composition-root convention

## 2. Tests

- [x] 2.1 Update the ~10 existing assertions in `test/http.test.ts` that hardcode `Access-Control-Allow-Origin: *` to run against a server explicitly configured with `*`, so each test states the configuration it exercises
- [x] 2.2 Test the unset configuration: no `Access-Control-Allow-Origin` header on a success and on an error response, while status and body are unchanged
- [x] 2.3 Test the allowlist hit: a request whose `Origin` is on the list gets that exact origin echoed, plus `Vary: Origin`
- [x] 2.4 Test the allowlist miss: a request whose `Origin` is not on the list gets no origin header, but still `Vary: Origin`
- [x] 2.5 Test that a request with no `Origin` header executes and returns its ordinary response under every configuration (the non-browser-client case)
- [x] 2.6 Test preflight parity: an `OPTIONS` under each configuration carries the same origin header its real response would, and a disallowed-origin preflight is still 204 with methods/headers but no origin header, without invoking the Runtime API Layer
- [x] 2.7 Test that the wildcard mode emits no `Vary: Origin` (the response does not vary by origin there)

## 3. Environment and documentation

- [x] 3.1 Add `CORS_ALLOWED_ORIGINS` to the `app` service in `.devcontainer/docker-compose.yml` so a fresh container serves the editor's dev origin without prior reading
- [x] 3.2 Update the "HTTP wrapper" entry in `docs/current-state.md`: the origin header is configuration-driven, name the three modes and the secure-by-default choice, and note that `Access-Control-Allow-Credentials` stays unimplemented and why
- [x] 3.3 Note in `docs/current-state.md` that a future credentialed (cookie/session) resolver cannot use the wildcard mode per the CORS spec, so the allowlist mode is its precondition

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and the full `bun test` suite **with `DATABASE_URL` set**, reading the verdict off named tests and the skip count, not the pass count alone
- [x] 4.2 Confirm the documented editor-against-engine workflow still works end to end: bring the devcontainer up with the new variable, serve the engine, and load the Player against it in a browser (a real browser check — the failure this change risks is browser-enforced and invisible to the test suite)
