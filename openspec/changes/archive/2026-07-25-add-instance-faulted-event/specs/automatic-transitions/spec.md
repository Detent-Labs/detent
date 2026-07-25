## MODIFIED Requirements

### Requirement: A cascade terminates on a repeated step

Within a single advance operation the engine SHALL record each `currentStepId` it
enters. Because guards are pure and instance `data` does not change during the
cascade, re-entering an already-recorded step is a non-terminating loop; the
engine SHALL stop, leave the instance on its last committed step, set its status
to `faulted`, and surface a loop error identifying that step. Hops committed
before detection SHALL remain as appended history.

The park SHALL additionally append an `instance.faulted` `InstanceEvent` naming
the repeated step and the reason for the park. The park is not a transition — no
step change — so it SHALL NOT append a `HistoryEntry` and SHALL NOT advance
`transitionSeq`; the event records the sequence the instance rests at. The park
enqueues no actions, so the event SHALL NOT carry `ActionOutcome`s.

The status flip and its event SHALL be written in one transaction, so a
`faulted` instance cannot exist without the record of why it was parked. The
flip is guarded on the instance's `transitionSeq`; if that guard matches no row
because the instance moved concurrently, neither the flip nor the event SHALL be
written.

#### Scenario: A data-independent cycle is stopped and surfaced
- **WHEN** an advance cascade re-enters a step it already entered in the same operation
- **THEN** the engine stops advancing, the instance remains on its last committed step with status `faulted`, prior hops remain in history, and a loop error naming the repeated step is raised

#### Scenario: The park is recorded as an event
- **WHEN** an advance cascade is stopped by re-entering a step and the instance is parked `faulted`
- **THEN** an `instance.faulted` `InstanceEvent` is appended for that instance, carrying the repeated step's id and the reason `automatic-cascade-loop`

#### Scenario: The park event does not advance the sequence
- **WHEN** an instance resting at `transitionSeq` N is parked `faulted` by a cascade loop
- **THEN** the appended event carries N, the instance's persisted `transitionSeq` is still N, and no `HistoryEntry` is appended for the park

#### Scenario: The park event carries no action outcomes
- **WHEN** an `instance.faulted` event is appended
- **THEN** it carries no `ActionOutcome`s, because parking enqueues no actions

#### Scenario: A lost concurrency race writes neither the flip nor the event
- **WHEN** a cascade loop is detected but the instance has concurrently moved past the `transitionSeq` the cascade left it at
- **THEN** the status is not flipped to `faulted` and no `instance.faulted` event is appended
