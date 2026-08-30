<!-- antislop: allow-file em-dash passive-voice sentence-length synonym-rotation -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## ADDED Requirements

### Requirement: A declared control picks the input, and an inapplicable one falls back

`form-ui`'s field renderer SHALL read `FieldDef.control` and render the input
that member names:

- `multiline` on a `string` field renders a `<textarea>`.
- `radio` on a field carrying resolved options renders one radio input per
  option, all sharing one name.
- `radio` on a `boolean` field renders a two-input radio pair, one for yes and
  one for no.
- `checkboxes` on a `list` field carrying resolved options renders one checkbox
  per option.

A `control` the field's own shape cannot draw SHALL fall back to that type's
default control. One case reaches this. A `string` field under
`control: "radio"` may carry no resolved options, because a
`dataSource`-bound field resolves its options at runtime. No publish-time check
sees them. The fallback then draws the default input rather than an empty
group.

The yes and no labels of a boolean radio pair SHALL come from `form-ui`'s own
locale record. Its issue-message catalog already resolves its text that way.
The process body SHALL NOT carry them. An author wanting other wording declares
a two-option `string` field instead.

#### Scenario: A multiline string renders a textarea

- **WHEN** the renderer renders a `{type: "string", control: "multiline"}`
  field
- **THEN** it renders a `<textarea>` wired to the field's value and `onChange`

#### Scenario: An options field under radio renders one input per option

- **WHEN** the renderer renders a `string` field with three resolved options
  and `control: "radio"`
- **THEN** it renders three radio inputs sharing one name, each labeled by its
  option's resolved label

#### Scenario: A boolean under radio renders a yes and a no

- **WHEN** the renderer renders a `{type: "boolean", control: "radio"}` field
  at locale `de`
- **THEN** it renders two radio inputs, labeled from `form-ui`'s own German
  entries, and picking one writes `true` or `false`

#### Scenario: A list under checkboxes renders one checkbox per option

- **WHEN** the renderer renders a `{type: "list", control: "checkboxes"}` field
  with three resolved options
- **THEN** it renders three checkboxes, and the value is the array of the
  checked options' values

#### Scenario: A radio control with no options falls back

- **WHEN** the renderer renders a `{type: "string", control: "radio"}` field
  whose resolved options are absent
- **THEN** it renders the plain text input, not an empty radio group

### Requirement: A grouped control carries its label as a legend

A radio group and a checkbox group SHALL render inside a `<fieldset>` whose
`<legend>` carries the field's resolved label. Neither group has one control to
label, so a single `<label>` would name one input and leave the rest unnamed.

The `<fieldset>` SHALL carry the `aria-describedby` that points at the field's
issue list. Each input inside it SHALL carry its own `<label>` naming that
option. The `<fieldset>` SHALL also carry `aria-required` and `aria-invalid`.
It is the element the group's own state describes.

#### Scenario: A radio group carries its field label as the group name

- **WHEN** a screen-reader user moves into a radio group the view marks
  required
- **THEN** the field's label names the group, and the group reads as required
- **AND** each input's own option label names that input

#### Scenario: A checkbox group with issues carries the invalid state

- **WHEN** a checkbox group has attached issues
- **THEN** the group reads as invalid, and its description names them

## MODIFIED Requirements

### Requirement: Field rendering covers every BaseFieldType

`form-ui`'s field renderer SHALL render a usable input for every
`BaseFieldType`, reading `type`, `format` and `control` together.

A field carrying resolved options renders a picker, whatever its type.
The engine's `getInstanceView` resolves `options` for a static
`FieldDef.options` field and for a `dataSource`-bound field. Both therefore
reach the same picker. That
picker is a `<select>` for a `string` field, and a `<select multiple>` for a
`list` field. A `control` naming a radio group or a checkbox group replaces
it.

A field carrying no options renders by type and format. A `string` takes a
native text input. Under `format: "date"`, `"datetime"` or `"email"` it takes
the matching native input instead. A `number` takes a native number input,
stepping by one under `format: "integer"`. A `boolean` takes a checkbox.
A field of type `file`, or a `Plugin` envelope type, SHALL render as a
free-text input, since no dedicated widget exists.

#### Scenario: Every BaseFieldType renders without error

- **WHEN** `form-ui` renders a step whose view includes at least one field of
  each `BaseFieldType`
- **THEN** every field renders a corresponding input with no rendering error

#### Scenario: Every format reaches its own native input

- **WHEN** `form-ui` renders a step whose view includes one field per `format`
  member
- **THEN** the `date`, `datetime` and `email` fields render the matching native
  input types
- **AND** the `integer` field renders a number input stepping by one

#### Scenario: A dataSource-bound field renders using its resolved options

- **WHEN** a `string` or `list` field declares `field.dataSource` instead of
  `field.options`
- **THEN** the field renders a picker built from the field's resolved
  `options`, identically to a static-`options` field

### Requirement: Select and multiselect share one option-list rendering

The field renderer's single-pick and multi-pick option branches SHALL build
their `<option>` elements from `field.options` through one shared expression.
Two independently-maintained copies of the same map SHALL NOT exist. Every
option's key, value, and label text SHALL match the pre-extraction editor-only
behavior.

<!-- Scenario titles stay verbatim: the OpenSpec archive step matches each block by exact title. -->
#### Scenario: A select field renders its resolved options

- **WHEN** the renderer renders a `string` field with `field.options` set
  (statically or via a resolved `dataSource`)
- **THEN** the rendered `<select>` holds a leading blank option, plus one
  `<option>` per entry in `field.options`
- **AND** each one keys and values by `o.value`, and labels by
  `firstLocalizedText(o.label) || o.value`

#### Scenario: A multiselect field renders its resolved options

- **WHEN** the renderer renders a `list` field with `field.options` set
- **THEN** the rendered `<select multiple>` holds one `<option>` per entry in
  `field.options`, and no leading blank option
- **AND** each one keys and values by `o.value`, and labels by
  `firstLocalizedText(o.label) || o.value`

### Requirement: Free-text-fallback types share the plain text-input branch

One shared text-input branch SHALL render three cases. They are a `file`
field, a plugin envelope, and a plain `string` field declaring no `format` and
no `control`. Two independently-maintained copies of the same
`<input type="text">` SHALL NOT exist.

<!-- Scenario title stays verbatim: the OpenSpec archive step matches this block by exact title. -->
#### Scenario: A reference, file, or plugin-typed field renders as free text

- **WHEN** the renderer renders a field of type `file` or a `Plugin` envelope
- **THEN** it renders a plain `<input type="text">` wired to the field's
  value and `onChange`

#### Scenario: A plain string field renders the same way

- **WHEN** the renderer renders a field of type `string` declaring no `format`
  and no `control`
- **THEN** it renders the same `<input type="text">` shape as a
  free-text-fallback field, through the same code path

### Requirement: Required and invalid state are conveyed programmatically, not only visually

Every control `form-ui` renders SHALL carry `aria-required` when the resolved
view marks the field required, and `aria-invalid` when issues are attached to
it, on **every** rendering branch — every type, format and control branch and
the group members alike. The visual required marker (`*` with a `title`) SHALL
remain, but SHALL NOT be the only signal.

The native `required` attribute MAY be set where it does not introduce
browser-native submission blocking; the engine is the validator, and a native
block would prevent the submission the server is meant to judge. When in
doubt, `aria-required` alone is correct.

`form-ui` is deliberately the one renderer shared by the app area and the
studio area's Player, so this reaches every participant-facing form at once.

#### Scenario: A required field announces that it is required

- **WHEN** a screen-reader user focuses a field the current step's view marks
  required
- **THEN** it is announced as required

#### Scenario: An invalid field announces that it is invalid

- **WHEN** a field has attached issues
- **THEN** it is announced as invalid, and its description names them

#### Scenario: Every branch is covered

- **WHEN** any of the rendered field types — including a group's members, the
  three control branches and the free-text fallback branch — is required or
  invalid
- **THEN** the same attributes are present; no branch is exempt

#### Scenario: Native validation does not pre-empt the server

- **WHEN** a form with a required-but-empty field is submitted
- **THEN** the submission still reaches the engine, which is what decides
  whether it is valid

### Requirement: A select option shows the attributes its row carries

The renderer SHALL append an option's attribute values to the text of that
option. It SHALL do so for a single-pick field and for a multi-pick field
alike. It SHALL render them in the order the `attributes` map holds. That is
the order the operator declared.

One visible separator SHALL stand between the label and the attributes, and
between each attribute and the next.

It SHALL render a number through the locale's own number formatter. It SHALL
render a boolean as its literal value, and a string unchanged.

A boolean needs no wording of its own. An `<option>` carries one text run. No
catalog lookup and no face change reaches inside it.

An option with no attributes SHALL render exactly as it does today. The
renderer SHALL therefore need no flag and no branch on the field.

The composed text is the option's accessible name. A native `<option>` carries
text alone. A screen reader therefore reads the row as one line, and the
keyboard behavior stays what the platform gives.

A radio input's own `<label>` and a checkbox input's own `<label>` SHALL carry
the same composed text. The same rule reaches them, so an author sees one
option wording across all three renderings.

#### Scenario: An option shows its attributes
- **WHEN** a single-pick field's option carries a label and two attributes
- **THEN** the option reads as the label, a separator, and both attribute
  values in declared order

#### Scenario: A radio label shows the same composed text
- **WHEN** that same field declares `control: "radio"`
- **THEN** each radio input's label reads the same composed text the
  `<option>` would have read

#### Scenario: An option with no attributes reads as before
- **WHEN** an option carries no `attributes` key
- **THEN** the option reads as its label alone

#### Scenario: An unfilled attribute leaves no gap
- **WHEN** an option carries one attribute and its list declares two columns
- **THEN** the option reads as the label and that one value, with no empty
  segment

#### Scenario: A number prints through the locale formatter
- **WHEN** an option carries a number attribute and the locale is German
- **THEN** the value prints in that locale's own number format

#### Scenario: A boolean prints as its literal value
- **WHEN** an option carries a boolean attribute
- **THEN** the value prints as `true` or `false`, in every locale
