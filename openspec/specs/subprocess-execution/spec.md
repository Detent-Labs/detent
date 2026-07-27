# subprocess-execution

## Purpose

Defines how the engine executes a `subprocess` step: spawning a linked child
instance on entry, resolving the child body by `versionBinding`, mapping parent
data into the child input, keeping the spawn idempotent under at-least-once
dispatch, and returning the child outcome and data to the parked parent for
result-driven re-resolution. A subprocess step is a wait-state; the parent parks
until the child reaches a terminal step bound to an outcome.

## Requirements

### Requirement: Spawn a child instance on entry to a subprocess step

When a running instance commits a transition whose target is a `subprocess` step,
the engine SHALL spawn one child instance and leave the parent parked in that step
as a wait-state. The child instance MUST record a `parent` link
`{ instanceId, stepId }` identifying the parent instance and its subprocess step.
The spawn MUST be dispatched post-commit (the parent's entry into the subprocess
step is committed first, the child spawned after), consistent with the engine's
commit-then-dispatch ordering.

Creation SHALL trigger the same spawn: an instance created on a definition whose
`initialStep` is a `subprocess` step SHALL have its spawn enqueued in the same
transaction that creates the instance row, at `transitionSeq` 0, and dispatched
post-commit like any other. There MUST be no state in which the instance row
exists but its initial spawn was never enqueued (a crash between the two would
strand the instance on its wait-state with nothing to re-enqueue). A creation
that inserts no row — the instance already exists, as when a redelivered spawn
re-runs the creation of its child — SHALL enqueue nothing.

This applies uniformly to top-level creations and to subprocess children, so a
child whose own `initialStep` is a subprocess step spawns its grandchild through
the same mechanism (nested initial-step chains compose with no special casing).

A creation-enqueued spawn uses the same deterministic coordinates as a
transition-enqueued one, with the sequence being 0: the child id derives from
`(parent instanceId, 0, subprocess step id)`, so redelivery resolves to the same
child and is a no-op.

The parent parked at its initial subprocess step SHALL be returned to exactly as
one parked by a transition: the child's return finds it via the `parent` link and
drives it off the wait-state from sequence 0.

#### Scenario: Entering a subprocess step spawns a linked child
- **WHEN** an instance transitions into a `subprocess` step
- **THEN** a child instance is created whose `parent` link references the parent instance id and the subprocess step id, and the parent remains at the subprocess step

#### Scenario: Parent parks as a wait-state
- **WHEN** a subprocess child has been spawned and has not yet reached a terminal step
- **THEN** the parent instance stays at the subprocess step and takes no automatic path (a wait-state), unless a step timer fires

#### Scenario: Creation at a subprocess initial step spawns
- **WHEN** an instance is created from a definition whose `initialStep` is a `subprocess` step, and the outbox is drained
- **THEN** a child instance exists whose `parent` link references the created instance and its initial step, seeded from the step's `inputMapping`, and the created instance remains parked at the initial step at `transitionSeq` 0

#### Scenario: The child's return drives a parent parked at its initial step
- **WHEN** the child of a creation-enqueued spawn reaches a terminal step bound to an outcome, and the return is delivered
- **THEN** the parent's `outputMapping` is applied and the parent transitions off its initial subprocess step along the automatic path whose guard matches `child.outcome`

#### Scenario: A nested initial-step chain composes
- **WHEN** a subprocess child is created whose own `initialStep` is a subprocess step
- **THEN** the child's creation enqueues its own spawn, a grandchild is created on delivery, and each return propagates upward through the ordinary return path

#### Scenario: A redelivered creation enqueues nothing
- **WHEN** a redelivered spawn re-runs the creation of an already-existing child whose initial step is a subprocess step
- **THEN** no instance row is inserted, no spawn is enqueued, and exactly one spawn row exists for that child

#### Scenario: A creation-enqueued spawn respects the parent's status at delivery
- **WHEN** an instance created on a subprocess initial step is cancelled before its spawn is delivered
- **THEN** the delivery is a no-op and no child is created, exactly as for a transition-enqueued spawn

### Requirement: Resolve the child body by versionBinding

The engine SHALL resolve the child `ProcessBody` at spawn time according to the
subprocess step's `versionBinding`. For `pinned`, it MUST bind exactly
`pinnedVersion`. For `latest-at-spawn`, it MUST bind the newest published version
of the child process whose contract signature equals the step's `contractRef`; a
later child version with a different contract signature MUST NOT be adopted.

#### Scenario: Pinned binding resolves the pinned version
- **WHEN** a subprocess step has `versionBinding: "pinned"` and `pinnedVersion: N`
- **THEN** the spawned child runs version `N` of the child process

#### Scenario: Latest-at-spawn resolves the newest matching contract
- **WHEN** a subprocess step has `versionBinding: "latest-at-spawn"` with a `contractRef`, and multiple child versions are published
- **THEN** the spawned child runs the newest version whose contract signature equals `contractRef`, ignoring newer versions that changed the contract signature

### Requirement: Map parent data into the child input

At spawn time the engine SHALL evaluate the subprocess step's `inputMapping`
(CEL expressions over the parent's frozen context, without the `result` or
`child` namespaces) and write the results into the child instance's initial
`data`, keyed by the child field ids that are the mapping targets. Mapping
targets MUST be resolvable child input fields.

#### Scenario: Input mapping seeds the child data
- **WHEN** a subprocess step declares `inputMapping` from parent fields to child input fields
- **THEN** the spawned child starts with each mapped child field set to its evaluated CEL value over the parent's data

### Requirement: Spawn is idempotent under at-least-once dispatch

Because spawn dispatch is at-least-once, re-dispatching the same spawn MUST NOT
create a second child. The child instance id MUST be a deterministic function of
the parent instance id, the parent's `transitionSeq` at entry, and the subprocess
step id (a UUIDv5), so a re-delivered spawn resolves to the same child and
skips only the creation of a new row.

A redelivered spawn MUST NOT also skip the work that follows creation: driving
the child to rest along any all-automatic paths from its current step, and the
cancel-orphan backstop that self-cancels a child left `running` under a parent
that is not. Both MUST be attempted on every delivery — the one that inserted
the child's row and every redelivery after it — using the child's state as read
at that delivery, not only on the delivery that happened to create the row.
Neither is a fresh mechanism: both are already safe to invoke more than once
(driving an already-rested or already-terminal child to rest is a no-op; the
backstop only acts when a fresh read shows the parent non-running and the child
still running), so redelivery reaching them is sufficient — no new
idempotency bookkeeping is introduced by this requirement.

#### Scenario: Re-dispatched spawn does not create a second child
- **WHEN** the same subprocess spawn is dispatched more than once (retry or crash recovery)
- **THEN** exactly one child instance exists, identified by the deterministic child id, and the redelivery is a no-op with respect to creation

#### Scenario: Redelivery completes a drive-to-rest a crash interrupted
- **WHEN** a first delivery creates the child but crashes before driving it to rest, and the spawn is redelivered
- **THEN** the redelivery drives the existing child along its all-automatic paths, and a child that reaches a terminal step on this pass has its return enqueued exactly as it would have on an uninterrupted first delivery

#### Scenario: Redelivery completes an interrupted cancel-orphan backstop
- **WHEN** a first delivery creates the child, the parent is cancelled before the backstop check runs, and the spawn is redelivered before the backstop has self-cancelled the child
- **THEN** the redelivery finds the parent non-running and the child still running, and self-cancels the child

#### Scenario: Redelivery after both repairs already completed is a no-op
- **WHEN** a spawn is redelivered after an earlier delivery already drove the child to rest and, if applicable, ran the cancel-orphan backstop
- **THEN** the redelivery re-attempts both, finds nothing left to do, and leaves the child's state unchanged

### Requirement: Return the child outcome and data to the parked parent

When a subprocess child reaches a terminal step, the engine SHALL surface
`child.outcome` (the terminal step's bound `outcome`) and `child.data` to the
parent's subprocess step, evaluate that step's `outputMapping` (CEL over the
`child` namespace) into the parent's `data`, and flag the parent for
re-resolution so it evaluates its result-driven automatic paths. The parent's
subprocess step MUST have all-automatic paths (a wait-state) that guard on
`child.outcome`.

The step the parent is expected to be parked at SHALL be resolved from the child's
own `parent` link, read when the return is delivered. It SHALL NOT be carried in the
return action's configuration.

The parked check, the `outputMapping` writeback, and the advance off the wait-state
SHALL be performed in one transaction holding the parent's row, so that no state can
change between the decision and the writes that decision justifies.

Both properties are required, and neither alone is sufficient.

A value captured when the return was enqueued is a snapshot of another instance's
state read an unbounded interval later — across retry backoff, a claim lease, or a
worker restart. Should anything move a parked parent in that window, the captured
value names a step the parent has left, which is indistinguishable from the parent
having legitimately moved on: the return is a successful no-op, the row is marked
delivered and never retried, the child's result is lost, and the parent waits at its
subprocess step forever with nothing recording why.

A fresh read does not remove that failure, only its window. Reading the child's link
and then the parent's step as two independent reads reproduces the same mismatch for
anything committing between them, with the same silent outcome. The atomicity is what
makes the question and the answer refer to one state.

Resolving the parent's current step and assuming it is the right one SHALL NOT be
used as a substitute, since a parent that has since reached a *different* subprocess
step would have that step's `outputMapping` applied to this child's result.

The two outcomes SHALL remain distinguishable and keep their existing behaviour: a
parent whose current step differs from the child's linked step has moved on, and the
return is a silent no-op that stays delivered; a parent parked at the linked step
where that step is not a subprocess step is a contradiction and SHALL fail loudly.

A child carrying no `parent` link SHALL be a no-op rather than a failure, matching
the treatment of a child that cannot be loaded.

If the `outputMapping` writeback is applied but `child.outcome` matches no
automatic path's guard, the parent SHALL remain parked at the subprocess step
(the return still stays delivered and the writeback is not undone) and the
engine SHALL record this as a `subprocess.outcome-unmatched` `InstanceEvent`
(see the `runtime-events` capability), so this specific silent outcome is
queryable rather than indistinguishable from a parent legitimately still
waiting on its bounding timer.

#### Scenario: Child completion writes back and wakes the parent
- **WHEN** a subprocess child reaches a terminal step bound to an outcome
- **THEN** the parent's `outputMapping` is applied to the parent `data` from `child.outcome`/`child.data`, and the parent is re-resolved off the subprocess wait-state along the automatic path whose guard matches `child.outcome`

#### Scenario: Writeback and wake apply only to a running parent
- **WHEN** a child returns but the parent instance is no longer running (e.g. already cancelled)
- **THEN** the child's `outputMapping` writeback is not applied to the parent and no re-resolution is attempted

#### Scenario: A parent whose linked step changed after enqueue is still found

- **WHEN** a child reaches its terminal step, the parent's link is subsequently
  updated to a different step, and the return is then delivered
- **THEN** the return resolves the parent through the updated link, applies the
  output mapping, and drives the parent off that step

#### Scenario: A parent transition racing the return cannot split the decision

- **WHEN** a transition moving the parent off its subprocess step is attempted
  concurrently with a return for that parent
- **THEN** either the return completes wholly — check, writeback, and advance — or it
  performs none of them and is a no-op; the writeback is never applied on the basis of
  a check the transition has since invalidated

#### Scenario: A parent that legitimately moved on is a no-op

- **WHEN** a child returns to a parent that has already left its subprocess step by
  an authored path
- **THEN** no writeback is applied, no re-resolution is attempted, and the return is
  not treated as a failure

#### Scenario: A parent parked at a non-subprocess step fails loudly

- **WHEN** a return is delivered for a parent whose current step matches the child's
  linked step but is not a subprocess step
- **THEN** the return fails rather than returning silently

#### Scenario: A child with no parent link is a no-op

- **WHEN** a return is delivered for a child carrying no `parent` link
- **THEN** nothing is written and the return does not fail

#### Scenario: The return action carries no parent step id

- **WHEN** a return action is enqueued
- **THEN** its configuration names the parent instance and the child outcome, and does
  not carry the parent's step id

#### Scenario: An unmatched outcome writes back but does not advance

- **WHEN** a subprocess child returns with an outcome that matches no
  automatic path's guard on the parent's subprocess step
- **THEN** the `outputMapping` writeback is applied to the parent's `data`,
  the parent remains parked at the subprocess step, no transition is
  committed, and a `subprocess.outcome-unmatched` event is recorded

### Requirement: A migrating parent's relocation defers instead of repointing a live child's link

A migrating parent does NOT repair a child's `parent.stepId` under relocation — see
`instance-migration`'s "A relocation off a subprocess step with a live child is
deferred" requirement for the full rule (live-child gate, the `child-in-flight`
skip, why repointing is declined rather than reconciled, and the settled-child
exception). This spec previously stated the opposite (a repair-on-migration
design); that was superseded by the deferral design and never synced here — see
`openspec/changes/archive/2026-07-21-gate-migration-live-child/`.

A child SHALL NOT otherwise be affected by its parent's migration. It keeps its own
`{processId, version, definitionHash}` and its own step, and is migrated only by an
invocation covering its own process and version.

#### Scenario: A child is not migrated by its parent

- **WHEN** a parent with a child migrates
- **THEN** the child keeps its own pin and its own step
