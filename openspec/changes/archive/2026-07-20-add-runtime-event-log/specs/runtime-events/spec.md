## ADDED Requirements

### Requirement: An append-only record for runtime events that are not transitions

The system SHALL provide `InstanceEvent`, an append-only runtime record for facts
about an instance that carry no step change and therefore cannot be expressed as a
`HistoryEntry`. An event SHALL record the instance it belongs to, the definition
`version` in force, the `transitionSeq` in force, its `kind`, the instant it
occurred, and a kind-specific payload.

An event SHALL NOT advance `transitionSeq`. The sequence remains what it is for a
transition record: the optimistic-concurrency token, monotonic per instance, one
value per hop. An event records the sequence the instance was at, so several events
may share one sequence and may share it with a transition. This is expected, not a
collision.

Events SHALL be recorded in the same transaction as the state change that caused
them, so an event cannot survive a rolled-back commit and a commit cannot land
without its events.

`HistoryEntry` remains the record for transitions and is not replaced. The two
interleave by their recorded instant and correlate by `transitionSeq`.

#### Scenario: An event records the sequence without advancing it

- **WHEN** an event is recorded for an instance at `transitionSeq` N
- **THEN** the event carries N, and the instance's `transitionSeq` is still N
  afterwards

#### Scenario: Several events share one sequence

- **WHEN** two events are recorded for an instance while it rests at the same step
- **THEN** both are retained, both carry that sequence, and they are ordered by their
  recorded instant

#### Scenario: An event carries the definition version in force

- **WHEN** an event whose payload names a step or timer id is recorded
- **THEN** it carries the `version` active at that moment, so the id resolves against
  the definition that produced it

#### Scenario: An event does not outlive a rolled-back commit

- **WHEN** the transaction recording a state change and its events fails
- **THEN** neither the state change nor its events are persisted

### Requirement: A reminder-timer fire is recorded as an event

A reminder timer — one whose `onFire` declares actions but no `targetPath` — fires
without transitioning. That fire SHALL be recorded as a `timer.fired` event naming
the timer, rather than being observable only through the timer's `fired` flag.

The `ActionOutcome` for each action the fire enqueued SHALL attach to that event, not
to the `HistoryEntry` that happens to share the instance's `transitionSeq`. Without
this, a reminder's action results are recorded against the transition that entered
the step and are indistinguishable from that transition's own actions.

#### Scenario: A reminder fire is recorded

- **WHEN** a due reminder timer fires
- **THEN** a `timer.fired` event naming that timer is recorded, the timer is marked
  `fired`, and the instance's `currentStepId` and `transitionSeq` are unchanged

#### Scenario: A reminder's action outcome attaches to its own event

- **WHEN** an action enqueued by a reminder fire is delivered
- **THEN** its `ActionOutcome` is recorded on the `timer.fired` event, and the
  `HistoryEntry` at the same `transitionSeq` is unchanged

#### Scenario: A transition's action outcomes are unaffected

- **WHEN** an action enqueued by an ordinary transition is delivered
- **THEN** its `ActionOutcome` is recorded on that transition's `HistoryEntry`,
  exactly as before

### Requirement: A timer that cannot be armed is recorded as an event

Arming remains total: it runs inside the transition commit, so a timer whose fire
time cannot be computed is omitted from the armed set rather than failing the entry.
That omission SHALL be recorded as a `timer.unarmed` event naming the timer and the
reason it was dropped, so the loss is queryable instead of silent.

The armed-timer record SHALL NOT be used to carry the omission. It describes timers
that will fire; a timer that never armed has no fire time to hold.

Recording an omission makes it observable, not noticed. An instance whose only bound
was the dropped timer still waits until someone acts on it; this requirement
establishes that the fact is retrievable, and does not claim the instance recovers.

#### Scenario: An unresolvable deadline is recorded

- **WHEN** an instance enters a step whose deadline expression raises — most commonly
  reading a field not yet written
- **THEN** the entry commits, that timer is absent from the armed set, and a
  `timer.unarmed` event naming it and the reason is recorded in the same commit

#### Scenario: A non-instant deadline value is recorded

- **WHEN** a deadline expression evaluates successfully but yields a value that is not
  a parseable instant
- **THEN** the entry commits, that timer is not armed, and a `timer.unarmed` event
  distinguishing this reason from an unresolvable expression is recorded

#### Scenario: Other timers on the step are unaffected

- **WHEN** one timer on a step is dropped and another arms normally
- **THEN** the armed set contains the second timer, the earliest-timer selection
  reflects it, and exactly one `timer.unarmed` event is recorded

#### Scenario: Instances that lost a timer are queryable

- **WHEN** the event log is queried for `timer.unarmed`
- **THEN** every instance that dropped a timer is returned, with the timer and the
  reason

#### Scenario: An armed timer records no event

- **WHEN** every timer on an entered step arms successfully
- **THEN** no `timer.unarmed` event is recorded for that entry
