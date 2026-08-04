## Context

See `proposal.md` - Why for the motivation. Two facts from the current code
shape the approach.

`startHttpServer` already returns `{ stop: () => void }`. That `stop`
already calls `server.stop()`, Bun's `Bun.serve` handle. It also calls
`engine.stop()`, the four pollers from `src/engine/host.ts::startEngine`.
Nothing calls this `stop` today outside tests. `import.meta.main` is the
only production entrypoint. It never calls `stop` at all.

`startHttpServer` also runs many times per test process. For example,
`test/schema-bootstrap.test.ts` calls it twice in the same file. A signal
handler registered inside `startHttpServer` itself would stack a new
`process.on` listener on every call. That would happen across every test
file in the suite.

Bun's `server.stop(closeActiveConnections?)` already does what the proposal
asks for, by default. It stops accepting new connections. It lets
in-flight requests finish before its returned promise resolves. Passing
`true` forces an immediate close. The test suite already uses that for
fast teardown: `server.stop(true)`, seen in `test/handlers-http.test.ts`
and others. The default, no argument, is the graceful behavior this change
needs. `server.stop()` inside `startHttpServer` already calls it that way.

## Goals / Non-Goals

**Goals:**
- `bun run serve`'s process (the one `import.meta.main` starts) exits
  cleanly on SIGTERM/SIGINT. It accepts no new work, finishes in-flight
  work, and closes the Postgres pool before it exits.
- Exactly one shutdown sequence runs, even if the signal arrives twice.

**Non-Goals:**
- Waiting for a poller's in-flight tick before `sql.end()`. See
  `proposal.md` - What Changes for why this is not a new risk.
- A bounded shutdown timeout that force-exits if a request never finishes.
  Nothing today issues a request that can hang indefinitely. Adding a
  timeout for a case that cannot occur is speculative. Add one if a real
  slow-request path shows up later.
- Any change to `scripts/dev-up.sh`. Its `pkill` already sends the right
  signal. Only the receiving side changes.

## Decisions

**Register the signal handler only in the `import.meta.main` block, not
inside `startHttpServer`.** `startHttpServer` is a library function called
many times per test process. A handler registered there would leak a
`process.on` listener per call. That risks Node's max-listener warning
across a full test run. The signal-handling concern belongs to the one
long-lived process `bun run serve` starts. That is exactly the
`import.meta.main` block.

Alternative considered: register the listener in `startHttpServer` and
remove it inside `stop()`. Rejected: it adds `removeListener` bookkeeping
to a function every test already calls. That bookkeeping would only serve
the single real entrypoint.

**Make `stop()` async and await `server.stop()` before calling
`engine.stop()`.** `server.stop()` already returns a promise. That promise
resolves once in-flight requests finish. Awaiting it before stopping the
pollers keeps the shutdown order `proposal.md` describes. Stop new HTTP
work first, then stop the pollers, then close the pool. `engine.stop()`
itself stays synchronous. `pollForever` (`src/engine/poll.ts`) only clears
a pending timeout. There is nothing to await there.

**Guard re-entrancy with a module-level boolean in the entrypoint.** A
second SIGTERM must not start a second shutdown. For example, an impatient
double `pkill` must not call `sql.end()` twice. A plain flag, checked
before the handler does anything, is the smallest correct guard.

**Exit code 0 on graceful shutdown.** `import.meta.main`'s existing
`.catch` block exits with code 1 on a startup failure. A signal-driven
shutdown is not a startup failure. It uses the normal exit code instead.
That matches how `docker compose stop` and most process supervisors read
exit codes.

## Risks / Trade-offs

- [Risk] A poller's tick can fail mid-query when `sql.end()` runs. →
  Mitigation: outbox, timer, and resolution workers are lease-based,
  at-least-once. An out-of-memory exit or a crash already causes the same
  failure today.
<!-- antislop: allow synonym-rotation -->
- [Risk] `kill -9` sends SIGKILL, which no process can trap. A hard
  container stop can still show the old abrupt-reset behavior. →
  Mitigation: this is not preventable. The `dev-up.sh` script already
  sends SIGTERM instead, so this change covers it.
- [Risk] A future slow or hanging request could delay shutdown. Bun's
  `server.stop()` has no built-in deadline. → Mitigation: this stays
  acceptable for now; see Non-Goals. A bounded timeout can wait until a
  real slow-request path appears.

## Migration Plan

No schema or data change. Steps: implement, run `bun run typecheck`, then
run the full `bun test` with `DATABASE_URL` set. Then verify by hand:
start the dev server via `dev-up.sh` and send it SIGTERM. Confirm
`.devcontainer/server.log` shows an orderly shutdown. Confirm the Postgres
log carries no "Connection reset by peer" burst. Rollback is a plain
revert; no persisted state changes.
