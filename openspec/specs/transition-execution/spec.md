# transition-execution

## Purpose

Defines how the engine advances an instance one step: the instance is pinned to a
frozen definition, a single manual path executes its triggers in order and commits
atomically with `transitionSeq` as the optimistic-concurrency token, and each
committed transition appends exactly one append-only `HistoryEntry`. Action
dispatch (side effects) and automatic-path evaluation are separate capabilities.

## Requirements

### Requirement: Instance is pinned to a frozen definition

An instance SHALL record `{ processId, version, definitionHash }` at creation and
SHALL execute against exactly that frozen `ProcessBody`. The engine MUST NOT
advance an instance against a body whose canonical hash differs from the pinned
`definitionHash`.

#### Scenario: Instance is created pinned to its definition
- **WHEN** an instance is created from a published version
- **THEN** it persists `processId`, `version`, and that version's `definitionHash`, and its `currentStepId` is the definition's `initialStep`

#### Scenario: Rehydration against a mismatched body is rejected
- **WHEN** a persisted instance is loaded together with a `ProcessBody` whose canonical hash does not equal the instance's pinned `definitionHash`
- **THEN** the engine refuses to execute and surfaces a pin mismatch, rather than running against the wrong body

### Requirement: A manual transition executes onExit → onPath → onEntry

Executing a manual path SHALL run triggers in the order `onExit(source)` then
`onPath` then `onEntry(target)`, commit the new `currentStepId`, and do so as one
atomic unit — a failure before commit leaves the instance on its source step with
its prior `transitionSeq`. The commit SHALL write only the instance's
`{currentStepId, transitionSeq, status}` and SHALL NOT overwrite instance `data`,
so a post-commit action writeback into `data` is not clobbered by a subsequent
transition.

#### Scenario: Trigger order is onExit, onPath, onEntry
- **WHEN** an instance takes a manual path from source step S to target step T
- **THEN** the source step's `onExit`, then the path's triggers, then the target step's `onEntry` are processed in that order, and the instance's `currentStepId` becomes T

#### Scenario: A path may only be taken when its guard holds
- **WHEN** a manual path carries a guard that evaluates to false against the instance's frozen context
- **THEN** the transition is refused and the instance stays on its source step

#### Scenario: A transition does not overwrite instance data
- **WHEN** a value is present in an instance's `data` and the instance then commits a manual transition
- **THEN** that value is preserved, because the commit writes only `currentStepId`, `transitionSeq`, and `status`

### Requirement: transitionSeq is a monotonic optimistic-concurrency token

`transitionSeq` SHALL increase by exactly one on each committed transition and
SHALL act as the optimistic-concurrency token: a transition computed from a stale
`transitionSeq` MUST fail to commit rather than overwrite a concurrent update.

#### Scenario: Sequential transitions increment the token
- **WHEN** an instance at `transitionSeq` N commits a transition
- **THEN** its persisted `transitionSeq` becomes N+1

#### Scenario: A stale write loses
- **WHEN** two transitions are computed from the same `transitionSeq` N and both attempt to commit
- **THEN** the first to commit wins at N+1 and the second is rejected as a concurrency conflict, leaving no partial write

### Requirement: One HistoryEntry per committed transition

Each committed transition SHALL append exactly one append-only `HistoryEntry`
recording the active `version`, the resolved `pathId`, `fromStepId`, `toStepId`,
the committed `transitionSeq`, and a `cause`. For a manual transition the `cause`
is `user`.

#### Scenario: A manual transition records one audit entry
- **WHEN** an instance commits a manual transition from S to T at `transitionSeq` N+1
- **THEN** exactly one `HistoryEntry` is appended with `cause: "user"`, `fromStepId: S`, `toStepId: T`, `transitionSeq: N+1`, and the version active at that entry
