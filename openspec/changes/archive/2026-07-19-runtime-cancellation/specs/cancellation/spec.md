## MODIFIED Requirements

### Requirement: Cancel transition semantics and audit record

The engine SHALL expose a cancel entry point that, given a running instance and
an optional actor, drives that instance to the synthesized cancel-sink. Cancelling
an instance that is not `running` (already `completed`, `cancelled`, or `faulted`)
SHALL be a no-op that does not append a HistoryEntry or advance `transitionSeq`.

On cancellation the engine SHALL NOT run the current step's `onExit`. The trigger
order SHALL be: `onCancel` cleanup, then `onEntry` of the cancel-sink. The
transition SHALL be recorded as a `HistoryEntry` with `fromStepId` = the current
step, `pathId` = null, `toStepId` = the cancel-sink step (resolvable against the
pinned version body), and `cause` = `"cancel"`. The instance `status` SHALL
become `"cancelled"`. The cancel transition SHALL reuse the transactional outbox
(state committed first, side effects dispatched after) and SHALL advance
`transitionSeq` as the optimistic-concurrency token.

#### Scenario: Cancel entry point drives a running instance to the sink
- **WHEN** the cancel entry point is invoked on a running instance
- **THEN** the instance's `currentStepId` becomes the cancel-sink step and its `status` becomes `"cancelled"`

#### Scenario: Cancelling a non-running instance is a no-op
- **WHEN** the cancel entry point is invoked on an instance whose status is already `completed`, `cancelled`, or `faulted`
- **THEN** no HistoryEntry is appended, `transitionSeq` does not change, and the status is unchanged

#### Scenario: onExit is skipped on cancel
- **WHEN** an instance at a step with a non-empty `onExit` is cancelled
- **THEN** the step's `onExit` actions do not run and only `onCancel` cleanup runs

#### Scenario: onCancel and sink onEntry actions are enqueued in order
- **WHEN** an instance at a step with `onCancel` actions is cancelled
- **THEN** the `onCancel` actions followed by the cancel-sink's `onEntry` actions are enqueued to the outbox for the committed `transitionSeq`

#### Scenario: Cancel history entry resolves against the version body
- **WHEN** a cancel transition is recorded
- **THEN** the `HistoryEntry` has `cause == "cancel"`, `pathId == null`, and a `toStepId` that resolves to the cancel-sink step in the entry's pinned version body

#### Scenario: Concurrent cancel and normal transition
- **WHEN** a cancel and a normal transition race on the same instance from the same `transitionSeq`
- **THEN** exactly one wins the `transitionSeq` bump and the other observes the committed result as a concurrency conflict and does not double-apply

### Requirement: Downward-only subprocess cancel propagation

Cancelling a parent instance SHALL recursively cancel its active child instances
by following the `parent` links. A cancelled child SHALL surface
`child.outcome == "cancelled"`, which the parent MAY guard on. In v1 a child MUST
NOT be cancelled independently in a way that propagates upward to its parent.

This propagation is DEFERRED and SHALL be implemented together with subprocess
execution: the engine does not yet spawn subprocess children (no parent/child
instance links exist), so a single-instance cancel has no children to cascade to.
Until subprocess spawning lands, cancelling an instance SHALL cancel only that
instance.

#### Scenario: Parent cancel cascades to active children
- **WHEN** a parent instance with an active subprocess child is cancelled (once subprocess spawning exists)
- **THEN** the child instance is also cancelled (recursively for nested children)

#### Scenario: Cancelled child exposes the reserved outcome
- **WHEN** a subprocess child ends in the cancelled state
- **THEN** the parent step observes `child.outcome == "cancelled"` and may evaluate a guard against it

#### Scenario: Independent upward child cancel is not allowed in v1
- **WHEN** a cancel is directed at a child instance independently of its parent
- **THEN** v1 does not propagate that cancellation upward to the parent

#### Scenario: Single-instance cancel has no children before subprocess spawning
- **WHEN** an instance with no spawned children is cancelled
- **THEN** only that instance is cancelled and no child cascade is attempted
