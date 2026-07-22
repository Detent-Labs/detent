## ADDED Requirements

### Requirement: A dropped migration transform is recorded as an event

Migration `transforms` evaluation remains total: an entry whose expression
raises, or whose result cannot be made JSON-safe, SHALL leave its target
field unwritten and SHALL NOT fail the migration. That omission SHALL be
recorded as a `migration.transform-dropped` event naming the target
`fieldId` and the reason it was dropped (`"expression-raised"` when the CEL
evaluation itself threw, `"value-out-of-range"` when evaluation succeeded
but the result could not be represented as a JSON-safe value), so the loss
is queryable instead of silent.

The event's `version` SHALL be the target version — the `fieldId` it names
is declared in the target catalog, so it resolves there, the same rule
`timer.unarmed` follows for the timer id it names. Its `transitionSeq` SHALL
be the sequence the migration commits to, without advancing it further. It
SHALL be recorded in the same transaction as the migration's own commit.

Like `timer.unarmed`, `migration.skipped`, and `subprocess.outcome-unmatched`,
this event enqueues no actions and SHALL carry no `ActionOutcome`s.

#### Scenario: A raising transform is recorded

- **WHEN** a migration's `transforms` entry for a target field reads a
  source field the instance never wrote, and its CEL evaluation raises
- **THEN** the migration commits, that field is absent from the migrated
  `data`, and a `migration.transform-dropped` event naming the field and
  reason `"expression-raised"` is recorded in the same transaction

#### Scenario: An out-of-range transform result is recorded

- **WHEN** a migration's `transforms` entry evaluates successfully but
  yields a value that cannot be represented as a JSON-safe number
- **THEN** the migration commits, that field is absent from the migrated
  `data`, and a `migration.transform-dropped` event naming the field and
  reason `"value-out-of-range"` is recorded in the same transaction

#### Scenario: A successful transform records no event

- **WHEN** every `transforms` entry in a migration evaluates successfully to
  a JSON-safe value
- **THEN** no `migration.transform-dropped` event is recorded for that
  migration

#### Scenario: The event carries no action outcomes

- **WHEN** a `migration.transform-dropped` event is recorded
- **THEN** it carries no `actions` field, since no actions were enqueued
