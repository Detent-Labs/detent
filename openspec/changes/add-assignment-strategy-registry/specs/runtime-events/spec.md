<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

### Requirement: An unresolved assignment is recorded as an event

The event union SHALL gain an `assignment.unresolved` kind. A step entry
triggers it when the step's registered assignment resolver fails. A resolver
fails by raising, by returning a value that is not a `string[]`, or by exceeding
its deadline. Its payload SHALL carry `stepId` (the step being entered) and
`reason` (why the resolution failed).

The engine SHALL record the event in the same transaction as the commit that
enters the step. That commit's own concurrency predicate guards it. An instance
therefore cannot carry an unexplained empty candidate list.

An unresolved assignment changes no step beyond the entry that commits with it,
so it is not transition-shaped. This event SHALL NOT advance `transitionSeq`,
SHALL write no separate `HistoryEntry`, and SHALL enqueue no actions. This
matches `timer.unarmed`, which records the same shape of fact: a declared thing
produced no value at entry.

#### Scenario: A failed resolution is recorded with its reason

- **WHEN** an instance enters a step whose assignment resolver fails
- **THEN** an `assignment.unresolved` event naming the step and the reason is
  recorded, and the instance's `transitionSeq` is unchanged

#### Scenario: The event commits with the entry it explains

- **WHEN** a step entry commits with empty candidates after a failed resolution
- **THEN** the `assignment.unresolved` event is present on the instance's
  record, written by the same transaction

#### Scenario: The event carries no action outcomes

- **WHEN** an `assignment.unresolved` event is recorded
- **THEN** it carries no `actions` field, since no actions were enqueued

#### Scenario: A successful resolution records nothing

- **WHEN** an instance enters a step whose assignment resolver returns a list
- **THEN** no `assignment.unresolved` event is recorded, whether the list is
  empty or not
