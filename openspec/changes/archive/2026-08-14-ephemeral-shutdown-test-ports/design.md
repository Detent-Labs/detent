## Context

See proposal.md for motivation.

`test/http-shutdown.test.ts` is 153 lines and holds four tests. One drives
`startHttpServer` in process. Three spawn the real entrypoint through
`Bun.spawn(["bun", "run", "src/http/server.ts"])`.

Four constants carry the ports: `UNIT_PORT` 48231, `SIGTERM_PORT` 48232,
`REPEAT_SIGNAL_PORT` 48233, `SIGINT_PORT` 48234. The file's own comment calls
them "distinct from every other suite's ports, so a lingering bind cannot
collide". They are distinct from other suites. They collide with the same
suite's own previous run.

`spawnServer` polls `/livez` until it answers, then returns the process. Each
of the three tests reads `await new Response(proc.stdout).text()` after the
child exits, and asserts on the log lines.

Two files hold out, not one. `test/schema-bootstrap.test.ts` binds 48213 and
48214 through `startHttpServer`. Its own comment carries the same false
reasoning: "distinct from the other tests' port, so a lingering bind can't
collide". Distinct from other suites, and colliding with its own last run.

The rest already bind `port: 0`: `handlers-http.test.ts` at lines 71 and 182,
and `auth-jwt.test.ts` at 134. `http-body-size.test.ts` says so in its own
header, "on an ephemeral port". So this change adopts the convention most of
the suite already keeps, rather than introducing one.

A first sweep missed the second holdout, because it looked for `Bun.serve` and
`port: 0`. `schema-bootstrap.test.ts` binds through `startHttpServer` instead.
The sweep that finds both reads every file naming `process.env.PORT`,
`startHttpServer` or `Bun.serve`.

Two facts the fix rests on, both checked. `src/http/server.ts:784` reads
`Number(process.env.PORT ?? 3000)`, and `:787` logs
`{ port: server.port, webRoot }` through `src/log.ts`, which emits one JSON
line per call. Two `Bun.serve({ port: Number("0") })` calls in the devcontainer
returned 33025 and 39881, distinct and above 1024.

## Goals / Non-Goals

**Goals:**

- A crashed run cannot redden the next one.
- A failed assertion leaks no listening child.

**Non-Goals:**

- No change to what `src/http/server.ts` does. It gains one returned value,
  and the Decisions say why.
- No change to what the tests assert about shutdown.
- The Bun segfault in the notification-email suite stays open, as its own
  defect.

## Decisions

**The child picks the port, and reports it.** `spawnServer` passes `PORT=0`.
The operating system assigns a free one, and the child logs the number it got.
The test reads it from that line.

The alternative was a probe in the parent: bind port 0, read the assignment,
close, hand the number to the child. It needs no stdout work. It also leaves a
race between the close and the child's bind.

`development-toolchain` refuses a fix that leaves a residual defect where the
first one stood. A narrow race is still a race. This suite exists to prove a
shutdown path, not to exercise one.

**`spawnServer` buffers stdout from the spawn.** Finding the port means reading
the stream while the child lives. A stream reads once, so a later
`new Response(proc.stdout).text()` would return nothing.

So the helper accumulates stdout as it arrives, and returns the text alongside
the process. The three tests assert against that accumulation.

The reader awaits the pump to the stream's end before it returns. The tests
assert on a line the child writes as it exits. A read of the accumulation so
far would instead rest on `proc.exited` resolving after the pipe drains.

Two adversarial runs failed to break that ordering. One took 40 spawns with a
short trailing write. The other took 30 with 90 KB burst-written just before
exit. The awaited pump makes the ordering stated rather than lucky.

The readiness poll goes with it. The startup log line arrives when the server
listens. The line carrying the port is therefore the readiness signal itself.
`/livez` needs no second proof. The deadline moves with the poll rather than
going. It now bounds the wait for that line, so a child that never starts
still fails with a stated reason.

**`startHttpServer` returns the port it bound.** It returned `{ stop }` alone,
so a caller passing `PORT=0` had no way to learn the assignment. The apply
found that; the design had assumed the value was already in hand.

The in-process test calls `startHttpServer` directly and reads
`process.env.PORT`. So it sets `0` and reads `port` off the returned object. No
log parsing there.

The alternative was leaving that one test on a fixed port. It fails the rule
this change adds, in the file the change exists to fix.

Bun types `Server.port` optional, because a unix-socket server has none. This
one always passes a numeric `port`, so it always listens on TCP.

**A `finally` kills the child.** Each end-to-end test takes one `try` around
what follows its spawn, and a `SIGKILL` on the way out.

`SIGKILL` rather than `SIGTERM`, because the graceful path is what the test
just exercised. A cleanup that waits could also hang a failing run.

A runner that segfaults runs no `finally`. The ephemeral port is what makes
that survivable. This half is hygiene, not the fix.

## Risks / Trade-offs

- The child's log format becomes something the test parses -> `src/log.ts`
  emits one JSON line per call. The test matches on `msg` and reads `port`. A
  format change breaks the test at its own assertion, where a reader sees
  why.
- Dropping the `/livez` poll drops a check -> the poll proved the server
  answered a request. The startup log proves it bound a port. The three tests
  then signal the child and assert on its exit, which the poll never covered.
- An orphan from before this change still holds 48232 -> nothing here evicts
  it, and nothing here needs to. The new run asks for no fixed number.
- The suite gains no coverage -> correct. It converts a wandering result into
  a stable one, which is what `development-toolchain` asks of a flake.

## Migration Plan

No data, no schema, no runtime code. The change lands in one test file and one
spec.

Rollback is a code revert, and it restores the flake rather than breaking
anything.

## Open Questions

None. Context answers the one question worth asking. No other suite binds a
fixed port.
