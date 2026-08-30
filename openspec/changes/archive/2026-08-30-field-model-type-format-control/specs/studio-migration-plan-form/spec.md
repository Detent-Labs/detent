## MODIFIED Requirements

### Requirement: The form reports what the browser can check, before the save

The form SHALL show an inline error for a rule it can evaluate from the
two bodies it already holds. Three rules qualify:

- a `fieldMap` that maps two sources onto one target;
- a `fieldMap` pair whose CEL types disagree;
- a `stepMap` value or an `unmappableStep` naming the reserved cancel-sink
  step.

The type rule SHALL compare CEL types, not declared field types. Two fields
sharing one declared type can still disagree, because a `format` moves the CEL
type. A `{type: "number", format: "integer"}` field reports `int`. A plain
`number` field reports `double`. A check over the declared type alone would
miss that pair. It would also flag `file` against a plugin type, which the
server accepts, since both report `dyn`.

The form SHALL show each error at the row it applies to. The server keeps
every check it runs today. The form adds no rule the server does not
already enforce.

#### Scenario: The form reports a non-injective field map at the row

- **WHEN** two field-map rows target the same field
- **THEN** the form shows an error on the offending rows before the
  developer saves

#### Scenario: The form reports a type mismatch at the row

- **WHEN** a field-map row moves a `string` field onto a field the target
  version declares as `number`
- **THEN** the form shows an error on that row

#### Scenario: An integer target disagrees with a plain number source

- **WHEN** a field-map row moves a `number` field declaring no format onto a
  field the target version declares as `{type: "number", format: "integer"}`
- **THEN** the form shows an error on that row, because `double` and `int` are
  different CEL types

#### Scenario: Two declared types sharing one CEL type pass

- **WHEN** a field-map row moves a `file` field onto a field the target
  version declares with a plugin envelope type
- **THEN** the form shows no error, because both hold the CEL type the
  server compares

#### Scenario: A valid plan shows no inline error

- **WHEN** every row resolves and no rule above is broken
- **THEN** the form shows no inline error
