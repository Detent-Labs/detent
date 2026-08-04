## 1. Implement graceful shutdown in server.ts

- [x] 1.1 Make `startHttpServer`'s returned `stop()` async. Await
      `server.stop()` (Bun's graceful, connection-draining default) before
      calling `engine.stop()`
- [x] 1.2 In the `import.meta.main` block of `src/http/server.ts`, register
      SIGTERM and SIGINT handlers. Each handler awaits `stop()`, then calls
      `sql.end()`, then calls `process.exit(0)`
- [x] 1.3 Guard the handler with a module-level boolean. A signal received
      while shutdown is already running does nothing, so `sql.end()` never
      runs twice
- [x] 1.4 Update `test/schema-bootstrap.test.ts`, the one existing caller of
      that `stop`. Widen its `stopServer` type to hold a promise-returning
      function and await it in `afterEach`, so a drain finishes before the
      next test opens its own server

## 2. Tests

- [x] 2.1 Add a unit test that `startHttpServer(...).stop()` awaits
      `server.stop()` before it returns. Hold a request in flight with a
      body trickled in chunks (the route awaits `req.json()`), call
      `stop()`, and assert the request finishes before `stop()`'s promise
      resolves
- [x] 2.2 Add an end-to-end test, following the `Bun.spawn` pattern in
      `test/auth-cli.test.ts`. Run `bun run src/http/server.ts` as a child
      process with `env: { ...process.env, PORT: String(port) }` on a free
      port of the test's own choosing — never the 3000 default, which
      `scripts/dev-up.sh` occupies. Wait for `/livez` on that port to
      answer, send SIGTERM, and assert the process exits with code 0 within
      a bound
- [x] 2.3 Extend that test to send SIGTERM twice in quick succession and
      assert the process still exits cleanly exactly once
- [x] 2.4 Add a SIGINT variant of 2.2, confirming SIGINT follows the same
      shutdown path as SIGTERM. Give it its own free port

## 3. Sync the spec and the state doc

- [x] 3.1 Apply the delta in
      `openspec/changes/graceful-shutdown/specs/http-wrapper/spec.md` to
      `openspec/specs/http-wrapper/spec.md`
- [x] 3.2 Add a short note to the "HTTP wrapper" entry in
      `docs/current-state.md` describing the graceful shutdown on
      SIGTERM/SIGINT

## 4. Manual verification

- [x] 4.1 Run `bash scripts/dev-up.sh` twice in a row. Confirm the restart is
      clean and read the Postgres log against the claim in `proposal.md`.
      Measured: the reset bursts track pool creation and the script's own
      seed and auth-CLI steps, not the server's stop, so the claim was
      overstated and `proposal.md` now records what the log actually shows.
      `pg_stat_activity` is the check that does discriminate — ten backends
      while the server runs, zero after SIGTERM
- [x] 4.2 Tail `.devcontainer/server.log` during a restart. Confirm it logs
      the orderly shutdown sequence

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer
- [x] 5.2 Run the full `bun test` suite in the devcontainer with
      `DATABASE_URL` set. Read the skip count as well as the pass count
- [x] 5.3 Run the antislop linter over `proposal.md`, `design.md`,
      `tasks.md`, the delta spec, and the touched section of
      `docs/current-state.md`
- [x] 5.4 Run `git diff --check`
