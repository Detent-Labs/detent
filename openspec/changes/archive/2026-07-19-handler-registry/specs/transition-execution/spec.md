# transition-execution

## MODIFIED Requirements

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
