## Why

`core.returnSubprocess` decides whether the parent is still parked at its
subprocess step by comparing the parent's live `currentStepId` against a
`parentStepId` **frozen into the outbox row's config when the child reached its
terminal step** (`transition.ts:169`). A mismatch is treated as "not parked here"
and returns `{}` — a silent success, so the row is marked delivered and never
retried (`subprocess.ts:115`).

Two things are wrong with that, and only fixing both closes the hole.

1. **The compared value is a snapshot.** It is another instance's state captured at
   enqueue and read an unbounded interval later — across retry backoff, a claim
   lease, or a worker restart.
2. **The comparison is not atomic with what follows.** The handler loads the
   parent, checks, then writes back, then re-checks, then advances — four
   unsynchronised steps against a row anything else may be changing. Even with a
   perfectly fresh value, a change landing between the read and the write produces
   the same silent success.

Both failure modes destroy the child's result and park the parent forever, with
nothing in either instance recording why. That the engine has no mechanism today
which moves a parked parent is what keeps this latent — it is not a property of
the handler.

## What Changes

- The return handler resolves the parked parent from the **child's own live
  `parent` link**, re-read at delivery, rather than from the step id captured in
  the action config. The child row is the authoritative record of which step
  spawned it.
- The parked check, the `outputMapping` writeback, and the advance off the
  wait-state run in **one transaction with the parent row locked**
  (`SELECT … FOR UPDATE`), so no state can change between the decision and the
  write it justifies.
- The frozen `parentStepId` is removed from the return action's config, so there is
  no second copy that can disagree with the link.
- The two outcomes the handler currently discriminates are preserved and their
  conditions restated against the locked, live state: a parent that has
  legitimately moved on is a no-op; a parent parked at a step that is not a
  subprocess step is a loud failure.
- No behaviour changes for any case that works today.

## What this change does NOT fix

The child's `parent` link is authoritative only if something keeps it current. Any
future mechanism that moves a parked parent must repair it — `add-instance-migration`
does exactly that, for **every** child including terminal ones.

Neither change is sufficient alone: without this one the handler reads a frozen
copy and races its own writes; without the link repair the live value is equally
stale. They are complementary, and this one lands first because the locking is
worth having on its own and is testable without migration existing.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `subprocess-execution`: the return locates the parked parent through the child's
  live `parent` link rather than a step id captured at enqueue, and performs its
  check, writeback, and advance atomically under a row lock.

## Impact

- `src/engine/subprocess.ts`: `makeReturnHandler` derives `parentStepId` from the
  loaded child and wraps its parked check, writeback, and advance in one
  transaction holding the parent row. The frozen value is currently used at four
  sites — the parked check, the step lookup, the writeback's `WHERE`, and the
  post-writeback re-check; the re-check becomes unnecessary under the lock.
- `src/engine/transition.ts`: the return action's config no longer carries
  `parentStepId`. `parentInstanceId` and `childOutcome` are unchanged. This is the
  same block `commit-transition-synthesized-callers` later moves into the planner,
  so that change must be implemented **after** this one.
- `test/subprocess.test.ts`: a case that fails against the frozen value, and one
  that fails against the unlocked sequence.
- No schema change, no migration, no new dependency.

## Note

Extracted from `add-instance-migration`, where review found that the change's own
"parent link repair" did not fix this case. A first draft of this change fixed only
the snapshot and introduced a narrower instance of the same race by reading the
child and the parent separately; the row lock is the answer to that.
