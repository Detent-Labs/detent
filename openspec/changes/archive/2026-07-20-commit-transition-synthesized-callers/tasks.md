> Implement **after** `harden-subprocess-return`. That change edits
> `transition.ts:165-173` — the return-action config — which task 1.1 below moves into
> the planner. Doing it first means the block is touched once.

## 1. Split planning from execution

- [x] 1.1 Extract what `commitTransition` computes before its `db.begin`
  (`src/engine/transition.ts:86-127`) into `planStepEntry(instance, target, body,
  opts) -> StepEntryPlan`. No I/O. `opts` carries `pathId`, `cause`, `actorId` and
  `actions` — without them the `HistoryEntry` and the enqueued rows are
  unconstructible — plus the overrides in section 2.
  - `at` is **not** an opt: the planner reads the clock once itself, per 1.5 and the
    design's rejection of injecting `{now, newId}`. This task and `design.md` both
    listed it, contradicting that; corrected in each.
- [x] 1.2 `StepEntryPlan` carries: the next `Instance`, the `HistoryEntry`, the
  `InstanceEvent[]`, the outbox rows to insert (trigger actions, spawn, return), and
  the derived `next_timer_at`. The applier only writes what is on the plan.
- [x] 1.3 Extract the transaction body (`:129-174`) into `applyStepEntry(tx, plan,
  extraFields?)`, taking the **transaction handle**, never the pool. It throws
  `ConcurrencyConflict` on a zero-row OCC update exactly as today.
- [x] 1.4 `commitTransition` becomes `db.begin(tx => applyStepEntry(tx,
  planStepEntry(...)))`, keeping its current signature minus `status` and remaining
  the ordinary entry point. Export `planStepEntry` and `applyStepEntry`.
- [x] 1.5 Document the planner as I/O-free but neither pure nor total: it mints two
  kinds of id and reads the clock, and `armStepTimers` can raise. Tests comparing
  plans must mask `entry.id`, `events[].id` and `at`.

## 2. The overrides and the extras channels

- [x] 2.1 Derive `status` in `planStepEntry` as `target.terminal ? "completed" :
  instance.status`, with `opts.status` overriding. Drop the required `status`
  parameter from `commitTransition`.
- [x] 2.2 Remove the duplicated derivation at the three call sites (`:204`, `:300`,
  `:382`). Keep `cancelInstance`'s explicit `cancelled` (`:239`) — the cancel-sink is
  terminal, so the derived default would be `completed` and the override is
  load-bearing.
- [x] 2.3 `opts.timers`: a pre-computed armed set replaces the `armStepTimers` call
  (`:100`); the planner still derives `next_timer_at` from it via `minFireAt`. A
  supplied set yields no drops of the planner's own — hence 2.5.
- [x] 2.4 `opts.entryVersion`: the version recorded on the `HistoryEntry` (`:120`)
  **and** on the drop events (`:111`). Both sites.
- [x] 2.5 `opts.events`: additional events appended to the plan's event list and
  written in the commit transaction. Without this a caller supplying its own timer set
  cannot record the drops it computed except by mutating the returned plan.
- [x] 2.6 `opts.suppressSpawn`: omit the spawn enqueue (`:158-162`). Do **not** infer
  it from `instance.currentStepId === target.id` — an authored self-loop is a genuine
  re-entry that must spawn.
- [x] 2.7 Leave the return enqueue (`:165-173`) unconditional — **not** because its key
  is sequence-free (it is `idempotencyKey(instanceId, nextSeq, ret.id)` at `:172`,
  exactly like the spawn) but because entering a terminal step derives `completed` and
  no path transitions a non-running instance. The safety is that chain, and
  `opts.status` can break it: `cancelInstance` enters a terminal step with a
  non-`completed` status and so does enqueue a return. Captured as a requirement, not
  only here.

## 3. The applier's field patch — the restructure

- [x] 3.1 Replace the four-deep `jsonb_set` nest (`:136-141`) with a single top-level
  merge folding the fixed fields and `extraFields` together. Dynamic nesting through
  Bun.sql tagged templates is impractical; this is a rewrite of the applier's central
  statement, not a parameter.
- [x] 3.2 Keep `extraFields` under the same OCC predicate and the same
  `transition_seq` / `next_timer_at` column updates.
- [x] 3.3 Update the comment at `:130-135`. Its disjointness reasoning holds only while
  this path never writes `{data}`; with a patch that can, state the condition and the
  caller's obligation to hold the row across its read and commit.
- [x] 3.4 Update the module docstring (`:1-12`) and `commitTransition`'s docstring
  (`:67-74`), which names the removed `status` parameter.

## 4. Equivalence — the acceptance criterion

- [x] 4.1 Full `bun test` with `DATABASE_URL` set passes **unchanged** before any new
  surface is exercised. This is a refactor of the hot path of every transition and of
  its central SQL statement; equivalence is the bar.
- [x] 4.2 A test asserting the nothing-supplied path writes what it wrote before: same
  instance row fields, same `HistoryEntry` shape, same outbox rows, same
  `next_timer_at` — with ids and `at` masked per 1.5. Compare against a captured
  expectation, not a re-derivation using the same code.
- [x] 4.3 Confirm the three existing callers behave identically after losing their
  `status` derivation, in particular that a manual transition to a terminal step still
  completes and `cancelInstance` still commits `cancelled`.

## 5. Tests for the new surface

- [x] 5.1 `planStepEntry` performs no writes: plan, never apply, assert nothing exists.
- [x] 5.2 A caller opens its own transaction, calls `applyStepEntry`, writes an extra
  row, and both commit together; a failure in either rolls back both.
- [x] 5.3 `extraFields` is written under the OCC predicate: applied from a stale
  sequence, none of it lands.
- [x] 5.4 Status derivation: terminal target → `completed`; non-terminal → carried
  through; explicit override → the override.
- [x] 5.5 `opts.timers` replaces arming and drives `next_timer_at`; an omitted carried
  timer is absent afterwards.
  - The second clause was initially unmet: the fixture built instances with no
    `timers` field, so no test ever carried one and the timers-spec scenario "the
    committed set still replaces what was carried" was uncovered. Now the instance
    carries a timer the supplied set omits, with a deliberately **earlier** `fireAt`
    so a merge-instead-of-replace would surface twice — in the set and in
    `next_timer_at`. A second case covers the same replacement on the default
    arming path.
- [x] 5.6 `opts.entryVersion` lands on both the `HistoryEntry` and the events.
- [x] 5.7 `opts.events` are written in the commit transaction and roll back with it.
- [x] 5.8 `opts.suppressSpawn` enqueues no spawn row; the same commit **without** it
  enqueues one whose `parentSeq` yields — via `subprocessChildId` — an id differing
  from the existing child's. Re-derive the id in the test; the row itself carries only
  `{subprocessStepId, parentSeq}`.
- [x] 5.9 Exactly one return is enqueued for a terminal entry with a parent.
- [x] 5.10 Defaults reproduce current behaviour for every override.
- [x] 5.11 A replanned entry commits at most once, both branches: after a rolled-back
  apply the replan commits (the sequence was untouched), and after a committed one it
  raises `ConcurrencyConflict`. Added because the spec carries the scenario and
  `design.md` rests the rejection of injected `{now, newId}` on it, while no task or
  test covered it.
- [x] 5.12 `extraFields` cannot overwrite the plan's own four fields. The patch spread
  sat **last**, so a caller patching `transitionSeq` would have written a body sequence
  disagreeing with the promoted column and the OCC predicate — and rehydrate reads the
  body. Order reversed so the plan wins; the spec's wording is "alongside", not "over".

## 6. Verification and documentation

- [x] 6.1 `bun run typecheck` clean.
- [x] 6.2 Full `bun test` with `DATABASE_URL` set. A green without the variable proves
  nothing; a single-file rerun is not the signal.
- [x] 6.3 Mutation-check **on a copy of the tree, never the shared working tree**:
  remove the status derivation → 5.4 fails by name; remove the `suppressSpawn` guard →
  5.8 fails by name; drop `extraFields` from the OCC predicate → 5.3 fails by name.
- [x] 6.4 Update `CLAUDE.md`'s engine entry: `transition.ts` exposes a plan/apply seam
  with a field patch and an events channel, `status` is derived from the target step,
  and a caller needing to vary a step entry extends the seam rather than forking it —
  with the reason, since the reason is what keeps the next caller from forking anyway.
  Note that `createInstance` remains a separate step-entry path that does not inherit
  these consequences.
