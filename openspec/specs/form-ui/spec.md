# form-ui

## Purpose

Shared step-form rendering (`packages/form-ui`), consumed by both
the studio area of `packages/web`'s Player and the end-user app (the app area of `packages/web`) so that what
an author previews is exactly what a participant gets. Owns everything
visible *inside* a step form: field rendering per resolved `BaseFieldType`,
groups/order/required/readonly presentation, per-field validation error
display, the path-submit buttons, and their shared stylesheet. Source-only
workspace package (an `exports` map pointing at `.tsx`, no build step),
depending on `workflow-engine` for `LocalizedText`/field types but on neither
consuming app, so the dependency direction (`app → form-ui → workflow-engine`,
`studio → form-ui`) cannot invert.
## Requirements
### Requirement: form-ui is a source-only workspace package with no build step

`packages/form-ui` SHALL be a Bun workspace package whose `exports` map points
directly at its `.tsx`/`.ts` source files, the same convention the engine
package uses for its own exports — no bundling or compilation step between
editing a source file and a consumer seeing the change. It SHALL NOT depend on
`packages/web`, so the dependency direction (`web → form-ui →
workflow-engine`) cannot be inverted.

`packages/form-ui` SHALL stay its own package. It SHALL NOT move inside
`packages/web`, because both of its consumers, the app area and the studio
area's Player, must keep importing one renderer.

#### Scenario: form-ui has no application dependency

- **WHEN** `packages/form-ui`'s `package.json` dependencies are inspected
- **THEN** `packages/web` does not appear among them

#### Scenario: A source edit is visible without a build step

- **WHEN** a `.tsx` file inside `packages/form-ui` is edited
- **THEN** a consumer importing that module via the workspace `exports` map
  sees the change on its next dev-server reload, with no intermediate build
  command required

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

### Requirement: Select and multiselect share one option-list rendering

The field renderer's single-pick and multi-pick option branches SHALL build
their `<option>` elements from `field.options` through one shared expression.
Two independently-maintained copies of the same map SHALL NOT exist. Every
option's key, value, and label text SHALL match the pre-extraction editor-only
behavior.

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

#### Scenario: A reference, file, or plugin-typed field renders as free text

- **WHEN** the renderer renders a field of type `file` or a `Plugin` envelope
- **THEN** it renders a plain `<input type="text">` wired to the field's
  value and `onChange`

#### Scenario: A plain string field renders the same way

- **WHEN** the renderer renders a field of type `string` declaring no `format`
  and no `control`
- **THEN** it renders the same `<input type="text">` shape as a
  free-text-fallback field, through the same code path

### Requirement: Groups nest their member fields; required and readonly are honored

A `group` field SHALL render as a container housing the fields that carry its
key in `ResolvedViewField.group`. Fields render in the order the resolved
view array carries them (declaration order) — neither `FieldDef` nor
`ResolvedViewField` carries an `order` property, so there is no per-field
sort key to render by; a step's authored field order is what determines
render order. A resolved view field with `required` set SHALL display a
visible required marker with no client-side submission enforcement
(requiredness is validated server-side). A resolved view field with
`readonly` set SHALL render its input in a disabled state.

The container houses view entries, not field entries alone. A note entry
naming the group's key renders inside it, on the same rule. It sits at the
same position the array gives it. The two sentences about `required` and
`readonly` reach field entries alone, because a note declares neither.

#### Scenario: A group field nests its member fields

- **WHEN** a step view includes a `group` field and other fields whose
  `ResolvedViewField.group` names that group's key
- **THEN** the member fields render nested within the group's container, not
  flattened alongside it

#### Scenario: A required field displays a marker with no client-side gate

- **WHEN** a resolved view field has `required` set
- **THEN** a visible marker renders on that field, and submission is not
  blocked client-side on that field being empty

#### Scenario: A readonly field's input is disabled

- **WHEN** a resolved view field has `readonly` set
- **THEN** its input renders in a disabled state

#### Scenario: A note carrying the group's key nests beside the member fields

- **WHEN** a step view includes a `group` field, a field entry and a note
  entry
- **AND** both entries name that group's key
- **THEN** both render nested within the group's container, in the order the
  resolved view array carries them

### Requirement: Per-field validation errors attach to their matching input

`form-ui`'s `FieldForm` SHALL accept a pre-partitioned `issuesByField` map
(fieldId -> issues) as a prop and attach each entry to the input for the
field it names, rendering an inline message beside that input. `form-ui`
itself has no visibility into a `SubmissionValidationError`'s raw `issues`
array and so cannot detect or surface an issue whose `fieldId` matches no
currently rendered field — that partitioning, including surfacing an
unmatched issue (e.g. in a form-level summary), is each consumer's own
responsibility.

An issue SHALL render as a **localized message**, not as its raw `kind`
discriminator. `form-ui` already takes `locale` as a prop and holds no locale
state, so the message catalog keyed by `issue.kind` lives in `form-ui` — one
message per failure for every consumer, rather than a different one per app.
A `kind` with no catalog entry SHALL fall back to rendering the raw kind, so
that forgetting an entry degrades to today's behavior rather than failing.

The issue list SHALL be a **sibling** of the field's `<label>`, not a child of
it, and SHALL carry an `id` that the control references through
`aria-describedby`. A `<ul>` inside a `<label>` is invalid markup — `label`
permits phrasing content only — and it folds the error text into the control's
accessible name, so a screen reader announces label and error together as the
control's name every time it is focused.

#### Scenario: A validation issue displays beside its field

- **WHEN** a consumer passes an `issuesByField` map with an entry for a field
  currently rendered in the form
- **THEN** that entry renders attached to that field's input

#### Scenario: An issue reads as a sentence, not an enum

- **WHEN** an issue of kind `missing-required` or `option-not-in-list` is
  rendered
- **THEN** the user sees a localized message in the form's locale, not the
  discriminator text

#### Scenario: An unknown issue kind still renders

- **WHEN** an issue's `kind` has no entry in the catalog
- **THEN** the raw kind is rendered rather than an empty message or a crash

#### Scenario: The error text is not part of the control's name

- **WHEN** a field with issues receives focus
- **THEN** its accessible name is its label, and the issues are announced as
  its description via `aria-describedby`

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

### Requirement: Path-submit buttons render from availablePaths

`form-ui` SHALL render one submit action per entry in the view's
`availablePaths`, and submitting SHALL send only the current step's visible,
non-readonly fields keyed by `field.id`. A view with no `availablePaths` (a
wait-state with no currently-matching manual path) SHALL render the form
read-only with no submit action.

#### Scenario: Available paths render as submit actions

- **WHEN** an instance's current step view includes one or more
  `availablePaths`
- **THEN** one submit action renders per available path

#### Scenario: No available paths renders no submit action

- **WHEN** an instance's current step view has no `availablePaths`
- **THEN** the form renders read-only with no submit action

#### Scenario: Readonly fields are excluded from a submission

- **WHEN** a path is submitted from a step whose view includes a `readonly`
  field
- **THEN** the submitted data does not include that field's id

### Requirement: form-ui takes locale as a prop and holds no locale state

`form-ui`'s components SHALL accept `locale` as a prop and SHALL hold no
locale state of their own. Resolving which locale is active is entirely
the calling application's responsibility. The editor's Player passes `en`.
The end-user app passes its active locale.

`FieldForm` and `FieldInput` SHALL resolve every `LocalizedText` value
through this single `locale` prop alone. Neither component SHALL accept a
separate base-locale prop. A consumer that wants a fallback locale
resolves it before it calls `form-ui`.

<!-- antislop: allow passive-voice --><!-- Title matches the existing form-ui spec word for word, so archive keeps one cross-reference. -->
#### Scenario: A consumer's locale choice is respected

- **WHEN** a consuming application renders `form-ui` with a given `locale`
  prop
- **THEN** `LocalizedText` values resolve against that locale, with no
  locale value read from any state internal to `form-ui`

#### Scenario: form-ui exposes no separate base-locale prop

- **WHEN** a consumer renders `FieldForm` or `FieldInput`
- **THEN** the component's prop type offers no `baseLocale` prop
- **AND** `locale` is the only locale value the component accepts

### Requirement: form-ui ships one stylesheet for both consumers

`form-ui` SHALL ship the CSS for everything it renders (fields, groups,
validation errors, path buttons) as part of the package, so both the studio
area's Player and the app area CAN render forms with
identical structure and identical styling — a shared component tree without
a shared stylesheet would still let the two areas' rendering drift visually.
The stylesheet SHALL be imported once, at `packages/web/src/main.tsx`, rather
than once per consuming area: one bundle now carries both consumers, so a
second import would be the same sheet twice.

#### Scenario: The end-user app imports the shared stylesheet

- **WHEN** `packages/web`'s entry point is inspected
- **THEN** it imports `form-ui/form-ui.css`

#### Scenario: Both consumers import the same stylesheet

- **WHEN** the studio area's Player and the app area each render a step form
  via `form-ui`
- **THEN** both are styled by the same `form-ui`-provided stylesheet, not two
  independently maintained copies

### Requirement: Fields render across the view's declared column count, honoring each field's span

`FieldForm` SHALL accept `columns` (`1 | 2`, default `1`) as a prop.
It lays out its root fields in a CSS grid of that width. Each root
field's `ResolvedViewField.span` (`1 | 2`, default `1`) SHALL set how
many of those columns that field occupies.

A field never exceeds its grid. `FieldForm` SHALL clamp an effective
span to `min(span, columns)`. A `span: 2` field on a one-column grid
still renders full width, rather than overflowing.

A group field's own member fields SHALL render in a grid of the same
width as the form's `columns`. A group inside a one-column form
therefore stacks its members, exactly as
`packages/form-ui/src/FieldForm.tsx` renders a group today. A group
inside a two-column form lays its members out in two columns.

A group SHALL NOT declare a column count of its own. Inheriting the
form's count keeps every already-published form rendering as it does
today. It also adds no second configurable column count.

A group's own container SHALL occupy the form's full `columns`. A
`span` declared on a group SHALL have no effect. A group is a
container, not a leaf. It holds a grid at the form's count, and two
tracks need the room two tracks take. A group at width `1` on a
two-column form would draw those two tracks inside half a track. No
requirement here asks for that.

This is the one place `span` does not read as `min(span, columns)`.
The alternative default is `1` for a group like any other field. That
would make the member-count rule above wrong, unless the author also
set `span: 2` on every group. A default that needs a second `span` to
be correct is the wrong default.

On a one-column form the form's full width IS one column. A group
there renders exactly as it does today. The form editor SHALL NOT
offer a span control on a group's card: nothing reads the value.

`FieldForm`'s existing declaration-order rule stays the render order
within the grid. A field with no `span` and no group still renders
left to right, then wraps down. It renders exactly where the array
places it.

Below a width threshold the grid SHALL collapse to one column, whatever
`columns` declares. The threshold is the form's own comfortable measure,
not a device width. It SHALL therefore come from the grid's own
available width rather than the viewport's.

The threshold lives in `form-ui`'s own stylesheet. That is what makes it
one rule both consumers get at the same point. The `studio-player`
capability's reflow requirement rests on that shared point. A collapse
changes no field's stored `span`, and widening the container restores
the declared layout.

#### Scenario: A one-column grid is the default

- **WHEN** a consumer renders `FieldForm` with no `columns` prop
- **THEN** every root field renders in a single column, matching
  today's rendering exactly

#### Scenario: A two-column grid places fields left to right, then down

- **WHEN** a consumer renders `FieldForm` with `columns: 2` and four
  root fields, each with `span: 1`
- **THEN** the first two fields render side by side. The next two
  render side by side beneath them, in the view array's own order

#### Scenario: A spanning field takes the full grid width

- **WHEN** a root field's resolved `span` is `2` and `columns` is `2`
- **THEN** that field renders across both columns, and the field after
  it starts a new row

#### Scenario: An over-wide span clamps to the grid

- **WHEN** a root field's resolved `span` is `2` but `columns` is `1`
- **THEN** that field renders at width `1`, the same as any other
  field on that grid

#### Scenario: A group in a one-column form renders as it does today

- **WHEN** a group field renders inside a `columns: 1` grid
- **THEN** the group's own member fields stack in one column, matching
  the rendering before this change

#### Scenario: A group inherits a two-column form's width

- **WHEN** a group field renders inside a `columns: 2` grid
- **THEN** the group's own container spans both columns, and its member
  fields lay out in two columns inside it

#### Scenario: A span declared on a group is not read

- **WHEN** a group field carries `span: 1` and renders inside a
  `columns: 2` grid
- **THEN** its container still spans both columns, exactly as it does
  for a group carrying no `span` at all

#### Scenario: A narrow container collapses a two-column grid

- **WHEN** a `columns: 2` form renders in a container below the
  threshold
- **THEN** every root field renders in one column, and no field's
  stored `span` changes

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

### Requirement: A note renders as static text at its place in the view

`form-ui` SHALL render a resolved note entry as a paragraph of text, at the
position the resolved view array gives it. It SHALL resolve the note's text
through the same locale rule it applies to a field's label. The fallback is the
body's base locale.

A note SHALL render no form control, no label element and no required marker.
It is static text a participant reads, so it takes no tab stop of its own and
needs none.

A note SHALL honor `group` and `span` the way a field entry does. A note naming
a group's key renders inside that group's container. Its `span` sets how many
of the form's columns it occupies.

A note's `span` obeys the grid rules already stated. Those rules are
"Fields render across the view's declared column count, honoring each
field's span". That requirement's every clause reads over a view entry, a
note included. It covers the grid, the `min(span, columns)` clamp, and a
group's own full-width container. It needs no change of its own. A note's
`span` behaves the way a leaf field's `span` behaves.

#### Scenario: A note renders between the fields around it

- **WHEN** the resolved view carries a field entry, a note, and a second field
  entry in that order
- **THEN** the rendered form shows the note's text between the two inputs

#### Scenario: A note inside a group renders in that group's container

- **WHEN** a resolved note entry's `group` names a group field's key
- **THEN** its text renders nested within that group's container, not beside it

#### Scenario: A note renders no control and takes no tab stop

- **WHEN** a resolved view carries a note
- **THEN** the rendered note carries no input, no label element and no
  required marker
- **AND** keyboard focus moves from the field before it to the field after it

### Requirement: A submission carries no note

The value map `form-ui` builds for a submission SHALL hold keys for editable
field entries alone. A note SHALL contribute no key, wherever it sits in the
view.

This closes the defect the note exists to remove. An author who fakes a note
with a read-only string field puts a key into `data` that never held a value.

#### Scenario: Submitting a form holding a note sends the field values alone

- **WHEN** a participant submits a path from a step whose view holds two
  editable field entries and one note
- **THEN** the request body carries exactly those two field keys
