## 1. Implement graceful shutdown in server.ts

- [ ] 1.1 Make `startHttpServer`'s returned `stop()` async. Await
      `server.stop()` (Bun's graceful, connection-draining default) before
      calling `engine.stop()`
- [ ] 1.2 In the `import.meta.main` block of `src/http/server.ts`, register
      SIGTERM and SIGINT handlers. Each handler awaits `stop()`, then calls
      `sql.end()`, then calls `process.exit(0)`
- [ ] 1.3 Guard the handler with a module-level boolean. A signal received
      while shutdown is already running does nothing, so `sql.end()` never
      runs twice
- [ ] 1.4 Update `test/schema-bootstrap.test.ts`, the one existing caller of
      that `stop`. Widen its `stopServer` type to hold a promise-returning
      function and await it in `afterEach`, so a drain finishes before the
      next test opens its own server

## 2. Tests

- [ ] 2.1 Add a unit test that `startHttpServer(...).stop()` awaits
      `server.stop()` before it returns. Hold a request in flight with a
      body trickled in chunks (the route awaits `req.json()`), call
      `stop()`, and assert the request finishes before `stop()`'s promise
      resolves
- [ ] 2.2 Add an end-to-end test, following the `Bun.spawn` pattern in
      `test/auth-cli.test.ts`. Run `bun run src/http/server.ts` as a child
      process with `env: { ...process.env, PORT: String(port) }` on a free
      port of the test's own choosing — never the 3000 default, which
      `scripts/dev-up.sh` occupies. Wait for `/livez` on that port to
      answer, send SIGTERM, and assert the process exits with code 0 within
      a bound
- [ ] 2.3 Extend that test to send SIGTERM twice in quick succession and
      assert the process still exits cleanly exactly once
- [ ] 2.4 Add a SIGINT variant of 2.2, confirming SIGINT follows the same
      shutdown path as SIGTERM. Give it its own free port

## 3. Sync the spec and the state doc

- [ ] 3.1 Apply the delta in
      `openspec/changes/graceful-shutdown/specs/http-wrapper/spec.md` to
      `openspec/specs/http-wrapper/spec.md`
- [ ] 3.2 Add a short note to the "HTTP wrapper" entry in
      `docs/current-state.md` describing the graceful shutdown on
      SIGTERM/SIGINT

## 4. Manual verification

- [ ] 4.1 Run `bash scripts/dev-up.sh` twice in a row. Confirm the Postgres
      log shows no "Connection reset by peer" burst on the restart
- [ ] 4.2 Tail `.devcontainer/server.log` during a restart. Confirm it logs
      the orderly shutdown sequence

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer
- [ ] 5.2 Run the full `bun test` suite in the devcontainer with
      `DATABASE_URL` set. Read the skip count as well as the pass count
- [ ] 5.3 Run the antislop linter over `proposal.md`, `design.md`,
      `tasks.md`, the delta spec, and the touched section of
      `docs/current-state.md`
- [ ] 5.4 Run `git diff --check`
