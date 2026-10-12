## MODIFIED Requirements

### Requirement: Operators and value editors follow the operand type

The operators a row offers SHALL follow the operand's CEL type. A number
offers the six ordering and equality operators, whether it reports `double` or
`int`. A string and a boolean offer equality only. A list offers a contains
operator, which emits `in`.

The value editor SHALL follow the operand's type and the field's own declared
`format`. A field declaring options in the body SHALL show those options by
label and write the option value. A boolean SHALL offer yes, no and an empty
choice. A row on a boolean operand starts on the empty choice. The row
stays incomplete until the author picks yes or no. Picking "No" from the empty
choice SHALL write the row. A number
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

#### Scenario: A new boolean row starts empty

- **WHEN** a developer adds a row on a boolean operand
- **THEN** the value select shows the empty choice
- **AND** the row shows the incomplete mark

#### Scenario: Choosing No on a new boolean row writes the row

- **WHEN** a developer picks "No" in the value select of that new row
- **THEN** the builder writes `data.approved == false`

### Requirement: The written literal follows the operand's declared type

The builder SHALL write a literal in the form the operand's CEL type requires.
The form the author typed does not govern. A `double` operand SHALL emit the
CEL `double` form. An `int` operand SHALL emit a bare integer, with no decimal
part, since a `double` literal does not type-check against an `int`.

The text SHALL be valid CEL for every finite number. A `double` literal whose
JavaScript text carries an exponent, such as `1e21`, SHALL keep that text
without a trailing `.0`. An `int` operand SHALL take a safe integer only.
A value beyond the safe range counts as no literal, and the row stays
incomplete.

The builder SHALL write a string literal in double quotes. It SHALL escape any
character the CEL string grammar requires it to escape. It SHALL write a bare
boolean operand as an explicit comparison against `true`.

#### Scenario: A value holding a quote stays parseable

- **WHEN** an author enters a value that itself holds a double quote or a
  backslash
- **THEN** the written literal escapes it, and the whole expression parses

<!-- antislop: allow passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
#### Scenario: A number literal is written in double form

- **WHEN** an author types `1000` as the value of a `number` operand declaring
  no format
- **THEN** the builder writes `data.amount > 1000.0`, which type-checks

#### Scenario: The builder writes an integer literal bare

- **WHEN** an author types `3` as the value of a
  `{type: "number", format: "integer"}` operand
- **THEN** the builder writes `data.prioritaet > 3`, which type-checks

#### Scenario: A large double gets valid CEL text

- **WHEN** an author types `1e21` as the value of a `number` operand
- **THEN** the builder writes `data.amount > 1e+21`, which parses and type-checks

#### Scenario: An integer beyond the safe range is no literal

- **WHEN** an author types `9007199254740993` as the value of a
  `{type: "number", format: "integer"}` operand
- **THEN** the row stays marked incomplete, and the written expression omits it

<!-- antislop: allow passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
#### Scenario: A single-quoted literal is normalised on edit

- **WHEN** an author edits a guard that reads `data.status == 'failed'`
- **THEN** the written guard reads `data.status == "failed"`, with the same
  meaning

<!-- antislop: allow passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
### Requirement: An incomplete row is held in the builder and not written

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live requirement. -->
A row may name an operand and carry no value. The builder SHALL then keep the
row visible and marked incomplete. It SHALL leave that row out of the written
expression, and SHALL NOT emit a fragment that does not parse.

When rows exist and none contributes, the builder SHALL write nothing. The
expression the draft holds, if any, SHALL stand as it was.

Removing a row is the one action that can remove that expression. A removal
that leaves no complete row SHALL remove the condition, the same as clearing
the text input. A removal at a site whose draft has no condition SHALL leave
the draft as it was.

The readout line under the rows SHALL show the expression the draft holds while
no row contributes.

#### Scenario: A half-filled row does not reach the draft

- **WHEN** an author picks an operand and an operator but enters no value
- **THEN** the row stays visible and marked incomplete, and the written
  expression omits it

#### Scenario: Deleting the last row removes the condition

- **WHEN** an author deletes the last row of a path guard
- **THEN** the guard goes away, the same as clearing the text input
- **AND** the publish-time path rules judge the result as they do today

#### Scenario: An unfinished edit keeps the stored condition

- **WHEN** a guard reads `data.amount > 1000.0`
- **AND** an author picks another operand for its only row, which leaves the
  row without a value
- **THEN** the row stays visible and marked incomplete
- **AND** the guard still reads `data.amount > 1000.0`

#### Scenario: Removing a row added to an empty site changes nothing

- **WHEN** a condition site has no expression
- **AND** an author adds a row and then removes it
- **THEN** the site writes nothing

## REMOVED Requirements

### Requirement: An automatic path's guard shows a plain-English summary on its canvas edge

**Reason**: A manual path can carry a guard too, and the canvas must show it. The heading named the automatic path alone. The requirement returns under a new name. The same rules now cover both triggers.

**Migration**: See "A path's guard shows a plain-English summary on its canvas edge".

### Requirement: The path inspector shows a "triggered by" control, and the guard under an "Only when" heading

**Reason**: Owner ruling 2026-10-10 lets a manual path carry a guard, a conditional button. The old text hid that guard. An author could not see or remove a guard that the runtime still read. The requirement returns under a new name.

**Migration**: See the added requirement on the path inspector's "triggered by" control.

## ADDED Requirements

### Requirement: A path's guard shows a plain-English summary on its canvas edge

The canvas SHALL show a plain-English summary of a path's guard as a label on
that path's edge. That holds for an automatic path and for a manual path.
A new pure function, `summarizeCondition`, SHALL build that summary from the
same `Condition`/`Row` model the builder already computes for that guard.

<!-- antislop: allow synonym-rotation trailing-negation -->
<!-- Why: copied byte for byte from the removed requirement. -->
It SHALL NOT read `celReadout`, the builder's raw-CEL preview text, to
produce this summary. That text is CEL syntax, not a sentence.

A guard the builder cannot represent as rows SHALL show its raw CEL text
as the edge label instead. See "A fragment the builder cannot represent
survives as a raw row" above.

The priority badge and the "else" marker stay with automatic paths. A manual
path draws its guard label and no badge.

#### Scenario: A single-row guard shows its plain-English form

- **WHEN** an automatic path's guard reads `data.status == "approved"`,
  and the builder shows it as one row
<!-- antislop: allow trailing-negation -->
<!-- Why: copied byte for byte from the removed scenario. -->
- **THEN** the path's canvas edge shows a label built from that row, not
  the raw CEL

#### Scenario: An unbuildable guard shows raw CEL on the edge

- **WHEN** an automatic path's guard holds a fragment the builder keeps
  as a raw row
- **THEN** the path's canvas edge shows that fragment's CEL text as the
  label

#### Scenario: A manual path's guard shows on its edge

- **WHEN** a manual path's guard reads `data.amount > 1000.0`
- **THEN** the path's canvas edge shows a label built from that row
- **AND** the edge shows no priority badge

### Requirement: The path inspector shows a "triggered by" control, and the guard for either trigger under an "Only when" heading

<!-- antislop: allow synonym-rotation negation-habit -->
<!-- Why: copied byte for byte from the removed requirement. -->
The path inspector SHALL render the path's existing `trigger` field
as a two-option segmented control, labeled "triggered by". The options
are a participant's choice (`trigger: "manual"`), and a condition
(`trigger: "automatic"`). This SHALL set the same field the path
inspector sets today; it adds no new field.

The path inspector SHALL render the existing `ConditionBuilder` row UI under an
"Only when" heading for both triggers. On an automatic path the guard decides
whether the path fires. On a manual path the guard decides whether the
participant gets the button. The inspector SHALL say so beside the guard.
The `priority` input SHALL show for an automatic path alone.

Choosing "a participant's choice" SHALL drop the path's `priority` and SHALL
keep its guard. Choosing "a condition" SHALL keep a guard the path already
carries.

#### Scenario: Choosing "a condition" shows the guard under "Only when"

- **WHEN** the developer selects "a condition" in a path's "triggered
  by" control
- **THEN** the path's `trigger` becomes `automatic`
- **AND** the existing `ConditionBuilder` row UI renders under an
  "Only when" heading

#### Scenario: A manual path shows its guard editor

- **WHEN** the developer opens a manual path
- **THEN** the "Only when" heading and the `ConditionBuilder` row UI render
- **AND** no `priority` input renders

#### Scenario: Choosing "a participant's choice" keeps the guard

- **WHEN** the developer builds `amount > 1000` on an automatic path with
  priority 1, then selects "a participant's choice"
- **THEN** the path's `trigger` becomes `manual`
- **AND** the path keeps the guard `data.amount > 1000.0`
- **AND** the path has no `priority`
- **AND** the "Only when" panel still renders for that path

### Requirement: The builder reads back every literal it writes

The builder SHALL read each literal it writes back as a comparison row. A
condition then survives a remount as the same row.

The parser returns an integer literal as a `bigint`. The reader SHALL accept it
and SHALL turn it into a number while the value stays a safe integer. It SHALL
fold a unary minus over a numeric literal into a negative number. That holds
for an integer and a double. A literal outside the safe range stays a raw row,
and so does any other node.

The rule builder for `validation.rule` shares these readers and SHALL meet the
same rule.

#### Scenario: An integer literal reads back as a row

- **WHEN** a guard reads `data.prioritaet > 3` and `prioritaet` is a
  `{type: "number", format: "integer"}` field
- **THEN** the builder shows one comparison row with the value `3`

#### Scenario: A negative literal reads back as a row

- **WHEN** a guard reads `data.amount > -5.0` and `amount` is a `number` field
- **THEN** the builder shows one comparison row with the value `-5`

#### Scenario: Every written literal reads back

- **WHEN** the builder writes a literal for a `string`, `bool`, `int` or
  `double` operand, including a negative number and a double with an exponent
- **THEN** reading the written text yields a comparison row with the same
  operand, operator and value

#### Scenario: An unsafe integer stays a raw row

- **WHEN** a guard reads `data.prioritaet == 9007199254740993`
- **THEN** the builder shows that comparison as one raw row

#### Scenario: A validation rule reads back the same literals

- **WHEN** a field's `validation.rule` reads `data.prioritaet > -3`
- **THEN** the rule builder shows one comparison row
