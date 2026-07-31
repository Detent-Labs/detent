## Why

The DB-backed suites fail about one test per full `bun test` run, and almost
never the same test twice. Measured on 2026-07-31 over **twenty** full runs:
**eleven were red**, a rate near 55 percent. Those eleven runs name nine
distinct tests, plus one failure whose name went uncaptured.

- `unrelated rows, including an engine-internal spawn row, are delivered in the presence of a hung row` (`test/outbox.test.ts`)
- `a row that keeps failing exhausts attempts and dead-letters` (`test/outbox.test.ts`, the only one seen twice)
- `a mixed patch writes its conforming entries and drops only the mismatched one` (`test/outbox.test.ts`)
- `an unparseable claimed instance is left claimed and does not starve the batch` (`test/resolution.test.ts`)
- `a safe row targeting a field the target catalog no longer declares still writes through` (`test/migration.test.ts`)
- `a matched outcome records no unmatched event` (`test/subprocess.test.ts`)
- `a spawn whose parent is no longer running creates no child` (`test/subprocess.test.ts`)
- `subprocess: a terminal child's undelivered return blocks the relocation` (`test/subprocess.test.ts`)
- `a parked wait-state re-resolves against the store-resolved body` (`test/definitions.test.ts`)

Two of those came from a `git worktree` checked out at `origin/main`, with no
uncommitted work in it. The flakiness is therefore not a property of any change
in flight.

`.githooks/pre-push` runs `bun run check` in the devcontainer, so a flaking run
blocks the push. Landing `seed-draft-from-published` took four tries. The gate
costs a rerun about half the time. It also teaches everyone to distrust a red
run, which is the opposite of what a gate is for.

The repo already carries the older reading of this, that one
`test/subprocess.test.ts` failure was an isolated mystery. Nine tests across
five files is a different fact and needs a different answer.

## What Changes

The diagnosis landed. `src/http/server.ts:526` starts four background pollers
through `startEngine`, one of them claiming outbox rows every 500 ms. The
devcontainer has one database, so a dev server left running drives the same
tables the suite drives. Twenty runs with a dev server up went 3 red. Twenty
with none went 0 red. design.md carries the mechanism and the four captured
assertions.

- The suite gets its own database, derived from `DATABASE_URL` by appending
  `_test`, created on demand. A `bun test` run therefore cannot collide with
  a dev server, a seed, or a browser session.
- The wiring is a `bunfig.toml` test preload, so it applies to every
  `bun test` invocation. It does not depend on a caller remembering a script
  name.
- Each run prints the database it uses. A run against the wrong one becomes
  visible at once, in both directions.
- The wiring reaches a `bun test` started from the repository root, which is
  what both the gate and the documented workflow do. A DB-backed suite
  therefore belongs in `test/`, never under `packages/*/test/`.
- The separation also closes a hazard the repo already documents in the other
  direction: `bun test` truncating the devcontainer's demo state.

The change deliberately does not propose a retry wrapper, a longer timeout, or
a skipped test. Each hides the failure rather than removing it, and the suite
is the only evidence the pre-push gate has.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: the suite the gates run SHALL use a database no
  other process drives. It SHALL name that database in its output. The
  existing gate requirements assume an undisturbed database without saying so.

## Impact

- `bunfig.toml` (new) and its preload: the one place that picks the test
  database.
- `package.json`, `docs/current-state.md`, `CLAUDE.md`: the run instruction
  and the demo-state hazard both change.
- No existing engine or test file changes. The two new files under `test/`
  are the preload and its own suite. The failures were never in the suite.
- `bun run serve`, `bun run seed` and the CLI keep reading `DATABASE_URL`
  unchanged. Demo state therefore survives a test run.
