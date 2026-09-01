<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the
     rest of this repo's specs use (see data-retention/spec.md's own
     allow-file passive-voice for the same reason). That grammar is
     structurally passive ("WHEN X is called", "THEN Y is deleted");
     rewriting it to dodge the rule would break the required Scenario
     format. -->

## ADDED Requirements

### Requirement: A visibility change is recorded as an event

The event union SHALL gain a `visibility.changed` kind. The engine records it
when an administrator changes who may see one instance.
`instance-visibility-set` owns when that happens.

The payload SHALL name the `op`, the `actorId` whose visibility changed, and
the `byActorId` who changed it. The `op` SHALL be one of `"revoked"`,
`"restored"` and `"granted"`. One kind covers all three, because the three
differ in direction alone and a reader wants them on one timeline.

The engine SHALL record this event only for an administrative act. An
assignment outranking a revocation changes nothing stored, so it records
nothing. Its own transition already carries a `HistoryEntry`.

The event SHALL be recorded on the instance whose visibility changed. It lands
in the same transaction as the visibility write itself. It SHALL carry the
`version` and the `transitionSeq` in force. It SHALL NOT advance the sequence.

Like `timer.unarmed`, `migration.skipped` and `mapping.entry-dropped`, this
event enqueues no actions and SHALL carry no `ActionOutcome`s.

The canonical kind table in this specification's Purpose SHALL gain a row for
it, and its count SHALL read fourteen.

#### Scenario: A revocation is recorded

- **WHEN** an administrator revokes actor A from an instance
- **THEN** a `visibility.changed` event carrying `"revoked"`, A and the
  administrator is recorded on that instance

#### Scenario: A grant is recorded

- **WHEN** an administrator grants actor B an instance B never took part in
- **THEN** a `visibility.changed` event carrying `"granted"`, B and the
  administrator is recorded on that instance

#### Scenario: An assignment outranking a revocation records no event

- **WHEN** a step entry resolves a revoked actor as an eligible candidate
- **THEN** no `visibility.changed` event is recorded, and the step entry's own
  `HistoryEntry` stands alone

#### Scenario: The event does not advance the sequence

- **WHEN** the event is recorded at `transitionSeq` N
- **THEN** the event carries N, and the sequence is unchanged

#### Scenario: The event does not survive a rolled-back commit

- **WHEN** the transaction carrying the visibility write fails
- **THEN** neither the visibility change nor the event is persisted

#### Scenario: The event carries no action outcomes

- **WHEN** the event is read back
- **THEN** it carries no `ActionOutcome`s, because it enqueues no actions
