## Why

`makeSpawnHandler` (`src/engine/subprocess.ts:61-62`) treats "child row already
exists" as "this delivery is fully done" and returns immediately. But two repairs
run *after* child creation on the first delivery: driving the new child to rest
(`resolveAutomatic`, so an immediately-terminal child's own return gets enqueued)
and the cancel-orphan backstop (self-cancelling a child left running under a
parent that was cancelled mid-spawn). Both are skipped on every redelivery.

At-least-once dispatch means redelivery is not a rare edge case — a crash or
worker restart between the child's `createInstance` and either repair is exactly
the window redelivery exists to close, and the early return closes over it
instead. Two concrete strandings follow: a child that reaches a terminal step
before `resolveAutomatic` runs (an all-automatic path to an immediately-bound
outcome — the shipped credit-check shape) never enqueues its return and sits
terminal forever with the parent parked on the wait-state; a child left running
under a since-cancelled parent is never caught by the backstop and runs
indefinitely with no parent to return to. Both are silent — no error, no event,
just a parked or orphaned instance.

## What Changes

- Restructure `makeSpawnHandler` so the existence check short-circuits only
  *creation* (do not re-run `createInstance`/`inputMapping` seeding for an
  existing child), not the two post-creation repairs. Both `resolveAutomatic`
  (drive-to-rest) and the cancel-orphan backstop MUST run on every delivery,
  first or redelivered alike.
- Keep the repairs idempotent under repeated execution (they already are:
  `resolveAutomatic` is a no-op on a non-automatic/already-parked step, and the
  backstop only acts when the child is still `running` under a non-running
  parent) — no new idempotency mechanism is needed, just removing the early
  return that bypasses them.

## Capabilities

### Modified Capabilities
- `subprocess-execution`: the "Spawn is idempotent under at-least-once
  dispatch" requirement currently only guarantees at most one child row; it must
  additionally guarantee that drive-to-rest and the cancel-orphan backstop are
  attempted on every delivery, not only the one that inserted the row.

## Impact

- `src/engine/subprocess.ts` (`makeSpawnHandler`): the only code change.
- `test/subprocess.test.ts`: new redelivery tests (finding a fresh vs. an
  existing child must not change which repairs run).
- No schema, contract, or migration changes.
