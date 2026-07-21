## Context

A step-entry commit lands an instance on a target step; if that step is
all-automatic, the caller keeps cascading by committing further hops until the
instance rests (`resolveAutomatic`, `transition.ts:474-499`). Every entry point
into this cascade commits each hop through the shared seam
(`commitTransition` → `applyStepEntry`, `transition.ts:269-299`) but drives the
*next* hop purely in-process:

- `executeManualTransition` / `fireTimer` (transition timer branch): commit one
  hop, then call `resolveAutomatic` synchronously.
- `startInstance`: `createInstance`, then `resolveAutomatic` synchronously.
- Subprocess spawn handler (`subprocess.ts`, `core.spawnSubprocess`):
  `createInstance` the child, then `resolveAutomatic(child, ...)` synchronously.
  Already hardened for handler-level redelivery (`harden-subprocess-spawn-redelivery`):
  a redelivered spawn re-runs the drive-to-rest unconditionally. That closes the
  gap when the *handler itself* is retried, but the retry is driven by the
  outbox's own lease/redelivery, not by `resolve_state`.
- Subprocess return handler (`subprocess.ts`, `core.returnSubprocess`): commits
  the parent's first hop off the subprocess step inside a locked transaction,
  then calls `resolveAutomatic(advance.committed, ...)` **outside** that
  transaction. A crash here is *not* covered by outbox redelivery: redelivery
  re-reads the child's `parent.stepId` and checks it against the parent's
  `currentStepId`, which no longer matches once the first hop has committed, so
  the redelivered return is a silent no-op — the parent is stuck wherever the
  interrupted cascade left it.

None of these mark the instance in any way that survives a crash between a
commit and the next hop (or between the last hop and the point where the
caller would otherwise be "done"). `resolve_state` already exists for exactly
this shape of problem: an outbox writeback flags a parked instance
`resolve_state='pending'` (`writeback-reresolution`), and instance migration
independently flags the same column after its own commit
(`migration.ts:380`) rather than cascading inline, deferring to the same
`resolution.ts` worker. Migration's comment on this is explicit: "flag for
automatic re-resolution (migration defers the cascade to the worker rather
than nesting commits)." This change makes that the rule for every commit, not
a migration-specific exception.

## Goals / Non-Goals

**Goals:**
- Close the durability gap: a crash between any step-entry commit and the
  completion of its cascade must be recoverable by the existing re-resolution
  worker, with no new worker, column, or event kind.
- Do this at the one seam (`applyStepEntry`) and the one instance-creation path
  (`createInstance`) that every cascade entry point already funnels through, so
  no call site needs to know it is participating in crash recovery.
- Leave the synchronous (no-crash) behavior observably unchanged: an advance
  operation still returns only once the instance is at rest.

**Non-Goals:**
- Findings #5 (unmatched `child.outcome` strands the parent) and #6 (best-effort,
  unrepairable cancel cascade) are different failure shapes — neither is a
  "commit, then crash before cascading" gap — and are explicitly out of scope
  for this change, even though the review groups them with #4 as one "liveness
  cluster."
- No attempt to reduce the extra re-resolution-worker pass every transition now
  incurs (see Risks). Migration already accepts this cost; this change extends
  it rather than optimizing it.
- No change to `resolve_state`'s claim/lease/CAS-clear semantics in
  `resolution.ts` — the worker already treats any `'pending'` row uniformly
  regardless of who set it.

## Decisions

### Flag inside `applyStepEntry`, not at each call site

`applyStepEntry` is the single write path every step-entry commit already goes
through (manual, automatic-hop, timer-forced, cancel, migration, and the
subprocess return's first hop). Adding `resolve_state = 'pending'` to its
existing `UPDATE instances SET body = ..., transition_seq = ..., next_timer_at
= ...` statement, under the same transaction and the same OCC predicate,
covers every current and future caller for free — consistent with how this
codebase already treats `applyStepEntry`/`planStepEntry` as the seam a caller
*extends* rather than forks (`transition-execution` spec, "No caller SHALL
re-implement the commit"). The alternative — having each of the four call
sites (manual/automatic entry, `startInstance`, spawn handler, return handler)
set the flag itself before or after its own `resolveAutomatic` call — was
rejected: it requires every future cascade entry point to remember to do it
too, exactly the kind of consequence-by-convention the shared seam exists to
avoid.

### Flag whenever the resulting status is `running`, not unconditionally

`applyStepEntry` has no cheap way to know whether its target step is
all-automatic (that's a property of the `ProcessBody`, which `planStepEntry`
already consulted to arm timers, but `applyStepEntry` itself is deliberately
body-agnostic and I/O-only) — so it cannot skip flagging based on
cascade-eligibility the way it might skip based on status. It flags whenever
`next.status === 'running'` (the status the plan already derived), leaving
`resolve_state` untouched otherwise. This started as "flag unconditionally,
mirroring migration" and was narrowed after implementation surfaced two
problems with the unconditional version (both caught by the test suite, not
by inspection):

- **Dead flags on non-running instances.** The re-resolution worker's claim
  query is `WHERE body->>'status' = 'running' AND resolve_state IN (...)`
  (`resolution.ts`). A commit onto a terminal step, or a `cancelled`
  override, flagged `'pending'` unconditionally would never be revisited —
  the worker excludes it by status before it ever looks at `resolve_state`.
  Harmless (nothing else reads the column), but pointless: the flag can
  never be acted on.
- **The worker clobbering its own claim.** `resolution.ts`'s pass sets
  `resolve_state = 'claimed'` before running `resolveAutomatic`, and clears
  `'claimed' → 'idle'` afterward, CAS-style. If that `resolveAutomatic` call
  itself commits a hop (which it does whenever there is a cascade to
  resume — the exact case this change adds), an *unconditional* flag write
  would reset `'claimed'` back to `'pending'` on every such hop, so the
  worker's own end-of-pass CAS-clear finds nothing to clear. The state
  cascade still completes correctly in that same pass; only the
  bookkeeping column lags.

Conditioning on `next.status === 'running'` fixes the first problem
outright (a terminal/cancelled commit never touches the column, so it
can't leave a stale flag it introduced) and narrows the second to
multi-hop cascades whose *intermediate* hops land on a still-running step
(the final hop, landing on rest, no longer disturbs a `'claimed'` marker).
See "No CAS-clear on the synchronous success path" below for why the
remaining case is accepted rather than engineered away.

Teaching `applyStepEntry` to also inspect the body to skip flagging when the
target step is not cascade-eligible (a manual step, say) was considered and
rejected: it would need a new parameter threading the body through a
function that is deliberately I/O-only today, to save flags that are already
free to leave — resting on a manual (still-`running`) step is exactly the
case that converges to `'idle'` in one clean worker pass (`resolution.test.ts`'s
pre-existing "re-resolving an instance parked on a manual step is a no-op").

### Flag `createInstance` unconditionally too

`createInstance` has exactly two callers (`startInstance`, the subprocess
spawn handler), and both immediately call `resolveAutomatic` on the instance
they just created. Inserting with `resolve_state = 'pending'` instead of the
column's `'idle'` default closes the same gap for the "0th hop" — a crash
between the INSERT and the first cascade attempt.

### No CAS-clear on the synchronous success path, and no attempt to make `resolve_state` always reach `'idle'`

Considered adding an explicit `resolve_state` clear-to-idle at the end of a
successful in-process cascade (mirroring `resolution.ts`'s own claim/clear), to
avoid leaving every transitioned instance flagged `'pending'` until the
worker's next poll picks it up as a no-op. Rejected for this change:
- It reproduces exactly the race the claim/lease/CAS machinery in
  `resolution.ts` already exists to handle: the background worker could claim
  the same row (`'pending'` → `'claimed'`) while the synchronous path is still
  mid-cascade, and now two paths are advancing the same instance concurrently.
  That's not a new correctness problem — the existing `transitionSeq` OCC
  predicate already resolves it, the same way it already resolves any two
  legitimate concurrent transitions — but it is a new *frequency* of
  `ConcurrencyConflict` on ordinary manual/automatic calls, which callers must
  already be prepared to retry, so it is a real UX cost only in aggregate.
  Adding a clear on the synchronous path would need its own CAS logic to avoid
  clobbering a concurrent flag, adding exactly the complexity this change is
  trying to avoid.
- Migration doesn't clear either; it accepts the one extra worker pass per
  migrated instance as the cost of the pattern. Matching that keeps this
  change a straightforward generalization rather than a new design.
- The extra cost is bounded and cheap: one claim UPDATE, one in-memory no-op
  `resolveAutomatic` (a single step lookup and guard evaluation, no writes),
  and one CAS-clear UPDATE, at most once per transition, absorbed by
  infrastructure that already runs continuously in production.

A related, initially-unintended consequence, found by the test suite rather
than by inspection: **`resolve_state` does not always converge to `'idle'`,
and this change makes no attempt to force it to.** Walk the case that exposes
it — the re-resolution worker claims a `'pending'` row (`'claimed'`) and its
`resolveAutomatic` call must take two or more hops to reach rest, the last of
which lands on a terminal step:
1. The first hop still lands on a `running` step, so its `applyStepEntry`
   commit sets `resolve_state = 'pending'` — clobbering this pass's own
   `'claimed'` marker (`resolveAutomatic` has no way to tell "I am the claiming
   pass" from "I am some other write"; it is the same function either way).
2. The final hop lands on the terminal step; by the "flag only when `running`"
   rule it leaves `resolve_state` untouched — but untouched now means
   `'pending'`, inherited from step 1, not `'claimed'`.
3. `resolveAutomatic` returns; the worker's end-of-pass
   `UPDATE ... WHERE resolve_state = 'claimed'` matches zero rows (it is
   `'pending'`), so no clear happens.
4. The instance is now `completed`. The worker's *claim* query requires
   `status = 'running'`, so no future pass ever selects this row again.
   `resolve_state` is stuck at `'pending'` permanently.

This is the same "dead flag" shape as the terminal-commit case above, just
reached via a different route (inherited from an earlier hop instead of set
by the terminal commit itself), and it is accepted for the same reason:
`resolve_state` has exactly one reader (the worker's own claim query), that
reader already excludes non-`running` rows, and the *actual* correctness
property — the state cascade (`currentStepId`, `status`, `data`) completing —
is unaffected and completes within the same single worker pass regardless of
where `resolve_state` lands. Engineering `resolve_state` itself to reliably
reach `'idle'` would mean either the claiming pass suppressing its own
re-flagging (requiring `resolveAutomatic`/`applyStepEntry` to know who is
calling, which they deliberately do not) or relaxing the worker's claim
query to also revisit non-`running` rows (defeating the point of that
filter). Neither is worth it to tidy a column nothing reads once an instance
is no longer `running`.

### Remove migration's now-redundant explicit flag

`migration.ts:380`'s `UPDATE instances SET resolve_state = 'pending' WHERE
instance_id = ${id}` becomes a no-op duplicate of what `applyStepEntry`
(called two lines above it, same transaction) now already does. Removing it
avoids two statements asserting the same fact and prevents them drifting
apart later.

## Risks / Trade-offs

- **[Risk]** Every committed transition landing on a still-`running` step now
  triggers one extra `resolution.ts` claim/no-op/clear cycle within the
  worker's next poll interval (500ms default), even when nothing needs to
  cascade further. → **Mitigation**: this is the same cost migration already
  imposes on its migrated population; the worker already runs continuously for
  writeback-driven re-resolution, and a no-op pass is one indexed UPDATE, one
  in-memory guard evaluation, and one indexed UPDATE. Revisit only if
  production load shows the resolution worker's queue depth becoming a
  bottleneck.
- **[Risk]** A synchronous cascade can now race the resolution worker over the
  same instance (see "No CAS-clear" above), surfacing `ConcurrencyConflict`
  from `executeManualTransition`/`fireTimer` slightly more often than today. →
  **Mitigation**: callers of these functions already must handle
  `ConcurrencyConflict` for the concurrent-transition case that predates this
  change (documented in `transition-execution`'s "stale write loses"
  requirement); this only changes the frequency, not the contract.
- **[Risk]** `resolve_state` can be left permanently `'pending'` on a
  completed/cancelled/faulted instance — either because its terminal commit
  inherited `'pending'` from an earlier hop or a pre-existing flag, or
  (rediscovered above) because a multi-hop worker-driven cascade clobbers its
  own claim partway through. A future reader of this column expecting
  `'pending'` to mean "still needs attention" would be misled for a
  non-`running` row. → **Mitigation**: document the column's actual contract
  (meaningful only while `status = 'running'`) in this design and in the
  `applyStepEntry` doc comment; no other code in the engine reads
  `resolve_state` besides the worker's own `status = 'running'`-scoped claim
  query, so nothing is currently misled. An operator dashboard or admin query
  built later against this column must filter on `status = 'running'` too.
- **[Risk]** `migration.ts`'s removed line is the one place that currently
  demonstrates the pattern in a code comment the review cites directly;
  removing it without updating the comment context elsewhere could look like
  regressing documentation. → **Mitigation**: the surrounding comment in
  `migration.ts` explaining *why* migration defers to the worker stays;
  only the now-duplicate UPDATE statement is removed.

## Migration Plan

No data migration: `resolve_state` and its index already exist
(`store.ts:79-83`, from `reresolve-after-writeback`). This is a pure code
change to which paths write `'pending'`. Deploy as an ordinary release; no
rollback complexity beyond reverting the commit; no dual-write or backfill
needed since the worker already treats `'idle'` and `'pending'` rows
identically to how it does today for every existing row.

## Open Questions

None.
