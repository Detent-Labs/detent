## ADDED Requirements

### Requirement: An author may declare a field technical, never directly editable by a participant

`FieldDef` SHALL gain an optional `technical: boolean`. A `technical` field
SHALL NOT carry `type: "group"`. The compile pass SHALL reject a body that
declares `technical: true` on a group field. A group holds fields and
carries no value of its own to mark technical.

An existing body declares the key nowhere. `technical: false` SHALL parse
the same as an absent key. `definitionHash` SHALL stay what it is for every
stored body, and the read path SHALL keep parsing a stored body unchanged.

#### Scenario: A body with no technical key hashes as before

- **WHEN** the engine hashes a body declaring no field's `technical`
- **THEN** the hash equals the hash that body produced before this change

#### Scenario: A technical field publishes

- **WHEN** an author publishes a field declaring `technical: true`, of a
  non-group type
- **THEN** the publish succeeds

#### Scenario: A technical group field fails the publish

- **WHEN** an author publishes a field of `type: "group"` declaring
  `technical: true`
- **THEN** the publish fails with a validation error naming that field

### Requirement: A view field naming a technical field declares neither `required` nor `readonly`

The compile pass SHALL reject a `view.fields[]` entry whose `ref` names a
`technical` field, when that entry declares `required` or `readonly` at
all. This holds for a literal `true`, a literal `false`, and a CEL
expression alike. This is a write-path check, not a read-path refinement.
A stored immutable body has to keep deserializing whatever a later rule
tightens.

The rule follows the shape the definition contract already applies to
`options`/`dataSource` and to `duration`/`deadline`. Two facts cannot both
hold, so the compile pass rejects the pair. It never resolves one key over
the other. A display-only key, such as `order` or `group`, still passes on
a technical field's view entry.

#### Scenario: A required key on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `required: true`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A literal readonly:false on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `readonly: false`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A redundant readonly:true on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `readonly: true`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A CEL required on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `required` as a CEL expression
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A display-only entry on a technical field publishes

- **WHEN** a step's view entry names a `technical` field and declares
  `order` alone, with neither `required` nor `readonly`
- **THEN** the publish succeeds
