## ADDED Requirements

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

On cancellation the engine SHALL NOT run the current step's `onExit`. The trigger
order SHALL be: `onCancel` cleanup, then `onEntry` of the cancel-sink. The
transition SHALL be recorded as a `HistoryEntry` with `fromStepId` = the current
step, `pathId` = null, `toStepId` = the cancel-sink step (resolvable against the
pinned version body), and `cause` = `"cancel"`. The instance `status` SHALL
become `"cancelled"`. The cancel transition SHALL reuse the transactional outbox
(state committed first, side effects dispatched after) and SHALL advance
`transitionSeq` as the optimistic-concurrency token.

#### Scenario: onExit is skipped on cancel
- **WHEN** an instance at a step with a non-empty `onExit` is cancelled
- **THEN** the step's `onExit` actions do not run and only `onCancel` cleanup runs

#### Scenario: Cancel history entry resolves against the version body
- **WHEN** a cancel transition is recorded
- **THEN** the `HistoryEntry` has `cause == "cancel"`, `pathId == null`, and a `toStepId` that resolves to the cancel-sink step in the entry's pinned version body

#### Scenario: Concurrent cancel and normal transition
- **WHEN** a cancel and a normal transition race on the same instance
- **THEN** exactly one wins the `transitionSeq` bump and the other observes the committed result and does not double-apply

### Requirement: Downward-only subprocess cancel propagation

Cancelling a parent instance SHALL recursively cancel its active child instances
by following the `parent` links. A cancelled child SHALL surface
`child.outcome == "cancelled"`, which the parent MAY guard on. In v1 a child MUST
NOT be cancelled independently in a way that propagates upward to its parent.

#### Scenario: Parent cancel cascades to active children
- **WHEN** a parent instance with an active subprocess child is cancelled
- **THEN** the child instance is also cancelled (recursively for nested children)

#### Scenario: Cancelled child exposes the reserved outcome
- **WHEN** a subprocess child ends in the cancelled state
- **THEN** the parent step observes `child.outcome == "cancelled"` and may evaluate a guard against it

#### Scenario: Independent upward child cancel is not allowed in v1
- **WHEN** a cancel is directed at a child instance independently of its parent
- **THEN** v1 does not propagate that cancellation upward to the parent
