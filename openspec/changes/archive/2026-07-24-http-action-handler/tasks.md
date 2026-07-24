## 1. Handler implementation

- [x] 1.1 Create `src/handlers/` directory with `src/handlers/http.ts`:
      export `HTTP_ACTION_TYPE = "http.request"`, an `IDEMPOTENCY_HEADER =
      "Idempotency-Key"` constant, and the Zod `httpConfigSchema` (`url`
      required valid URL; `method` enum GET/POST/PUT/PATCH/DELETE defaulting
      to `POST`; `headers` optional string-to-string record; `body` optional
      unknown).
- [x] 1.2 Add two `.refine()`s to `httpConfigSchema`: reject `method: "GET"`
      combined with a present `body`; reject a `headers` key equal to
      `IDEMPOTENCY_HEADER` case-insensitively.
- [x] 1.3 Implement the handler function's header merge: start from
      `config.headers ?? {}`, set `Idempotency-Key: ctx.idempotencyKey`
      unconditionally, and set `Content-Type: application/json` only when
      `body !== undefined` and no `Content-Type` key is already present
      (case-insensitive match).
- [x] 1.4 Build a `Request` from `url`/`method`/the merged headers/`body`
      (JSON-serialized) from `ctx.config` alone, no `data`/DB access.
- [x] 1.5 Bound the `fetch` call with an `AbortController` when
      `ctx.action.timeout` is set, using `durationMs` from
      `src/engine/duration.ts`; no bound when unset.
- [x] 1.6 Classify the response into `HttpActionResult` (`status`, `headers`,
      `body`): JSON-parse `body` when `Content-Type` includes
      `application/json`, otherwise raw text.
- [x] 1.7 Classify failures: `4xx` except `429` → `throw new
      PermanentError(...)` (import from `src/engine/outbox.ts`); `429`,
      `5xx`, network errors, and aborted (timeout) requests → `throw new
      Error(...)` (transient).
- [x] 1.7a (added post-verify, closes a SUGGESTION from
      `/openspec-verify-change`) Tighten the success/permanent boundary to
      `response.status < 200 || response.status >= 300` (was `>= 400`), so
      the code reads the same as the spec's literal "any 2xx is success" —
      unreachable today given `fetch()`'s default redirect-following, but no
      longer merely implied by the 4xx/5xx/429 checks alone.
- [x] 1.8 Export a `HandlerDef` (`httpHandlerDef`) pairing the handler
      function with `httpConfigSchema` as its `configSchema`, matching the
      existing `HandlerDef` shape in `src/engine/registry.ts`.

## 2. Registry wiring

- [x] 2.1 Add `createDefaultRegistry()` to `src/engine/host.ts` (not
      `registry.ts` — importing `src/handlers/http.ts` there would cycle back
      through `outbox.ts`; see design.md), registering
      `HTTP_ACTION_TYPE -> httpHandlerDef` via `registry.ts`'s existing
      `createRegistry`/`register`.
- [x] 2.2 Change `src/engine/host.ts::startEngine`'s `registry` parameter
      default from `new Map()` to `createDefaultRegistry()`.
- [x] 2.3 Grep existing tests/call sites for any assertion relying on the
      previous empty-default registry behavior (e.g. an unregistered-type
      dead-letter test using the default) and update if found.

## 3. Tests

- [x] 3.1 Create `test/handlers-http.test.ts` with a local `Bun.serve` mock
      target server, started before and stopped after each test.
- [x] 3.2 Test: `2xx` response with `application/json` Content-Type →
      `HttpActionResult.body` is the parsed JSON value.
- [x] 3.3 Test: `2xx` response with `text/plain` Content-Type →
      `HttpActionResult.body` is the raw text.
- [x] 3.4 Test: request construction — method/headers/body from `config`
      arrive unchanged at the mock server (assert server-side).
- [x] 3.5 Test: `404` response → handler throws `PermanentError`.
- [x] 3.6 Test: `429` response → handler throws a plain (transient) `Error`.
- [x] 3.7 Test: `500` response → handler throws a plain (transient) `Error`.
- [x] 3.7a Test (added post-verify, closes a spec-vs-tasks gap found by
      `/openspec-verify-change`): a connection failure (no response received,
      e.g. the target port has nothing listening) → handler throws a plain
      (transient) `Error`, not `PermanentError`. Matches
      specs/http-action-handler/spec.md's "A network failure is a transient
      failure" scenario, which previously had no dedicated task/test.
- [x] 3.8 Test: response delayed past `action.timeout` → request aborts,
      throws transient.
- [x] 3.9 Test: no `action.timeout` set → handler waits normally, no abort.
- [x] 3.10 Test: every request carries an `Idempotency-Key` header equal to
      `ctx.idempotencyKey` (assert server-side).
- [x] 3.11 Test: two `deliver()` calls built from the same `ClaimedRow`
      (simulating original + retried delivery) send the identical
      `Idempotency-Key` value, not a freshly generated one.
- [x] 3.12 Test (schema unit test, no network call): `httpConfigSchema.safeParse`
      rejects `{ method: "GET", body: <anything> }`.
- [x] 3.13 Test (schema unit test): `httpConfigSchema.safeParse` rejects a
      `headers` entry named `Idempotency-Key` in any letter casing (e.g.
      `idempotency-key`, `IDEMPOTENCY-KEY`).
- [x] 3.14 Test: `body` set with no `Content-Type` in `config.headers` →
      request carries `Content-Type: application/json` (assert server-side).
- [x] 3.15 Test: `body` set with an explicit `Content-Type` in
      `config.headers` (e.g. `application/x-www-form-urlencoded`) → that
      value reaches the mock server unchanged, not overwritten.
- [x] 3.16 Add a registry-check integration test (in
      `test/definitions.test.ts` or a small addition there): an
      `http.request` action with invalid config (e.g. missing `url`, or a
      `GET` with `body`) is rejected at publish via `checkActionRegistry`,
      confirming `httpConfigSchema` is wired into `createDefaultRegistry`.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` inside the devcontainer and confirm it
      passes with no errors.
- [x] 4.2 Run the FULL `bun test` suite inside the devcontainer with
      `DATABASE_URL` set (never a single-file rerun) and confirm all tests
      pass, checking the skip count is as expected (no DB-backed suite
      silently skipped).
