# Proposal

## Why

A green full-suite run prints 5581 lines and 523110 characters. An agent that
reads that output spends its context on pass lines. `rtk test` reduces the
same run to 6 lines, measured on 2026-09-30. But the filter drops the line
`[test] database: <name>`. `silent-green.sh` then rejects the filtered output,
and on a green run rtk writes no full log that the gate could read instead.
A filtered run therefore loses the silent-green check today.

## What Changes

- Add `scripts/test-gated.sh`. It runs the command it receives, prints the
  full output, and then runs `silent-green.sh` over that output. It exits with
  the command's code, or with 1 when the gate rejects the run.
- Add three cases for the runner to `test/gates.test.ts`.
- Replace the hand pipe in the `CLAUDE.md` rule "Run `bun test` with
  `DATABASE_URL` set, always" with two calls. Inside the devcontainer:
  `sh scripts/test-gated.sh bun test`. From the host, the same call through
  `rtk test` and `docker compose exec`, as design.md states it.
- Record in `CLAUDE.md` the measured values and three traps: the words
  `bun test` must stay in the call, `rtk test` breaks a quoted `sh -c`
  script, and `rtk err` cuts object diffs short.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: adds one requirement. A hand run of the suite can apply
  the silent-green check in the same call that runs the suite.

## Impact

- New file `scripts/test-gated.sh`. It needs only a POSIX shell in the
  devcontainer.
- `test/gates.test.ts`, three new cases. They do not need a database.
- `CLAUDE.md`, section Conventions.
- The push hook, `bun run check` and CI stay unchanged. `rtk` stays optional:
  the script also runs without it.
