## MODIFIED Requirements

### Requirement: The form reports what the browser can check, before the save

The form SHALL show an inline error for a rule it can evaluate from the
two bodies it already holds. Six rules qualify:

- a `fieldMap` that maps two sources onto one target;
- two `fieldMap` rows with one source;
- two `stepMap` rows with one source;
- two `transforms` rows with one target;
- a `fieldMap` pair whose CEL types disagree;
- a `stepMap` value or an `unmappableStep` naming the reserved cancel-sink
  step.

The type rule SHALL compare CEL types. It SHALL ignore the declared field
types. Two fields
sharing one declared type can still disagree, because a `format` moves the CEL
type. A `{type: "number", format: "integer"}` field reports `int`. A plain
`number` field reports `double`. A check over the declared type alone would
miss that pair. It would also flag `file` against a plugin type, which the
server accepts, since both report `dyn`.

The form SHALL show each error at the row it applies to. The server keeps
every check it runs today. The form adds only rules the server already
enforces, with one exception.

The plan holds each source as one JSON key. It holds each transform target
the same way. Two rows with one key save as one entry. The server never
sees the second row. The three rules for those rows SHALL mark every row in
the collision. The form then never drops a row without a warning.

#### Scenario: The form reports a non-injective field map at the row

- **WHEN** two field-map rows target the same field
- **THEN** the form shows an error on the offending rows before the
  developer saves

#### Scenario: The form reports two field-map rows with one source

- **WHEN** two field-map rows read `fld_amount`, one onto `fld_total` and
  one onto `fld_sum`
- **THEN** the form shows an error on both rows before the developer saves

#### Scenario: The form reports two step-map rows with one source

- **WHEN** two step-map rows read the same source step
- **THEN** the form shows an error on both rows

#### Scenario: The form reports two transforms with one target

- **WHEN** two transforms rows name the same target field
- **THEN** the form shows an error on both rows

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
