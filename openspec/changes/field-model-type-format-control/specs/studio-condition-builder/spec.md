<!-- antislop: allow-file passive-voice -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: Operators and value editors follow the operand type

The operators a row offers SHALL follow the operand's CEL type. A number
offers the six ordering and equality operators, whether it reports `double` or
`int`. A string and a boolean offer equality only. A list offers a contains
operator, which emits `in`.

The value editor SHALL follow the operand's type and the field's own declared
`format`. A field declaring options in the body SHALL show those options by
label and write the option value. A boolean SHALL offer yes or no. A number
SHALL use a native number input, and a `format: "date"` or
`format: "datetime"` field SHALL use the matching native input.
`instance.status` SHALL offer the engine's instance statuses. A field bound to
a data source and `actor.roles` SHALL take free text, since no studio route
resolves those values.

#### Scenario: A number operand offers ordering operators

- **WHEN** a developer picks a `number` field as the operand
- **THEN** the row offers equality, inequality and the four ordering operators

#### Scenario: An integer operand offers the same operators

- **WHEN** a developer picks a `{type: "number", format: "integer"}` field as
  the operand
- **THEN** the row offers the same six operators a `double` operand offers

<!-- Scenario title stays verbatim: the OpenSpec archive step matches this block by exact title. -->
#### Scenario: A select operand offers its declared options

- **WHEN** a developer picks a `string` field that declares options in the body
- **THEN** the value editor lists the option labels and writes the option value

#### Scenario: A date operand uses a native date input

- **WHEN** a developer picks a `{type: "string", format: "date"}` field
- **THEN** the value editor is a native date input

#### Scenario: A list operand offers contains

- **WHEN** a developer picks `actor.roles` as the operand
- **THEN** the row offers a contains operator, and it emits
  `"manager" in actor.roles`

#### Scenario: A data-source-bound field takes free text

- **WHEN** a developer picks a `string` field bound to a data source
- **THEN** the value editor takes free text

### Requirement: The written literal follows the operand's declared type

The builder SHALL write a literal in the form the operand's CEL type requires.
The form the author typed does not govern. A `double` operand SHALL emit the
CEL `double` form. An `int` operand SHALL emit a bare integer, with no decimal
part, since a `double` literal does not type-check against an `int`.

The builder SHALL write a string literal in double quotes. It SHALL escape any
character the CEL string grammar requires it to escape. It SHALL write a bare
boolean operand as an explicit comparison against `true`.

#### Scenario: A value holding a quote stays parseable

- **WHEN** an author enters a value that itself holds a double quote or a
  backslash
- **THEN** the written literal escapes it, and the whole expression parses

#### Scenario: A number literal is written in double form

- **WHEN** an author types `1000` as the value of a `number` operand declaring
  no format
- **THEN** the builder writes `data.amount > 1000.0`, which type-checks

#### Scenario: The builder writes an integer literal bare

- **WHEN** an author types `3` as the value of a
  `{type: "number", format: "integer"}` operand
- **THEN** the builder writes `data.prioritaet > 3`, which type-checks

#### Scenario: A single-quoted literal is normalised on edit

- **WHEN** an author edits a guard that reads `data.status == 'failed'`
- **THEN** the written guard reads `data.status == "failed"`, with the same
  meaning
