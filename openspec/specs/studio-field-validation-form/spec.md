## Purpose

The studio area's per-field validation editor. It defines what an author can
set on a field's `validation` object without opening the JSON view. It also
defines which keys each field type offers. A third rule governs a key that does
not suit the field's type.

## Requirements

### Requirement: The field catalog edits a field's validation object

The field catalog panel SHALL offer an editor for each field's `validation`
object. The editor SHALL cover the six keys `FieldValidation` declares: `min`,
`max`, `minLength`, `maxLength`, `pattern` and `rule`. An author SHALL reach it
for a top-level field and for a field inside a group field.

The editor SHALL write through the draft store like every other panel field. It
SHALL introduce no route and no schema key.

#### Scenario: A field carries no validation yet

- **WHEN** an author opens the field catalog for a field whose `validation` is
  absent
- **THEN** the editor shows each offered key empty, and the draft body still
  carries no `validation` for that field

#### Scenario: The author sets one constraint

- **WHEN** an author enters `10` for `minLength` on a `string` field and the
  draft saves
- **THEN** the saved body carries `validation: { minLength: 10 }` for that
  field and no other validation key

#### Scenario: The author clears the last constraint

- **WHEN** an author empties the only key a field's `validation` carried and
  the draft saves
- **THEN** the saved body carries no `validation` key for that field, rather
  than an empty object

#### Scenario: A group holds the field

- **WHEN** an author expands a group field and selects one of its sub-fields
- **THEN** the same editor is available on that sub-field

### Requirement: The offered key set follows the field's declared type

The editor SHALL offer only the keys the engine evaluates for that field's
declared type. The function `checkConstraints` in `src/runtime/api.ts` reads
the submitted value's JavaScript type. The offered set SHALL mirror it:

| Declared type | Keys offered |
|---|---|
| `number` | `min`, `max`, `rule` |
| `string` | `minLength`, `maxLength`, `pattern`, `rule` |
| `list` | `minLength`, `maxLength`, `rule` |
| `boolean`, `group` | `rule` |
| `file`, a plugin type | `min`, `max`, `minLength`, `maxLength`, `pattern`, `rule` |

The declared `format` SHALL NOT narrow the offered set. A format fixes the
value's semantics, and `checkConstraints` still reads the same JavaScript type
underneath it. A `format: "date"` field is a string field to every branch that
function runs.

`typeMatches` (`src/schema/definition.ts`) treats `file` and a plugin type as
opaque. Neither constrains the submitted value's JavaScript shape, so
`checkConstraints` may apply any of its branches depending on what arrives.
The offered set mirrors that by offering everything.

`boolean` and `group` never reach a `checkConstraints` branch, regardless of
value. `rule` is all either can ever use.

The editor SHALL offer `rule` for every type. A CEL rule reads the whole
instance context, not one value's JavaScript type.

#### Scenario: A number field

- **WHEN** an author opens the validation editor on a `number` field
- **THEN** the editor offers `min`, `max` and `rule` alone

#### Scenario: A multiselect field

- **WHEN** an author opens the validation editor on a `list` field
- **THEN** the editor offers `minLength`, `maxLength` and `rule` alone, since a
  list carries no pattern

#### Scenario: A format leaves the offered set alone

- **WHEN** an author opens the validation editor on a
  `{type: "string", format: "date"}` field
- **THEN** the editor offers the same keys it offers on a `string` field
  declaring no format

#### Scenario: A field whose type carries a plugin envelope

- **WHEN** an author opens the validation editor on a field with a custom
  (plugin) type
- **THEN** the editor offers every key, since the type constrains no
  particular JavaScript shape for the submitted value

### Requirement: The editor keeps and marks a key that does not suit the type

A hand-authored or imported body may carry a validation key the field's
declared type does not offer. The editor SHALL show that key with its value. It
SHALL let the author change or remove it. It SHALL mark it as one the engine
does not evaluate for this field, and SHALL never drop it silently.

A type change on the field SHALL leave an existing key in place under the same
rule.

#### Scenario: An imported body carries pattern on a number field

- **WHEN** an author opens the validation editor on a `number` field whose body
  carries `pattern`
- **THEN** the editor shows `pattern` with its value and marks it as not
  evaluated for a `number` field

#### Scenario: The author changes a field's type

- **WHEN** a `string` field carrying `maxLength` becomes a `boolean` field
- **THEN** `maxLength` stays in the body with its value, and the editor marks
  it as not evaluated

#### Scenario: Opening the editor writes nothing

- **WHEN** an author opens the validation editor on any field and closes it
  without touching a control
- **THEN** the field's `validation` object stays exactly as it was

### Requirement: The pattern editor surfaces the draft's live validation inline

The editor SHALL show, beside the `pattern` input, this field's own `pattern`
issues. These come from the draft's existing live validation
(`compile.ts::checkPatterns`, run on every draft change). The editor SHALL
compute no check of its own. It SHALL read the same issue list `IssueList`
already shows for this field, never a second implementation.

`checkPatterns` reports two conditions. The source MUST compile as a
JavaScript `RegExp`. Its length MUST stay under the bound
`compile.ts::checkPatterns` declares, the constant `MAX_PATTERN_LENGTH`.
These reports SHALL stay advisory in the editor and SHALL NOT block saving.
Publish keeps `compile.ts::checkPatterns` unchanged. A body reaching publish
by another route meets the same bar.

#### Scenario: An uncompilable pattern

- **WHEN** an author types `[a-` into `pattern`
- **THEN** the editor shows the live-validation issue beside the input,
  reporting that the pattern does not compile
- **AND** the draft still saves the text as typed

#### Scenario: An over-long pattern

- **WHEN** an author pastes a pattern longer than the bound
  `compile.ts::checkPatterns` enforces
- **THEN** the editor shows the live-validation issue beside the input,
  reporting that the pattern exceeds the bound

#### Scenario: A valid pattern

- **WHEN** an author types `^[A-Z]{2}[0-9]{4}$`
- **THEN** the editor shows no pattern issue beside the input

### Requirement: The rule editor uses a structured row builder, with a CEL escape hatch

The `rule` key SHALL use a row builder as its default editor. A row
compares an operand against a literal or another field. The operand
defaults to "this answer," which SHALL compile to `data.<key>`, naming
the field's own catalog key. More rows join by "and."

The "another field" operand list SHALL filter to fields whose `celType`
matches the row's left operand. This narrowly reopens stage 27b's
deferred field-against-field comparison, scoped to `validation.rule`
alone; `ConditionBuilder` and its own sites keep their literal-only
`value`.

The builder SHALL write `{ lang: "cel", src }`, the same shape the raw
input wrote before this change. It reuses `ConditionBuilder`'s
parse-back approach. It reads the stored `rule` back into rows. It
falls back to a raw row when a fragment does not fit the row model.

The builder SHALL keep a "Developer view" disclosure holding the CEL
text input. This covers an expression the builder cannot represent as
rows. It also covers an author who wants to write CEL directly.

This requirement SHALL NOT depend on the condition builder of stage 27b
remaining a single component. A shared implementation is an internal
detail, not a contract.

This change does not touch `checkConstraints`, `evalGuard`, or
`buildGuardContext`. A rule the builder writes evaluates exactly as a
hand-written one would.

#### Scenario: An author writes a rule through the builder

- **WHEN** an author adds a row comparing "this answer" as "at least"
  `1000` on a `number` field
- **THEN** the saved body carries `validation.rule` as
  `{ lang: "cel", src: "data.amount >= 1000.0" }`, naming that field's
  own key

#### Scenario: A hand-written rule opens in the builder

- **WHEN** an author opens a `rule` a person typed by hand as
  `data.amount > 0.0`
- **THEN** the builder shows it as a row, not raw CEL

#### Scenario: An unbuildable rule opens in "Developer view"

- **WHEN** an author opens a `rule` the builder cannot represent as rows
- **THEN** the "Developer view" disclosure holds the raw CEL text, and
  the row builder shows no row for that fragment

#### Scenario: A rule that fails type-check reports the same as before this change

- **WHEN** an author enters a rule referencing a field the catalog does
  not declare
- **THEN** the draft's existing issue list reports it, the same as
  before this change
