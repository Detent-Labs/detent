## Why

`scripts/dev-up.sh` restarts the dev server on every re-run. It sends SIGTERM
via `pkill -f "src/http/server.ts"`. Nothing in `src/` traps SIGTERM or
SIGINT. Nothing calls `sql.end()`.

The Bun process stops at once, with the HTTP connection pool and the
engine's four background pollers (`startEngine`, `src/http/server.ts:526`)
still live. Every pooled Postgres connection open at that instant gets torn
down by the OS in the same instant. Postgres logs a burst of "could not
receive data from client: Connection reset by peer" lines on every restart.
A graceful shutdown stops accepting new work and closes the pool on purpose
instead.

## What Changes

- `startHttpServer`'s returned `stop()` becomes async. It stops `Bun.serve`
  from accepting new connections and awaits in-flight requests draining
  (Bun's own `server.stop()` promise). It then stops the four engine
  pollers from scheduling their next tick.
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
  finish, stop the background pollers. Then close the database pool and
  exit.

## Impact

- `src/http/server.ts`: `startHttpServer`'s `stop` becomes async. A new
  signal-handling block goes in the `import.meta.main` entrypoint.
- `scripts/dev-up.sh` needs no change. Its `pkill` already sends SIGTERM.
  The server now handles that signal cleanly instead of dying mid-flight.
- New test coverage for the shutdown sequence: stop accepting connections,
  stop pollers, close the pool, in that order.
