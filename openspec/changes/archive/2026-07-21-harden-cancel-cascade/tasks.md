## 1. Schema

- [x] 1.1 In `src/engine/store.ts`'s `initSchema`, add
      `ALTER TABLE instances ADD COLUMN IF NOT EXISTS cancel_sweep_state text NOT NULL DEFAULT 'idle'`,
      following the existing `resolve_state` column's convention (no index —
      this column is read by `instance_id` only, never scanned).

## 2. Durable flag at the commit seam

- [x] 2.1 In `src/engine/transition.ts`'s `applyStepEntry`, extend the
      instance UPDATE with a `cancel_sweep_state` CASE, conditioned on the
      commit's resulting status being `'cancelled'`
      (`cancel_sweep_state = CASE WHEN ${next.status} = 'cancelled' THEN 'pending' ELSE cancel_sweep_state END`),
      mirroring the existing `resolve_state` CASE in the same statement.
- [x] 2.2 Update `applyStepEntry`'s doc comment to describe the new column's
      contract alongside the existing `resolve_state` explanation.

## 3. Fault-isolated, resumable sweep

- [x] 3.1 In `src/engine/transition.ts`, extract the child-cancellation sweep
      out of `cancelInstance`'s inline `for` loop into a
      `sweepCancelledChildren(parentInstanceId, actor, db, resolveBody)`
      helper that isolates each child's cancellation in its own try/catch,
      groups outcomes into `{ cancelled, conflicted, failed }` (bucketing
      `ConcurrencyConflict` as `conflicted`, everything else — including an
      unresolvable child body — as `failed`), and sets
      `cancel_sweep_state = 'done'` only when both `conflicted` and `failed`
      are empty.
- [x] 3.2 Update `cancelInstance`'s entry guard so that when
      `instance.status !== "running"` but the instance is `"cancelled"` and a
      `resolveBody` is supplied, it reads `cancel_sweep_state` for that
      instance and, if `'pending'`, calls `sweepCancelledChildren` before
      returning — without appending a `HistoryEntry` or advancing
      `transitionSeq`.
- [x] 3.3 Update `cancelInstance`'s fresh-cancel path (the existing
      `resolveBody`-supplied branch after its own commit) to call the same
      `sweepCancelledChildren` helper instead of its current inline loop.
- [x] 3.4 Update `cancelInstance`'s doc comment to describe fault isolation,
      the `cancel_sweep_state` durability contract, and the resume-on-
      already-cancelled behavior.

## 4. Tests

- [x] 4.1 `test/cancel.runtime.test.ts` (or a new file if that suite doesn't
      already cover subprocess propagation): a child whose cancellation
      throws does not prevent its siblings from being cancelled in the same
      sweep.
- [x] 4.2 A child cancellation that raises `ConcurrencyConflict` is bucketed
      separately from a genuine failure and does not, by itself, count as a
      broken sweep in a way indistinguishable from a real failure.
- [x] 4.3 After a sweep with a failed child, `cancel_sweep_state` is
      `'pending'`; re-invoking `cancelInstance` on the (already-cancelled)
      parent with a `resolveBody` that now succeeds resumes and completes the
      sweep, cancelling the previously-failed child.
- [x] 4.4 Re-invoking `cancelInstance` on the already-cancelled parent during
      the resumed sweep appends no new `HistoryEntry` and does not advance
      `transitionSeq` for the parent.
- [x] 4.5 A parent cancelled with no active children (or whose sweep already
      completed cleanly) converges `cancel_sweep_state` to `'done'`, and
      re-invoking `cancelInstance` again is a true no-op (no child-cancel
      attempts, verifiable via a `resolveBody`/cancel spy not being called
      again).
- [x] 4.6 Nested chain: a grandchild sweep failure is isolated to the
      immediate child's own `cancel_sweep_state` and does not prevent the
      top-level parent's sweep (of its direct children) from converging to
      `'done'`.

## 5. Verification

- [x] 5.1 `bun run typecheck` passes.
- [x] 5.2 `bun test` (with `DATABASE_URL` set) passes in full, including the
      new cases above and all pre-existing `cancel`, `subprocess`, and
      `transition` suites. (376 pass / 0 fail / 1268 expect() calls.)
- [x] 5.3 `/opsx:verify` review: `sweepCancelledChildren`'s
      `instanceSchema.parse` originally sat outside the per-child `try`
      (`transition.ts`), so a malformed child row would abort the sweep for
      every remaining sibling — reproducing this change's own bug for that one
      failure mode. Fixed by selecting `instance_id` alongside `body` and
      moving the parse inside the `try`, bucketing a parse failure by
      `row.instance_id` as `failed`; regression test added ("a malformed child
      row does not abort the sweep for its siblings").
