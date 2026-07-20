## MODIFIED Requirements

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
