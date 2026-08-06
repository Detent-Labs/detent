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
`BaseFieldType`: `string`, `number`, `date`, and `datetime` as native text/
number/date/datetime-local inputs; `boolean` as a checkbox; `select`/
`multiselect` as a `select` built from `field.options` when present —
populated for both static `FieldDef.options` fields and `dataSource`-bound
fields alike, since `getInstanceView` resolves `options` for both. A field of
type `reference`, `file`, or a `Plugin` envelope type SHALL render as a
free-text input, since no dedicated widget exists.

#### Scenario: Every BaseFieldType renders without error

- **WHEN** `form-ui` renders a step whose view includes at least one field of
  each `BaseFieldType`
- **THEN** every field renders a corresponding input with no rendering error

#### Scenario: A dataSource-bound field renders using its resolved options

- **WHEN** a `select` or `multiselect` field declares `field.dataSource`
  instead of `field.options`
- **THEN** the field renders as a `select` built from the field's resolved
  `options`, identically to a static-`options` field

### Requirement: Select and multiselect share one option-list rendering

The field renderer's `select` and `multiselect` branches SHALL build their
`<option>` elements from `field.options` through one shared expression, not
two independently-maintained copies of the same map. Every option's key,
value, and label text SHALL be unchanged from the pre-extraction editor-only
behavior.

#### Scenario: A select field renders its resolved options

- **WHEN** the renderer renders a `select` field with `field.options` set
  (statically or via a resolved `dataSource`)
- **THEN** the rendered `<select>` contains a leading blank option plus one
  `<option>` per entry in `field.options`, each keyed and valued by
  `o.value` and labeled by `firstLocalizedText(o.label) || o.value`

#### Scenario: A multiselect field renders its resolved options

- **WHEN** the renderer renders a `multiselect` field with `field.options` set
- **THEN** the rendered `<select multiple>` contains one `<option>` per entry
  in `field.options`, each keyed and valued by `o.value` and labeled by
  `firstLocalizedText(o.label) || o.value`, with no leading blank option

### Requirement: Free-text-fallback types share the plain text-input branch

A field whose type is `reference`, `file`, a plugin envelope, or the plain
`BaseFieldType` `string` SHALL render through one shared text-input branch,
not two independently-maintained copies of the same `<input type="text">`.

#### Scenario: A reference, file, or plugin-typed field renders as free text

- **WHEN** the renderer renders a field of type `reference`, `file`, or a
  `Plugin` envelope
- **THEN** it renders a plain `<input type="text">` wired to the field's
  value and `onChange`

#### Scenario: A plain string field renders the same way

- **WHEN** the renderer renders a field of type `string`
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
it, on **every** rendering branch — the seven type branches and the group
members alike. The visual required marker (`*` with a `title`) SHALL remain,
but SHALL NOT be the only signal.

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

- **WHEN** any of the rendered field types — including a group's members and
  the free-text fallback branch — is required or invalid
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
locale state of their own — resolving which locale is active is entirely the
calling application's responsibility (the editor's Player passes `en`; the
end-user app passes its active locale).

#### Scenario: A consumer's locale choice is respected

- **WHEN** a consuming application renders `form-ui` with a given `locale`
  prop
- **THEN** `LocalizedText` values resolve against that locale, with no
  locale value read from any state internal to `form-ui`

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
