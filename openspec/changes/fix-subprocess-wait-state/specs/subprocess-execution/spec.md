<!-- antislop: allow-file em-dash hedging long-words negation-habit passive-voice run-ons sentence-length trailing-negation -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

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
backstop only acts when a fresh read shows the parent non-running or no longer
awaiting the child, and the child still running), so redelivery reaching them
is sufficient — no new idempotency bookkeeping is introduced by this
requirement.

#### Scenario: Re-dispatched spawn does not create a second child
- **WHEN** the same subprocess spawn is dispatched more than once (retry or crash recovery)
- **THEN** exactly one child instance exists, identified by the deterministic child id, and the redelivery is a no-op with respect to creation

#### Scenario: Redelivery completes a drive-to-rest a crash interrupted
- **WHEN** a first delivery creates the child but crashes before driving it to rest, and the spawn is redelivered
- **THEN** the redelivery drives the existing child along its all-automatic paths, and a child that reaches a terminal step on this pass has its return enqueued exactly as it would have on an uninterrupted first delivery

#### Scenario: Redelivery completes an interrupted cancel-orphan backstop
- **WHEN** a first delivery creates the child, the parent is cancelled before the backstop check runs, and the spawn is redelivered before the backstop has self-cancelled the child
- **THEN** the redelivery finds the parent non-running and the child still running, and self-cancels the child

#### Scenario: The backstop cancels a child whose parent left the step
- **WHEN** a delivery creates the child, and the parent has left the subprocess step before the backstop check runs
- **THEN** the backstop finds the parent no longer awaiting the child, and self-cancels the still-running child

#### Scenario: Redelivery after both repairs already completed is a no-op
- **WHEN** a spawn is redelivered after an earlier delivery already drove the child to rest and, if applicable, ran the cancel-orphan backstop
- **THEN** the redelivery re-attempts both, finds nothing left to do, and leaves the child's state unchanged

### Requirement: Return the child outcome and data to the parked parent

When a subprocess child reaches a terminal step, the engine SHALL surface
`child.outcome` (the terminal step's bound `outcome`) and `child.data` to the
parent's subprocess step, evaluate that step's `outputMapping` (CEL over the
`child` namespace) into the parent's `data`, and flag the parent for
re-resolution so it evaluates its result-driven automatic paths. The parent's
subprocess step MUST have all-automatic paths (a wait-state). Those paths are
evaluated only after the child has returned, and a guard that selects among
outcomes reads `child.outcome`. A guardless default path stays allowed and is
the else-branch of that evaluation.

The step the parent is expected to be parked at SHALL be resolved from the child's
own `parent` link, read when the return is delivered. It SHALL NOT be carried in the
return action's configuration.

The return SHALL apply only when the parent's `awaitedChild` equals the id of the
returning child. A parent that awaits another child, or none, has left the step
visit this child belongs to. The return is then a silent no-op that stays
delivered, exactly as for a parent that moved on. The `parent` link names a step.
Two visits to one step share it, so the link alone cannot tell them apart.

The writeback SHALL clear the parent's `awaitedChild` in the same transaction.
The child is terminal, so the parent no longer awaits it.

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
return is a silent no-op that stays delivered; a parent that awaits this child and
sits at the linked step, where that step is not a subprocess step, is a contradiction
and SHALL fail loudly. The engine writes `awaitedChild` only on a subprocess step, so
this branch is defense in depth.

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

- **WHEN** a child reaches its terminal step, and the parent's link is
  subsequently updated to a different step
- **AND** the parent still awaits this child, and the return is then delivered
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

- **WHEN** a return is delivered for a parent whose `awaitedChild` names this child
  and whose current step matches the child's linked step but is not a subprocess step
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

#### Scenario: A guardless default path takes an unmatched outcome

- **WHEN** a subprocess child returns with an outcome that no guarded path
  matches
- **AND** the parent's step carries a guardless default path
- **THEN** the parent takes the default path
- **AND** the engine evaluated its guards only after the child returned

#### Scenario: A return from a child the parent no longer awaits is a no-op

- **WHEN** a parent left a subprocess step by a timer and re-entered the same
  step, so it awaits a second child
- **AND** the first child then returns
- **THEN** no writeback is applied and no re-resolution is attempted
- **AND** the return stays delivered, and the second child's own return later
  drives the parent

#### Scenario: A returning child clears the awaited child

- **WHEN** a return applies to a parent that awaits the returning child
- **THEN** the parent's `awaitedChild` is cleared in the same transaction as
  the writeback, including when the outcome matches no path

## ADDED Requirements

### Requirement: A subprocess step parks until its child returns

The automatic cascade SHALL stop at any step of type `subprocess`, whatever its
paths and guards. Only the child's return, a step timer, a cancellation or a
migration moves the parent off that step. The engine SHALL NOT evaluate the
step's paths on entry, because no `child` namespace exists until the child
returns.

A guard on a subprocess step SHALL be evaluated once, by the return, with
`child.outcome` and `child.data` in scope. A guard that holds without reading
`child` SHALL NOT fire on entry.

#### Scenario: A guardless default does not fire on entry

- **WHEN** a parent enters a subprocess step whose second path is a guardless
  default with the highest priority
- **THEN** the parent stays on the subprocess step, and the spawn creates the
  child

#### Scenario: A guard that ignores child does not fire on entry

- **WHEN** a parent enters a subprocess step with a path whose guard holds over
  parent data alone
- **THEN** the parent stays on the step until the child returns

#### Scenario: A subprocess initial step parks

- **WHEN** an instance is created on a definition whose `initialStep` is a
  subprocess step with a guardless default path
- **THEN** the instance stays on that step at `transitionSeq` 0

### Requirement: A parked parent records the child it awaits

The instance record SHALL carry an optional `awaitedChild`. It holds the id of
the child that the parent's current subprocess step visit waits for. The field
sits in the instance record, outside the process body, so a definition's hash
does not change.

A step entry onto a subprocess step SHALL write the child id the spawn derives
for that entry. Creation on a subprocess initial step SHALL write the id
derived at sequence 0. Any commit that leaves the step SHALL clear the field,
and so SHALL the return's writeback. An identity migration SHALL carry the
field unchanged. The child it names is still the one the parent waits for.

An instance that sits on no subprocess step has no value. Neither has an
instance recorded before the field existed.

#### Scenario: Entering a subprocess step records the derived child id

- **WHEN** a running instance commits a transition onto a subprocess step
- **THEN** its `awaitedChild` equals the child id the spawn derives from the
  parent, the new sequence and the step id

#### Scenario: Creation on a subprocess initial step records the id

- **WHEN** an instance is created on a subprocess initial step
- **THEN** its `awaitedChild` equals the child id derived at sequence 0

#### Scenario: Leaving the step clears the field

- **WHEN** a parked parent leaves its subprocess step by a timer
- **THEN** its `awaitedChild` is cleared in the leaving commit

#### Scenario: A re-entry records the new visit's child

- **WHEN** a parent leaves a subprocess step and enters the same step again
- **THEN** its `awaitedChild` names the second visit's child, which differs
  from the first

#### Scenario: An identity migration keeps the field

- **WHEN** a parent parked on a subprocess step migrates onto the same step id
- **THEN** its `awaitedChild` is unchanged, and the existing child's return
  still applies

### Requirement: The spawn creates a child only for a parent that still awaits it

The spawn SHALL create the child only while the parent is running and its
`awaitedChild` equals the child id the spawn derives. Otherwise the delivery
SHALL create nothing and SHALL succeed. A child created for a visit the parent
has left would run beside the parent, which breaks call-and-return.

#### Scenario: A queued spawn finds the parent gone from the step

- **WHEN** a timer moves the parent off the subprocess step before its queued
  spawn is delivered
- **THEN** the delivery creates no child

#### Scenario: A queued spawn of an earlier visit creates nothing

- **WHEN** the parent left the step and entered it again before the first
  visit's spawn is delivered
- **THEN** the first visit's delivery creates no child, and the second visit's
  delivery creates one

#### Scenario: A spawn for an awaiting parent proceeds

- **WHEN** the parent still awaits the derived child id
- **THEN** the delivery creates the child as before
