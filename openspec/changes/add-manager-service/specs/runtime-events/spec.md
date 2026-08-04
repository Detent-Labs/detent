<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: An unresolved step assignment is recorded as an event

The system SHALL record an `assignment.unresolved` event when a step entry
resolves its declared assignment to no candidate. The
`assignment-strategy-registry` capability defines the three causes. Those are a
resolver that raised, a resolution that exceeded its deadline, and a resolver
that returned an empty list.

The payload SHALL be `{ stepId, reason }`. `reason` SHALL be one of
`resolver-raised`, `timed-out` or `no-candidates`. This is the shape
`instance.faulted` already uses.

The payload SHALL NOT carry the strategy type. The envelope carries the `version`
in force, and `stepId` resolves against that frozen body. A reader therefore
recovers the strategy from the definition.

The event SHALL carry no `ActionOutcome`s. An unresolved assignment enqueues no
action. The field would be permanently absent, and it would invite a reader to
expect outcomes that cannot exist. This follows `timer.unarmed` rather than
`timer.fired`.

The event SHALL be recorded in the same transaction as the step entry that caused
it. The entry commits whatever the resolution produced. The event therefore
records a committed fact rather than a rolled-back try.

The event SHALL NOT advance `transitionSeq`. It carries the sequence in force
after the entry it accompanies. It shares that sequence with the entry's
`HistoryEntry` where one exists.

A step entry resolving at least one candidate SHALL record no such event. A step
declaring no `assignment` SHALL record none either.

#### Scenario: A resolver that raises records the event

- **WHEN** an instance enters a step whose assignment resolver raises
- **THEN** an `assignment.unresolved` event is recorded naming that step and the
  `resolver-raised` reason
- **AND** the instance's `assignment.candidates` is empty

#### Scenario: A resolution exceeding its deadline records the event

- **WHEN** an instance enters a step whose assignment resolver does not answer
  within its deadline
- **THEN** an `assignment.unresolved` event is recorded with the `timed-out`
  reason

#### Scenario: A resolution yielding nobody records the event

- **WHEN** an instance enters a step whose assignment resolver returns an empty
  list
- **THEN** an `assignment.unresolved` event is recorded with the
  `no-candidates` reason

#### Scenario: A successful resolution records no event

- **WHEN** an instance enters a step whose assignment resolver returns at least
  one candidate
- **THEN** no `assignment.unresolved` event is recorded

#### Scenario: The event carries no action outcomes

- **WHEN** an `assignment.unresolved` event is read back
- **THEN** it carries no `ActionOutcome` list

#### Scenario: The event shares the entry's sequence

- **WHEN** a transition onto a step records an `assignment.unresolved` event
- **THEN** the event and that transition's `HistoryEntry` carry the same
  `transitionSeq`

#### Scenario: A creation records the event at sequence zero

- **WHEN** an instance is created on a definition whose initial step declares an
  assignment resolving to nobody
- **THEN** the creation commits and an `assignment.unresolved` event is recorded
  at `transitionSeq` 0, where no `HistoryEntry` exists
