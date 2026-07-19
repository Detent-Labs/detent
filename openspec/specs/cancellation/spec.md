# cancellation

## Purpose

Defines how an instance reaches `status: "cancelled"`. Cancel is modeled as an
engine-synthesized hidden-path transition to a synthesized terminal cancel-sink,
so it reuses the transition/history machinery rather than a nullable
`HistoryEntry.toStepId`. Covers the publish-time sink (+ reserved outcome)
injection, the authoring invariants, the `onCancel` step field, the cancel audit
record, and downward-only subprocess propagation. The contract layer is
implemented; the runtime half (cancel × outbox, history writeback, propagation)
is specified here and built with the engine skeleton.

## Requirements

### Requirement: Cancel is a synthesized hidden-path transition

Cancellation SHALL be modeled as an engine-synthesized transition from any
non-terminal step to a synthesized terminal cancel-sink step. The synthetic
cancel path MUST NOT appear in an authored step's `paths` array, so it MUST NOT
participate in the all-manual/all-automatic path invariant or any priority/guard
rule that governs authored paths.

#### Scenario: Cancel does not affect authored-path invariants
- **WHEN** a step has only manual authored paths and cancellation is available
- **THEN** the definition still validates (the synthetic cancel path is not counted among the step's authored paths)

#### Scenario: Every non-terminal step is cancellable
- **WHEN** an instance is at any non-terminal step
- **THEN** a cancel command produces a transition to the cancel-sink step

### Requirement: Publish-time injection of the cancel-sink

A publish-time compile pass SHALL inject exactly one terminal cancel-sink step
into a `ProcessBody`, and — for a contracted process — a reserved `"cancelled"`
outcome bound to that sink. A non-contracted process SHALL receive only the sink.
The injection MUST run BEFORE `definitionHash = JCS(ProcessBody)` is computed, so
the hash covers the injected sink. The injection MUST be deterministic: compiling
the same authored body twice yields byte-identical results and an identical
re-publish remains a no-op.

#### Scenario: Contracted process gets sink and reserved outcome
- **WHEN** a contracted process body is compiled at publish time
- **THEN** the compiled body contains exactly one terminal cancel-sink step whose `outcome` is the reserved `"cancelled"` value, and `contract.outcomes` contains `"cancelled"`

#### Scenario: Non-contracted process gets only the sink
- **WHEN** a process body with no contract is compiled at publish time
- **THEN** the compiled body contains exactly one terminal cancel-sink step and no reserved outcome is added

#### Scenario: Injection is deterministic and idempotent
- **WHEN** the same authored body is compiled twice
- **THEN** both compiled bodies are byte-identical and produce the same `definitionHash`

#### Scenario: Reserved outcome satisfies contract invariants
- **WHEN** a compiled contracted body is validated
- **THEN** the reserved `"cancelled"` outcome resolves to its terminal cancel-sink step and no outcome-reachability or terminal-outcome invariant is violated

### Requirement: Authoring invariant for the cancel-sink

The authoring-time validation SHALL enforce that every published body has exactly
one cancel-sink step. A body carrying zero or more than one cancel-sink MUST be
rejected.

#### Scenario: Missing cancel-sink is rejected
- **WHEN** a published body contains no cancel-sink step
- **THEN** validation rejects the body

#### Scenario: Duplicate cancel-sink is rejected
- **WHEN** a published body contains two cancel-sink steps
- **THEN** validation rejects the body

### Requirement: onCancel cleanup actions per step

A step MAY declare an optional `onCancel: Action[]`. These actions SHALL be the
`onPath` actions of that step's synthetic cancel path (per-step cleanup). Each
`onCancel` action's `output` targets MUST reference fields in the process field
catalog and SHALL be validated by the body refinement, exactly as `onEntry` and
`onExit` action outputs are.

#### Scenario: onCancel output targeting an unknown field is rejected
- **WHEN** an `onCancel` action writes to a field id that is not in the catalog
- **THEN** validation rejects the body

#### Scenario: Step without onCancel is valid
- **WHEN** a step declares no `onCancel`
- **THEN** the step validates and its synthetic cancel path carries no cleanup actions

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
