## ADDED Requirements

### Requirement: The field-type-to-JS-shape mapping has one implementation

The mapping from a `BaseFieldType` to its expected JS runtime shape (used
both to check a submitted value's type and to produce the `expected` label
on a `type-mismatch` issue) SHALL be implemented once, as a table indexed
by `BaseFieldType`, not as two independently-maintained `switch`
statements. The table SHALL cover every `BaseFieldType` member
exhaustively, so a future addition to `BaseFieldType` without a
corresponding table entry is a compile-time error, not a silently
fail-open runtime default. A `FieldDef["type"]` that is not a
`BaseFieldType` (a plugin envelope) SHALL remain an explicit
opaque-accept case, evaluated before the table lookup, unchanged from
pre-consolidation behavior.

#### Scenario: A scalar-typed field's value is checked against its JS shape

- **WHEN** a field of type `string`, `date`, `datetime`, `select`, or
  `reference` is checked against a submitted value
- **THEN** the check passes only if the value is a JS `string`, and a
  failing `type-mismatch` issue's `expected` is `"string"` — identical to
  pre-consolidation behavior

#### Scenario: A multiselect field's value is checked as an array of strings

- **WHEN** a `multiselect` field is checked against a submitted value
- **THEN** the check passes only if the value is an array whose every
  element is a JS `string`, and a failing `type-mismatch` issue's
  `expected` is `"string[]"` — identical to pre-consolidation behavior

#### Scenario: An opaque field type always matches

- **WHEN** a `file` or `group` field, or a field whose declared type is a
  plugin envelope (not a `BaseFieldType` string), is checked against any
  submitted value
- **THEN** the check always passes, and (for `file`/`group` or a plugin
  type) the `expected` label used if some other check still produced a
  `type-mismatch` issue would be `"any"` — identical to pre-consolidation
  behavior
