> Implement this change **before** `commit-transition-synthesized-callers`. Task 2.1
> edits `transition.ts:165-173`, the same block that change moves into
> `planStepEntry`; doing the small edit first means the restructure carries the final
> form and the block is touched once.

## 1. One transaction, parent row locked

- [x] 1.1 Wrap the parked check, the `outputMapping` writeback, and the advance in
  `src/engine/subprocess.ts:106-152` in a single `db.begin`, loading the parent with
  `SELECT … FOR UPDATE`. Load the child inside the same transaction.
  - The advance's `commitTransition` opens its own transaction, and Bun **rejects**
    `begin` on a transaction-scoped client ("cannot call begin inside a transaction
    use savepoint() instead"). Added `withTransaction` (`store.ts`), which joins an
    open transaction via `savepoint` — present only on that client, so it is the
    runtime discriminator — and used it in `commitTransition`. Verified against
    Postgres that a throw inside a savepoint propagates out of the enclosing `begin`
    and rolls the whole transaction back, so joining preserves all-or-nothing.
  - The run-to-rest cascade after the first hop stays **outside** the lock: it is
    guard-driven over committed data no longer in flux, and keeping
    `AutomaticCascadeLoop`'s `markFaulted` outside preserves today's behaviour of
    persisting the fault mark.
- [x] 1.2 Hoist the `resolveBody` calls for the parent and child bodies above the
  transaction where the ids are already known, so a cold definition cache does not
  extend the time the row lock is held.
  - **Resolved as: nothing to hoist — the task's premise does not hold here.** A pin
    (`processId`, `version`) is not known until its row is read, and the rows are read
    under the lock. An unlocked pre-read to warm the cache was implemented first and
    then **reverted**: it doubled the handler's row reads *on every delivery* — two
    extra SELECTs plus two full Zod instance parses — to shorten a miss that, versions
    being immutable and cached per process, occurs about once per `(process, version)`
    per process lifetime. A permanent hot-path cost against a rare, small one.
  - `resolveBody` therefore runs inside the transaction. On a hit it is in-process; on
    a miss it is one indexed query against `definitions`. Recorded in `design.md`.
- [x] 1.3 Drop the post-writeback re-load and re-check (`:145-147`). They exist to
  compensate for the missing lock and are dead under it. Keep the writeback's own
  `currentStepId` gate (`:138`) as a belt — it costs nothing.
  - The re-load also supplied the merged data to the advance; that is now the same
    shallow merge applied locally (`{...parent.data, ...patch}`), so the guards and
    any deadline timer armed on entry still see the written-back values.
- [x] 1.4 Confirm this handler writes no table other than `instances` inside the
  transaction, so it cannot invert lock order against the outbox transaction that
  dispatched it.
  - **Amended — the literal claim is false, the conclusion holds.** The advance's
    `commitTransition` also INSERTs into `history_entries` and `outbox`. Those are
    *fresh tuples*: they take no lock on any existing row. The handler therefore
    never waits on an existing `outbox` row, which is what an inversion against
    `drainOutbox`'s tx2 (outbox row → instances row) would require. Same-row overlap
    is impossible anyway — outbox.ts runs the handler outside any transaction, so
    tx2 begins only after it returns.

## 2. Read the parent link, not the frozen config

- [x] 2.1 Remove `parentStepId` from the return action's config at
  `src/engine/transition.ts:169`. Leave `parentInstanceId` and `childOutcome`.
- [x] 2.2 Derive `parentStepId` from the loaded child's `parent.stepId` and use it at
  all remaining sites: the parked check (`:115`), the step lookup (`:119`), and the
  writeback's `WHERE` (`:138`). A partial replacement leaves the writeback guarded by
  a value the check no longer uses.
  - All three sites read the one `parentStepId` bound from `childInst.parent.stepId`;
    no second copy exists to disagree.
- [x] 2.3 Treat a child with no `parent` link as a no-op, matching the missing-child
  treatment at `:124`. The return is enqueued only for a child that has a link, so
  this is a backstop.
- [x] 2.4 Keep the two outcomes exactly as they are: current step differs from the
  linked step → silent no-op, row stays delivered; current step equals the linked step
  but is not a subprocess step → throw.
- [x] 2.5 Confirm the handler ignores a `parentStepId` still present in an
  older row's config, so rows enqueued before this change drain without a
  compatibility shim. No migration, no backfill.
  - The destructuring names only `parentInstanceId` and `childOutcome`; an extra
    config key is unreachable. Demonstrated by the mutation run — re-introducing the
    frozen field required editing the handler, not just the config.

## 3. Tests

- [x] 3.1 The stale-snapshot regression: enqueue a return (child reaches terminal),
  **then** update the child's `parent.stepId` and the parent's `currentStepId` to a
  different subprocess step, **then** deliver. Assert the parent is woken and its
  `outputMapping` applied. Order matters — enqueue first, move second, deliver third —
  or it passes without the fix.
  - "a parent whose linked step changed after enqueue is still found". Needed a parent
    with two subprocess steps (`twoSubParentBody`) writing distinct fields, so the test
    asserts the *updated* step's mapping ran and the abandoned step's did not — the
    frozen and live answers are distinguishable, not merely both-present.
- [x] 3.2 The atomicity regression: interleave a parent transition off the subprocess
  step with a return delivery. Assert the outcome is all-or-nothing — either the
  writeback and advance both happened, or neither did. This is the test the first
  draft of this change would have failed.
  - "a parent transition racing the return cannot split the decision". **A blind race
    does not detect the defect** — the first version fired the move concurrently 20×
    and the unlocked implementation passed every time, because the writeback's own
    `currentStepId` gate and the re-check absorb almost every interleaving. The window
    has to be aimed at: the move is now a single gated UPDATE that fires iff the parent
    is *still parked* AND the writeback is *already visible to another session*. That
    conjunction is precisely the split, and one transaction makes it unreachable —
    nothing is visible until the advance has committed with it. Confirmed by mutation
    4.3.
- [x] 3.3 The legitimate-move-on case stays a silent no-op: parent leaves by an
  authored path, return delivered, no writeback, row `delivered`, not dead-lettered.
- [x] 3.4 The contradiction case still throws: parent parked at the child's linked step
  where that step is not a subprocess step.
  - Observed through the outbox row (the worker swallows the throw): `pending` with
    `attempts = 1`, i.e. failed and retried rather than delivered.
- [x] 3.5 A child with no `parent` link is a no-op, not a throw.
- [x] 3.6 An enqueued return's config carries no parent step id.
- [x] 3.7 The existing subprocess suite passes unchanged — this change is
  behaviour-preserving for every case that works today.

## 4. Verification

- [x] 4.1 `bun run typecheck` clean.
- [x] 4.2 Full `bun test` with `DATABASE_URL` set. A green without the variable proves
  nothing, and a single-file rerun is not the signal.
  - **236 pass, 0 fail, 0 skipped** across 16 files (was ~230). Skip count read off a
    JUnit report, not inferred — and each of the six new tests confirmed present by
    name, so none silently skipped.
- [x] 4.3 Mutation-check **on a copy of the tree, never the shared working tree**:
  restore the frozen `parentStepId` at the parked check → 3.1 fails by name; replace
  the single transaction with the original sequence of independent reads → 3.2 fails
  by name.
  - Run on a scratchpad copy against a throwaway `mutation_check` database; both
    removed afterwards, and the shared tree verified free of `MUTATION` markers.
  - Mutation 1 (frozen `parentStepId` restored at the parked check): 3 fail — 3.1 as
    specified, plus 3.6 and 3.4, which also depend on the link being read live.
  - Mutation 2 (single transaction → original independent reads + re-check): 3.2 fails
    alone. This is the mutation that exposed the first version of 3.2 as non-detecting;
    the rewritten test kills it.
  - Unmutated copy: 19/19, three consecutive runs.
