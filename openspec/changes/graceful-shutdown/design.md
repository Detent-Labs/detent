## Context

See `proposal.md` - Why for the motivation. Two facts from the current code
shape the approach.

`startHttpServer` already returns `{ stop: () => void }`. That `stop`
already calls `server.stop()`, Bun's `Bun.serve` handle. It also calls
`engine.stop()`, the pollers from `src/engine/host.ts::startEngine` — the
outbox, resolution and timer workers always, plus the retention sweep when
`DATA_RETENTION_DAYS` is set. `import.meta.main` is the only production
entrypoint, and it never calls `stop` at all. The one caller today is
`test/schema-bootstrap.test.ts`.

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

**The end-to-end tests spawn the entrypoint against the test database, on a
port they choose.** `test/preload-db.ts` rewrites `DATABASE_URL` to the
`_test` database before any suite runs, so a child that inherits
`process.env` connects there. CLAUDE.md says not to point a server at that
database, and the rule earns its place: a long-lived `bun run serve` claims
outbox rows every 500 ms and made three test runs of twenty go red. This
child lives for about a second, and `bun test` runs one file at a time, so
no other suite is live while it runs. The alternative — letting it reach
the real `DATABASE_URL` — is the worse one. It would run `initSchema`
against the development database and drive the demo state the split exists
to protect.

The port needs the same care. `startHttpServer` reads `PORT ?? 3000`
(`src/http/server.ts:633`), and 3000 is what `scripts/dev-up.sh` leaves
occupied. Each test therefore passes its own free port to the child, the
way `test/schema-bootstrap.test.ts` already does.

**Hold the in-flight request open with a trickled body.** The unit test in
task 2.1 has to observe a request that is still running when `stop()` is
called, and no route is slow. `startHttpServer` builds its own `fetch`, so
the test cannot inject a slow handler either. A request whose body arrives
in chunks over a few hundred milliseconds solves it: the route awaits
`req.json()`, so the connection stays in flight until the last chunk lands.

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

## Open Questions

- Does shutdown need a bounded deadline? Not yet. Nothing today issues a
  request that can hang, so a timeout would guard a case that cannot occur.
  Revisit when a slow-request path appears, and decide the bound then.
- Should `pollForever` grow an awaitable stop, so `sql.end()` waits for an
  in-flight tick? Only if a dropped tick starts costing something. The
  workers are lease-based and at-least-once, so a tick cut short is retried
  the same way it is after a crash.
