## Why

`scripts/dev-up.sh` restarts the dev server on every re-run. It sends SIGTERM
via `pkill -f "src/http/server.ts"`. Nothing in `src/` traps SIGTERM or
SIGINT. Nothing calls `sql.end()`.

The Bun process stops at once, with the HTTP connection pool and the
engine's background pollers (`startEngine`, called at
`src/http/server.ts:635`) still live. The server holds ten Postgres
connections, measured in `pg_stat_activity`, and the OS tears down every
one of them at that instant. A graceful shutdown closes them on purpose
instead.

The first draft of this section overstated one point. Measurement corrected
it. The devcontainer's Postgres log does carry reset bursts, ten lines at a
time. The message reads "could not receive data from client: Connection
reset by peer".

Those bursts track pool creation. They also track `scripts/dev-up.sh`'s own
`bun run seed` and `bun run src/auth/cli.ts` steps. Each one is
short-lived, and each exits without closing its pool. A SIGKILL of an idle
server added no line at all.

So this change does not empty that log. It makes the engine's own stop
deliberate. After SIGTERM `pg_stat_activity` drops to zero because
`sql.end()` ran. The kernel no longer has to intervene.

A production container gains more than the dev loop does.
`docker/engine.Dockerfile:30` runs the engine in exec form, so it is PID 1.
Linux gives PID 1 no default disposition for SIGTERM. So `docker stop`
waits out its whole grace period, then sends SIGKILL. An explicit handler
is what makes that stop orderly.

## What Changes

- `startHttpServer`'s returned `stop()` becomes async. It stops `Bun.serve`
  from accepting new connections and awaits in-flight requests draining
  (Bun's own `server.stop()` promise). It then stops the engine pollers
  from scheduling their next tick.
- The `import.meta.main` entrypoint in `src/http/server.ts` registers a
  SIGTERM and SIGINT handler. The handler runs this shutdown, then closes
  the Postgres pool with `sql.end()`, then exits with code 0.
- The handler ignores a second SIGTERM or SIGINT received while shutdown is
  already running. It does not re-enter the shutdown path.
- Out of scope: waiting for a poller's in-flight tick to finish before
  `sql.end()` runs. `pollForever` (`src/engine/poll.ts`) only stops itself
  from scheduling the *next* tick. A tick already running when `sql.end()`
  runs can still see its query fail. That is not a new risk. The outbox,
  timer, and resolution workers are already lease-based and at-least-once.
  The existing retry contract already covers a worker that stops mid-tick,
  for example on a crash.

## Capabilities

### Modified Capabilities
- `http-wrapper`: adds a requirement that the server shuts down gracefully
  on SIGTERM/SIGINT. Stop accepting new requests, let in-flight requests
  finish, stop the engine's background pollers. Then close the database
  pool and exit.

## Impact

- `src/http/server.ts`: `startHttpServer`'s `stop` becomes async. A new
  signal-handling block goes in the `import.meta.main` entrypoint.
- `test/schema-bootstrap.test.ts`: the one existing caller of that `stop`.
  It holds the handle as `(() => void) | undefined` and calls it without
  awaiting, so it needs a widened type and an `await`.
- `test/http-shutdown.test.ts`: new. The unit test and the three
  signal end-to-end tests.
- `openspec/specs/http-wrapper/spec.md` and `docs/current-state.md`: the
  spec sync and the state-doc note.
- `scripts/dev-up.sh` needs no change. Its `pkill` already sends SIGTERM.
  The server now handles that signal cleanly instead of dying mid-flight.
