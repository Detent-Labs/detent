## Why

`test/http-shutdown.test.ts` spawns the real server entrypoint on four
hardcoded ports. A run that dies abnormally leaves its child alive, holding
the bind. The next run then fails at `spawnServer`:

```
server exited during startup with code 1: Failed to start server. Is port 48232 in use?
```

That is a captured assertion, not a guess. It reddened CI run 31835376765 on
2026-08-14. It also reproduced locally three times running, until somebody
killed the strays.

One flake became two red runs. A Bun segfault in an unrelated suite orphaned
a child. The next run then failed on the port, not on the crash.

`development-toolchain` already rules on this. Its "A wandering test result
counts as a defect" requirement covers such a result. That result "lives in
the suite, in the code it covers, or in the environment the run shares. It is
never noise to rerun past." The requirement also refuses a retry, a widened
timeout and a skip as answers. This change closes it in the suite, where it
lives.

## What Changes

- The spawned child binds an ephemeral port. `server.ts` reads
  `Number(process.env.PORT ?? 3000)`, so `PORT=0` hands the choice to the
  operating system.
- The test reads the assigned port from the child's own startup log. It
  chooses no number itself. `server.ts` logs `port: server.port`, the real
  one.
- `spawnServer` buffers the child's stdout from the moment it spawns. The
  three end-to-end tests read that buffer, where they read the stream after
  exit before.
- Each test kills its child in a `finally`. A failing assertion between spawn
  and exit then leaks no server holding a Postgres connection.
- `development-toolchain` gains the rule that prevents the class.

A stray from an earlier run can no longer collide. The operating system does
not assign a port that something currently holds.

None of this is a new pattern. `handlers-http.test.ts`, `auth-jwt.test.ts` and
`http-body-size.test.ts` bind `port: 0` already. Two files did not, and both
take the rule here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: a test that spawns a server takes an ephemeral
  port and reaps its child.

## Impact

- `test/http-shutdown.test.ts`: the four port constants go, `spawnServer`
  changes shape, and each test gains a `finally`.
- `test/schema-bootstrap.test.ts`: the second holdout. It binds 48213 and
  48214 through `startHttpServer`, and takes the same treatment.
- `docs/current-state.md`: the defect and its fix, under the toolchain.
- `src/http/server.ts`: `startHttpServer` returns the port it bound. It
  returned `{ stop }` alone, so a caller passing `PORT=0` could not learn the
  assignment. Its behaviour is otherwise unchanged.
- No change to shutdown behaviour, no new dependency, no schema work.
- The Bun segfault in `test/handlers-notification-email.test.ts` stays open.
  It is a second defect and needs its own diagnosis.
