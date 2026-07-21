## ADDED Requirements

### Requirement: A manual transition on a non-running instance is a no-op

`executeManualTransition` SHALL reject a manual transition on an instance
whose `status` is not `running` — including `faulted` — as a no-op: no
`HistoryEntry` is appended, `transitionSeq` does not change, no outbox row is
enqueued, and `resolveAutomatic` is not invoked. This applies regardless of
whether the offered path exists on the instance's current step or its guard
would hold, and matches the no-op convention `cancellation` already uses for
a non-running instance.

#### Scenario: A faulted instance rejects a manual transition
- **WHEN** a manual transition is offered to an instance whose status is `faulted`
- **THEN** no `HistoryEntry` is appended, `transitionSeq` is unchanged, and the instance's `currentStepId` and `status` are unchanged

#### Scenario: A completed or cancelled instance rejects a manual transition
- **WHEN** a manual transition is offered to an instance whose status is `completed` or `cancelled`
- **THEN** no `HistoryEntry` is appended and `transitionSeq` is unchanged

### Requirement: A timer fire on a non-running instance is a no-op

`fireTimer` SHALL reject firing a timer on an instance whose `status` is not
`running` — including `faulted` — as a no-op, for both a transition timer
(`onFire.targetPath`) and a reminder timer (`onFire.actions`, no
`targetPath`): no `HistoryEntry` or `timer.fired` event is appended,
`transitionSeq` does not change, and no outbox row is enqueued.

#### Scenario: A faulted instance ignores a due transition timer
- **WHEN** a transition timer fires for an instance whose status is `faulted`
- **THEN** no `HistoryEntry` is appended, `transitionSeq` is unchanged, and the instance's `currentStepId` is unchanged

#### Scenario: A faulted instance ignores a due reminder timer
- **WHEN** a reminder timer fires for an instance whose status is `faulted`
- **THEN** no `timer.fired` event is appended, no outbox row is enqueued, and the timer's `fired` flag is unchanged
