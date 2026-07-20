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

#### Scenario: Entering a subprocess step spawns a linked child
- **WHEN** an instance transitions into a `subprocess` step
- **THEN** a child instance is created whose `parent` link references the parent instance id and the subprocess step id, and the parent remains at the subprocess step

#### Scenario: Parent parks as a wait-state
- **WHEN** a subprocess child has been spawned and has not yet reached a terminal step
- **THEN** the parent instance stays at the subprocess step and takes no automatic path (a wait-state), unless a step timer fires

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
step id (a UUIDv5), so a re-delivered spawn resolves to the same child and becomes
a no-op.

#### Scenario: Re-dispatched spawn does not create a second child
- **WHEN** the same subprocess spawn is dispatched more than once (retry or crash recovery)
- **THEN** exactly one child instance exists, identified by the deterministic child id, and the redelivery is a no-op

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
