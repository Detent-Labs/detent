## 1. Health module

- [x] 1.1 Create `src/http/health.ts`.
- [x] 1.2 Implement `checkDbReady(db: SQL): Promise<boolean>`: runs
      `SELECT 1` against `db`, returns `true` on success, catches any thrown
      error and returns `false`. Never calls `mapError`.
- [x] 1.3 Implement `handleLivez(): Promise<HttpResult>`: always returns
      `{status: 200, body: {status: "ok"}}`. No parameters, no database
      access.
- [x] 1.4 Implement `handleReadyz(db: SQL = sql): Promise<HttpResult>`:
      calls `checkDbReady`, returns `{status: 200, body: {status: "ok"}}` on
      `true`, `{status: 503, body: {status: "unavailable"}}` on `false`.

## 2. Route registration

- [x] 2.1 In `src/http/server.ts`, add a `GET /livez` match
      (`parts.length === 1 && parts[0] === "livez"`) calling `handleLivez`,
      placed ahead of every existing route match.
- [x] 2.2 Add a `GET /readyz` match (`parts.length === 1 && parts[0] ===
      "readyz"`) calling `handleReadyz(db)`, placed next to the `/livez`
      match.
- [x] 2.3 Convert each `HttpResult` to a `Response` with
      `toResponse(result, undefined, null)`, not the shared `toRes` closure.
      `toRes` applies `corsHeaders(allowedOrigins, origin)` unconditionally,
      so calling it here would leak `Access-Control-Allow-Origin` on a
      server configured with `*` or a matching allowlist entry. Passing
      `undefined` forces `corsHeaders` to return no header regardless of
      server configuration, per the updated `http-wrapper` CORS
      requirement.
- [x] 2.4 Confirm neither route has a corresponding `OPTIONS` branch in the
      preflight block. An `OPTIONS /livez` or `OPTIONS /readyz` request
      falls through to the wrapper's existing unmatched-route 404.

## 3. Tests

- [x] 3.1 Create `test/health.test.ts`.
- [x] 3.2 Test: `handleLivez` returns 200 with `{status: "ok"}`
      unconditionally. No `test.skipIf(!DB)` guard, since it has no database
      dependency.
- [x] 3.3 Test: `handleReadyz` returns 200 against the real test database,
      guarded by `test.skipIf(!DB)` per the repo's DB-backed-suite
      convention.
- [x] 3.4 Test: `checkDbReady` resolves `false`, not throwing, when given a
      stub `db` whose query rejects.
- [x] 3.5 Test: with the server constructed with `CORS_ALLOWED_ORIGINS=*`,
      a raw `GET /livez` and `GET /readyz` response carries no
      `Access-Control-Allow-Origin` header, per the updated `http-wrapper`
      CORS requirement.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm it passes.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes, checking the skip
      count as well as the pass count.
