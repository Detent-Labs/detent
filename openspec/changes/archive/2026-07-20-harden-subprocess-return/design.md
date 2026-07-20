## Context

`makeReturnHandler` (`src/engine/subprocess.ts:106-152`) receives
`{parentInstanceId, parentStepId, childOutcome}` from the outbox row's frozen
config, written at `transition.ts:169` from `instance.parent.stepId` in the commit
where the **child** reached its terminal step.

It then performs five unsynchronised steps:

| Step | Line | Notes |
|---|---|---|
| load parent | `:114` | plain read |
| parked check | `:115` | `currentStepId !== parentStepId` → `return {}` |
| step lookup | `:119` | throws if not a subprocess step |
| load child, build `child` namespace | `:123-131` | |
| writeback, gated on parked | `:136-140` | `upd.length === 0` → `return {}` |
| re-load, re-check, advance | `:145-151` | |

The child's own row already carries the same fact in `parent: {instanceId, stepId}`
(`definition.ts:703`), written at spawn (`subprocess.ts:86`).

Two distinct defects sit here. The frozen config is a stale *value*. The five
separate reads and writes are a stale *sequence* — `:145-147` re-loads and
re-checks precisely because the author knew the state could move, but a re-check is
not a lock, and `:136-140`'s `upd.length === 0 → return {}` turns the residual race
back into a silent success.

## Goals / Non-Goals

**Goals:**

- Remove the snapshot: read the parent link from the child row at delivery.
- Make the decision and the writes it justifies atomic.
- Preserve both existing outcomes and keep them distinguishable.
- Change nothing observable for any case that works today.

**Non-Goals:**

- Keeping the link current when a parent's step id changes. Nothing changes it
  today; the mechanism that will (migration) owns the repair, for every child.
- Any change to spawn, to `outputMapping` semantics, or to the outbox.
- Making the *handler* retryable on a legitimate no-op. A parent that moved on is
  not a failure and must stay delivered.

## Decisions

### The child row is the authority

`parentStepId` is read from the loaded child's `parent.stepId`.

*Why the child and not the parent:* the question is "is the parent still parked at
**the step that spawned me**". Only the child knows which step that was. Reading the
parent's current step and assuming it is the right one answers a different question,
and would apply the wrong step's `outputMapping` if the parent had since reached a
*different* subprocess step.

*Why not keep both and compare:* two copies that can disagree need a rule for which
wins, and that rule is the bug.

### One transaction, parent row locked

The parked check, the writeback, and the advance run inside `db.begin` with the
parent loaded `FOR UPDATE`. The child is loaded inside the same transaction.

*Why a lock and not a fresher read:* a fresher read shrinks the window; it does not
remove it. The first draft of this change moved the child load above the parked
check and thereby created a *new* narrow race of identical shape — child link read,
then parent read, migration in between, mismatch, silent success. Any fix built
from ordered independent reads has this property. The lock is what makes the
question and the answer refer to the same state.

*What this subsumes:* the post-writeback re-load and re-check (`:145-147`) exist to
compensate for the missing lock and become unnecessary. The writeback's own
`currentStepId` gate (`:138`) likewise — though keeping it costs nothing and is left
as a belt.

*Interaction with migration:* migration takes the same row lock for its own reasons
(it rewrites `data` wholesale and must not interleave with a writeback). The two
therefore serialise rather than racing.

*Cost:* the handler holds a row lock across CEL evaluation of `outputMapping` and
the advance commit. Both are in-process and bounded; no I/O beyond the datastore
happens under the lock. `resolveBody` stays *inside* the transaction: a pin is not
known before its row is read, so there is nothing to hoist, and a pre-read to warm
the cache would double the handler's row reads on every delivery to shorten a miss
that — versions being immutable and cached per process — happens about once per
`(process, version)` per process lifetime. The wrong trade.

*What the lock does not cover:* the child row is read inside the transaction but
**not** locked. That is sound only because nothing mutates a child's `parent` link
today, and a returning child is terminal or cancelled and therefore data-immutable.
The mechanism that will mutate the link owes this handler the guarantee:
`add-instance-migration` repairs child links *in the transaction that commits the
parent's migration*, and that transaction re-reads the parent `FOR UPDATE`. Both
sides therefore take the parent row first and serialise on it. Weakening migration's
locking — or repairing links outside its per-instance transaction — reintroduces the
mismatch this change exists to remove, on the child's side instead of the parent's.

### The two outcomes keep their conditions

- `parent.currentStepId !== child.parent.stepId` → the parent legitimately moved on
  (an authored path, a cancel). Silent no-op: the row is delivered, nothing is
  written. Under the lock this is now a *fact* rather than a possibly-stale reading.
- current step equals the linked step **and** that step is not a subprocess step →
  loud failure, as today (`:120`). A contradiction the engine should surface.

The discriminator survives intact; only the freshness of one operand and the
atomicity of the sequence change.

### The config loses the field

`parentStepId` is removed from the enqueued config rather than left unused — a dead
field that once meant something is the next reader's trap.

*Rollout:* rows enqueued before this lands still carry it; the handler ignores it,
so in-flight rows drain with no compatibility shim.

## Risks / Trade-offs

- **A row lock held across the handler's own logic** → Bounded and datastore-local.
  The alternative (optimistic re-check) is what is being replaced, and it does not
  work.
- **A child whose `parent` link is absent** → Cannot occur: the return is enqueued
  only when `instance.parent` is set (`transition.ts:165`). Treated as a no-op
  rather than a throw, matching how a missing child is already treated (`:124`).
- **Lock ordering** → This handler takes the parent instance row only. It does write
  two other tables inside the transaction — the advance's `commitTransition` INSERTs
  a `history_entries` row and any trigger actions into `outbox` — but those are
  *fresh tuples*, which lock nothing that already exists. An inversion against
  `drainOutbox`'s post-delivery transaction (outbox row → instances row) would need
  this handler to wait on an existing outbox row, and it never does. Same-row overlap
  cannot arise either: `outbox.ts` runs the handler outside any transaction, so that
  transaction begins only after this one has committed.
- **Only observable once something moves a parked parent** → True of the snapshot
  half; the atomicity half is testable today by interleaving a concurrent parent
  transition. Both get a test.

## Open Questions

None. The change removes a redundant copy of a fact, reads the surviving one late,
and makes the read and the write it justifies one operation.
