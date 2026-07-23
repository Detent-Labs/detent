## 1. Error mapping

- [x] 1.1 Create `src/http/errors.ts`: a function mapping a thrown value to
      `{status, body}`, recognizing `SubmissionValidationError` (422),
      `GuardRefused` (409), `ConcurrencyConflict` (409), `PinMismatch`
      (500), and a fallback for anything else (500,
      `{error: {type: "internal", message}}`).

## 2. Route handlers (framework-agnostic)

- [x] 2.1 Create `src/http/routes.ts` with a handler for
      `POST /processes/:processId/instances`: parse `{actor, version?,
      data?}` from the JSON body, call `createProcessInstance`, return
      `{status: 201, body: Instance}` on success, delegate thrown errors to
      `errors.ts`.
- [x] 2.2 Add a handler for `GET /instances/:instanceId`: parse `actorId`
      and comma-separated `roles` from query parameters (default `roles` to
      `[]`), call `getInstanceView`, return `{status: 200, body:
      InstanceView}`.
- [x] 2.3 Add a handler for `POST /instances/:instanceId/submit`: parse
      `{actor, pathId, data}` from the JSON body, call
      `submitAndTransition`, return `{status: 200, body: Instance}` on
      success.
- [x] 2.4 In the submit handler, catch `AutomaticCascadeLoop` specifically
      (before it reaches the generic error mapping): call `getInstanceView`
      for the current (now-faulted) state and return `{status: 200, body:
      InstanceView}` instead of an error.

## 3. Server wiring

- [x] 3.1 Create `src/http/server.ts`: `createServer(registry, db = sql)`
      returning a `fetch(req: Request): Promise<Response>` handler that
      routes to the three handlers in `routes.ts` (path/method matching)
      and translates their `{status, body}` into a JSON `Response`.
- [x] 3.2 Add `startHttpServer(registry, db = sql)`: wraps the `fetch`
      handler with `Bun.serve({fetch, port})` (`PORT` env var, default
      `3000`) and calls `startEngine(db, registry)` so the background
      workers run alongside the server.
- [x] 3.3 Add a `main`-style entry point in `server.ts` (run only when the
      module is executed directly) that builds a `Registry` and calls
      `startHttpServer`.
- [x] 3.4 Add a `"serve"` script to `package.json` running
      `bun run src/http/server.ts`.

## 4. Tests

- [x] 4.1 Create `test/http.test.ts` (`test.skipIf(!DATABASE_URL)`,
      following the existing DB-backed suite pattern: `beforeAll`
      `initSchema`, `beforeEach` truncate the relevant tables).
- [x] 4.2 Cover the happy path for each route: create an instance, get its
      view, submit through a manual path, including the async "book"-style
      wait-state settling via the running background workers (or manual
      drain, matching `scripts/demo-expense-approval.ts`'s approach) —
      calling the exported `fetch` handler directly with `new Request(...)`,
      no real port.
- [x] 4.3 Cover each typed error mapping (422/409×2/500 for `PinMismatch`)
      and the generic 500 fallback (e.g. an unknown `instanceId`).
- [x] 4.4 Cover the `AutomaticCascadeLoop` → 200-with-faulted-view case.
- [x] 4.5 Cover the actor-passing mechanism: body field on both `POST`
      routes, `actorId`/`roles` query params on `GET`, including `roles`
      omitted (defaults to `[]`) and `roles` with multiple comma-separated
      values.

## 5. Verification

- [x] 5.1 `bun run typecheck` passes.
- [x] 5.2 `bun test` passes with `DATABASE_URL` set (full suite, not just
      the new file — per this repo's rule that a single-file rerun isn't a
      reliable signal).
- [x] 5.3 Manually run `scripts/demo-expense-approval.ts`'s flow through
      the running HTTP server (`bun run serve`, then drive the three routes
      with `curl` or a small script) to confirm the end-to-end path works
      over HTTP, not just against the in-process Runtime API Layer.
