<!-- antislop: allow-file em-dash passive-voice sentence-length synonym-rotation -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

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

The declared `format`'s own value check SHALL live in that same one
implementation, behind the same entry point. No caller SHALL keep a second
copy. The entry point SHALL therefore take the field, not its `type` alone, so
one argument covers both halves. The `expected` label SHALL name the declared
format when the field carries one, and the JS shape otherwise.

#### Scenario: A scalar-typed field's value is checked against its JS shape

- **WHEN** a field of type `string` is checked against a submitted value
- **THEN** the check passes only if the value is a JS `string`, and a
  failing `type-mismatch` issue's `expected` is `"string"`

<!-- Scenario title stays verbatim: the OpenSpec archive step matches this block by exact title. -->
#### Scenario: A multiselect field's value is checked as an array of strings

- **WHEN** a `list` field is checked against a submitted value
- **THEN** the check passes only if the value is an array whose every
  element is a JS `string`, and a failing `type-mismatch` issue's
  `expected` is `"string[]"`

#### Scenario: A formatted field's value passes both halves in one call

- **WHEN** the check runs over a `{type: "string", format: "date"}` field and a
  submitted value
- **THEN** one call runs the JS-shape half and the format half
- **AND** a value failing the format half draws a `type-mismatch` issue whose
  `expected` is `"date"`

#### Scenario: An opaque field type always matches

- **WHEN** a `file` or `group` field, or a field whose declared type is a
  plugin envelope (not a `BaseFieldType` string), is checked against any
  submitted value
- **THEN** the check always passes, and (for `file`/`group` or a plugin
  type) the `expected` label used if some other check still produced a
  `type-mismatch` issue would be `"any"` — identical to pre-consolidation
  behavior
