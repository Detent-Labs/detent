## ADDED Requirements

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

#### Scenario: Child completion writes back and wakes the parent
- **WHEN** a subprocess child reaches a terminal step bound to an outcome
- **THEN** the parent's `outputMapping` is applied to the parent `data` from `child.outcome`/`child.data`, and the parent is re-resolved off the subprocess wait-state along the automatic path whose guard matches `child.outcome`

#### Scenario: Writeback and wake apply only to a running parent
- **WHEN** a child returns but the parent instance is no longer running (e.g. already cancelled)
- **THEN** the child's `outputMapping` writeback is not applied to the parent and no re-resolution is attempted
