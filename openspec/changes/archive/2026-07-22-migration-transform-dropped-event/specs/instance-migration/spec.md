## MODIFIED Requirements

### Requirement: transforms compute target values from the pre-migration data

A `transforms` entry SHALL be a CEL expression keyed by the target `FieldId`,
evaluated over the pre-migration snapshot, its result written to that field.

Evaluation SHALL be total in the same sense as guard evaluation: an expression that
raises SHALL leave its target field unwritten and SHALL NOT fail the migration. A
mid-flight instance with incomplete data is the normal case, and failing its
migration would strand exactly the instances migration exists to move.

Values written SHALL be JSON-safe. The CEL library models `int` as bigint, and a
bigint written into the payload makes the instance unparseable on its next read —
corruption produced by the migration itself.

A dropped transform — whether from a raising expression or a value that cannot
be made JSON-safe — SHALL be recorded as a `migration.transform-dropped`
`InstanceEvent` (see `runtime-events`) naming the target field and the reason,
in the same transaction as the migration. The migration itself is unaffected;
this only makes the omission queryable.

#### Scenario: A transform writes a computed value

- **WHEN** a transform for target field B reads a populated source field A
- **THEN** B holds the computed result after migration

#### Scenario: A transform reads the snapshot, not the remapped data

- **WHEN** `fieldMap` moves A to B and a transform for C reads A
- **THEN** the transform sees A's original value

#### Scenario: A transform overwrites a renamed value

- **WHEN** `fieldMap` moves A to B and `transforms` also targets B
- **THEN** B holds the transform's result

#### Scenario: A raising transform leaves its field unwritten

- **WHEN** a transform reads a field the instance never wrote
- **THEN** the instance still migrates, its target field is absent from
  `data`, and a `migration.transform-dropped` event naming that field and
  reason `"expression-raised"` is recorded

#### Scenario: An integer-valued transform stays readable

- **WHEN** a transform yields a CEL integer
- **THEN** the migrated instance parses on its next read
