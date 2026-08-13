<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

### Requirement: A dropped data source attribute is recorded as an event

The event union SHALL gain a `datasource.attribute-dropped` kind. The engine
records it when a mapped attribute mismatches its target field's declared
type. `runtime-api` owns when that happens.

The payload SHALL name the `fieldId` of the mapping field, the `column` key,
the `targetFieldId` the mapping named, and the `reason`. The reason SHALL be
`"type-mismatch"`. A drop has that one cause. The operator wrote an attribute
against a column type the target field does not take.

The event SHALL be recorded on the instance whose field carried the mapping. It
lands in the same transaction as the submission's or the creation's own commit.
It SHALL carry the `version` and the `transitionSeq` in force. It SHALL NOT
advance the sequence.

Like `timer.unarmed`, `migration.skipped` and `mapping.entry-dropped`, this
event enqueues no actions and SHALL carry no `ActionOutcome`s.

The canonical kind table in this specification's Purpose SHALL gain a row for
it, and its count SHALL read twelve.

#### Scenario: A mistyped attribute is recorded
- **WHEN** a participant picks an option whose `price` attribute holds a string
  and whose mapped target declares `number`
- **THEN** a `datasource.attribute-dropped` event naming the mapping field, the
  `price` column, the target and `"type-mismatch"` is recorded

#### Scenario: The event does not advance the sequence
- **WHEN** the event is recorded at `transitionSeq` N alongside a transition
- **THEN** the event carries N, and the transition advances the sequence as it
  otherwise would

#### Scenario: The event does not survive a rolled-back commit
- **WHEN** the transaction carrying the submission fails
- **THEN** neither the transition nor the event is persisted

#### Scenario: The event carries no action outcomes
- **WHEN** the event is read back
- **THEN** it carries no `ActionOutcome`s, because it enqueues no actions
