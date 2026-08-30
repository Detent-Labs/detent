## ADDED Requirements

### Requirement: A field declares a value form, and may declare a semantic format and an input control

`FieldDef.type` SHALL carry one of six value forms: `string`, `number`,
`boolean`, `list`, `file`, `group`. It MAY instead carry a plugin envelope, as
it does today. Each of the six maps to exactly one CEL type and one JS shape.
No two of them collapse onto one engine type.

A `list` holds strings. A list of another item type is not expressible in this
round.

`FieldDef` SHALL gain an optional `format`, carrying one of four members:
`date`, `datetime`, `integer`, `email`. A `format` states the value's
semantics. The engine checks every member twice: at publish for a literal
default, and at submission for a participant's value.

`FieldDef` SHALL gain an optional `control`, carrying one of three members:
`multiline`, `radio`, `checkboxes`. A `control` states the input form alone. No
reader outside the field renderer SHALL read it.

Each enum admits a fixed member set. A field type that no member covers uses
the plugin envelope instead. That envelope carries its own semantics in its
config. `control` sits at catalog level. A step's view entry SHALL NOT override
it.

An omitted `format` means the type's own value domain. An omitted `control`
means the default control for the type. A body declaring neither key therefore
renders exactly as it does today.

#### Scenario: A field declaring a type alone publishes

- **WHEN** an author publishes a body whose fields declare `type` and neither
  `format` nor `control`
- **THEN** the publish succeeds, and every field keeps the value domain and the
  control its type alone gives it

#### Scenario: A removed type member fails to parse

- **WHEN** a body declares a field of type `select`, `multiselect`, `date`,
  `datetime` or `reference`
- **THEN** the body fails to parse, naming that field's `type`

#### Scenario: A picker is a type plus an option source

- **WHEN** an author declares a `string` field carrying `options` and a `list`
  field carrying the same `options`
- **THEN** both publish, the first taking one option value and the second
  taking an array of them

### Requirement: A field's type governs the format and control it may carry

The compile pass SHALL reject a body declaring a `format` or a `control` that
the field's own `type` does not allow. The rule reads one table:

| `type` | allowed `format` | allowed `control` |
|---|---|---|
| `string` | `date`, `datetime`, `email` | `multiline`, `radio` |
| `number` | `integer` | none |
| `boolean` | none | `radio` |
| `list` | none | `checkboxes` |
| `file` | none | none |
| `group` | none | none |

A field whose `type` is a plugin envelope allows neither key. Its semantics and
its rendering belong to the plugin, not to a closed member.

This is a publish-path check. An unbypassable check is the reason, per the
placement requirement this capability already states. The reported error SHALL
locate at the offending field's `format` or `control`.

#### Scenario: An integer format on a string field fails the publish

- **WHEN** a field declares `{type: "string", format: "integer"}`
- **THEN** the publish fails with a validation error locating that field's
  `format`

#### Scenario: A checkboxes control on a string field fails the publish

- **WHEN** a field declares `{type: "string", control: "checkboxes"}`
- **THEN** the publish fails with a validation error locating that field's
  `control`

#### Scenario: An allowed pair publishes

- **WHEN** a field declares `{type: "string", format: "date"}` and another
  declares `{type: "list", control: "checkboxes"}`
- **THEN** the publish succeeds

#### Scenario: A format on a plugin-typed field fails the publish

- **WHEN** a field whose `type` is a plugin envelope declares
  `format: "email"`
- **THEN** the publish fails with a validation error locating that field's
  `format`

### Requirement: A literal default satisfies its field's declared format

The compile pass SHALL reject a body whose field declares a `format` and a
literal `FieldDef.default` that the format refuses. An author writes that
value, and it lands in `instance.data` at creation like a submitted one.

This check SHALL skip an `Expression` default. Its result type is the CEL
layer's business, and that layer reads no format.

Each format's value domain:

- `date`: a calendar date written `YYYY-MM-DD`, with a day the month holds.
- `datetime`: an ISO-8601 date and time, with an optional seconds part, an
  optional fractional part, and an optional zone offset.
- `integer`: a JSON number with no fractional part.
- `email`: an address the HTML email input accepts.

#### Scenario: A default the format refuses fails the publish

- **WHEN** a field declares `{type: "string", format: "date"}` and
  `default: "banane"`
- **THEN** the publish fails with a validation error locating that field's
  `default`

#### Scenario: An impossible calendar date fails the publish

- **WHEN** a `format: "date"` field declares `default: "2026-02-30"`
- **THEN** the publish fails with a validation error locating that field's
  `default`

#### Scenario: A CEL default passes this check

- **WHEN** a `format: "date"` field declares an expression default
- **THEN** this check reports nothing for it

## MODIFIED Requirements

### Requirement: A field may map data source columns onto other fields

`FieldDef` SHALL gain an optional `columnMapping`, an object whose key is a
column key and whose value is a `FieldId`.

The compile pass SHALL enforce every rule below, and SHALL reject a body that
breaks one. These are publish-path checks. An unbypassable check is the reason,
per the placement requirement above.

- A field declaring `columnMapping` SHALL declare `dataSource`. A mapping over
  inline options names a column no list declares.
- A field declaring `columnMapping` SHALL have `type` `"string"`. A `list`
  picks several rows, and one target field cannot take several values.
- Each key SHALL match `/^[a-z_][a-z0-9_]*$/` and stay within `MAX_KEY_LENGTH`.
- Each target SHALL resolve against the body's recursive field set.
- A target SHALL NOT be the mapping field itself.
- A target SHALL NOT be a `group` field. A group holds fields and takes no
  value.
- Two keys SHALL NOT name one target. Two columns writing one field give the
  write no order.

The compile pass SHALL NOT check a key against any data list. Publishing stays
independent of the state of the data, exactly as `db-data-source-type` already
requires. A key naming no declared column writes nothing at runtime.

#### Scenario: A valid mapping publishes
- **WHEN** an author publishes a `string` field bound to a data source, mapping
  `price` onto a `number` field of the catalog
- **THEN** the publish succeeds

#### Scenario: A mapping without a data source fails the publish
- **WHEN** a field declares `columnMapping` and inline `options`
- **THEN** the publish fails with a validation error naming that field

<!-- Scenario title stays verbatim: the OpenSpec archive step matches this block by exact title. -->
#### Scenario: A mapping on a multiselect fails the publish
- **WHEN** a `list` field declares `columnMapping`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: An unresolvable target fails the publish
- **WHEN** a `columnMapping` value names a `FieldId` the body does not declare
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A self-target fails the publish
- **WHEN** a `columnMapping` value names the mapping field itself
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A group target fails the publish
- **WHEN** a `columnMapping` value names a field whose type is `"group"`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: Two columns onto one target fail the publish
- **WHEN** two `columnMapping` keys name one `FieldId`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A key naming no declared column still publishes
- **WHEN** an author maps a column key that the bound list does not declare
- **THEN** the publish succeeds, because publishing reads no data list
