## Context

`migrateOne` (`src/engine/migration.ts`) commits an instance onto the target version through the
shared `planStepEntry`/`applyStepEntry` seam, then — when the step changed — repoints any linked
child's `parent.stepId` to the new step:

```sql
UPDATE instances
SET body = jsonb_set(body, '{parent,stepId}', (${[targetStepId]}::jsonb) -> 0)
WHERE body->'parent'->>'instanceId' = ${id} AND body->'parent'->>'stepId' = ${srcStepId}
```

This repoint is unconditional on the child's liveness and on whether the target step is even a
subprocess step. `core.returnSubprocess` reads the child's `parent.stepId` at delivery time, checks
the parent is still parked there (`parent.currentStepId === parent.stepId`), then requires that step
to carry a `subprocess` config to evaluate its `outputMapping`. The repoint therefore misdirects a
still-pending return:

- **subprocess → subprocess relocation.** `stepChanged` is true, so `suppressSpawn` is false and
  migration *also* enqueues a genuine spawn for the new step. The repointed old child now points at
  the new step too. Whichever return delivers first drives the parent off the new step under that
  step's `outputMapping` — applied to the wrong child's outcome/data if the old one wins — and the
  other child is silently orphaned (its later return finds the parent no longer parked).
- **subprocess → non-subprocess relocation.** The repointed return looks up `outputMapping` on a step
  with no `subprocess` config, throws `return: not a subprocess step`, retries, and dead-letters. The
  child is orphaned forever.

No requirement in `instance-migration` governs this repair, and `validatePlan` imposes no constraint.

## Goals / Non-Goals

**Goals:**
- No migration ever misdirects or orphans a live child.
- A relocation blocked by a live child is deferred (transient skip), not failed, and retries once the
  child settles — mirroring the existing `pending-actions` gate.
- The skip is queryable and distinguishable from the two existing skip causes.

**Non-Goals:**
- Reconciling an in-flight child return across a relocation (the "decline over reconcile" precedent).
- Independent upward child cancellation, or any change to subprocess return semantics.
- Repointing settled children (proven inert — see Decisions).

## Decisions

**Gate the relocation on child liveness; do not repoint.** Before committing a relocation that vacates
a subprocess-typed step, query for a live linked child of that step:

```
child.parent.instanceId = <id> AND child.parent.stepId = <srcStepId>
AND (child.status = 'running' OR EXISTS an undelivered outbox row for the child)
```

If one exists, skip the instance with reason `child-in-flight` (recorded as a `migration.skipped`
event, no `transitionSeq` advance, no `HistoryEntry`) — exactly the shape of the `pending-actions`
skip. Otherwise migrate normally and delete the repoint entirely.

- *Why decline, not reconcile?* Identical to `pending-actions`: a pending return is keyed to the
  enqueuing version's step/contract; re-pointing it is a snapshot-vs-live race with no cheap correct
  answer. The established project stance (`CLAUDE.md`, "Reconcile in-flight action writebacks") is that
  deferring one instance's migration until the child settles preserves a result a later invocation
  delivers anyway.
- *Why is not repointing the settled child safe?* The only other reader of a child's `parent.stepId`
  is `core.returnSubprocess`, which no longer fires for a settled (terminal + fully delivered) child.
  `cancelInstance`'s cascade sweep keys on `parent.instanceId` + `status = 'running'`, never on
  `parent.stepId`. A settled child's stale step id is unreachable, so leaving it is correct and cheaper
  than a write.
- *Why "running OR undelivered outbox row" as the liveness test?* A child at a terminal step has
  already enqueued its `core.returnSubprocess` row but may not have delivered it; that row is exactly
  the return the repoint would misdirect. Its own status is no longer `running`, so status alone
  misses it — the undelivered-row clause covers it, and is the same signal `pending-actions` uses on
  the parent's own outbox.

**Only subprocess-typed source steps gate.** A non-subprocess source step never has a linked child, so
the gate is a no-op there and need not run. Checking `stepChanged && sourceStep.subprocess` before the
query keeps the common path (data-only migrations) free of an extra round-trip.

## Risks / Trade-offs

- [A migration invocation makes no progress on instances whose children never settle] → Same exposure
  as `pending-actions` today; a child that will not settle is an independent operational problem
  (stuck wait-state, dead-lettered return) surfaced elsewhere. The skip is recorded and queryable, so
  the stall is visible, not silent.
- [The liveness query adds a round-trip per relocating subprocess parent] → Bounded to relocations off
  a subprocess step (rare), and it reuses the row-locked transaction already open.
- [A child settling between the gate check and commit] → The parent's own commit is OCC-guarded on
  `transitionSeq`; the child settling does not race the parent's write. Worst case the parent is
  skipped one invocation later than strictly necessary and migrates on the next — the conservative
  direction.

## Migration Plan

Additive: a new enum value and a new gate. No stored-definition migration, no data backfill. Deploy is
a code change; rollback is reverting it (the old unconditional repoint returns, restoring the prior —
buggy — behavior, with no persisted state to unwind).

## Open Questions

None. The skip-reason name (`child-in-flight`), the liveness predicate, and the no-repoint decision are
settled above.
