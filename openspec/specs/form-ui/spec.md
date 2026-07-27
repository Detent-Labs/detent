# form-ui

## Purpose

Shared step-form rendering (`packages/form-ui`), consumed by both the
editor's Player and the end-user app (`packages/app`) so that what an author
previews is exactly what a participant gets. Owns everything visible *inside*
a step form: field rendering per resolved `BaseFieldType`, groups/order/
required/readonly presentation, per-field validation error display, the
path-submit buttons, and their shared stylesheet. Source-only workspace
package (an `exports` map pointing at `.tsx`, no build step), depending on
`workflow-engine` for `LocalizedText`/field types but on neither consuming
app, so the dependency direction (`app → form-ui → workflow-engine`,
`editor → form-ui`) cannot invert.

## Requirements

### Requirement: form-ui is a source-only workspace package with no build step

`packages/form-ui` SHALL be a Bun workspace package whose `exports` map points
directly at its `.tsx`/`.ts` source files, the same convention the engine
package uses for its own exports — no bundling or compilation step between
editing a source file and a consumer seeing the change. It SHALL depend on
neither `packages/app` nor `packages/editor`, so the dependency direction
(`app → form-ui → workflow-engine`, `editor → form-ui`) cannot be inverted.

#### Scenario: form-ui has no application dependency

- **WHEN** `packages/form-ui`'s `package.json` dependencies are inspected
- **THEN** neither `packages/app` nor `packages/editor` appears among them

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
(fieldId -> messages) as a prop and attach each entry to the input for the
field it names, rendering an inline message beside that input. `form-ui`
itself has no visibility into a `SubmissionValidationError`'s raw `issues`
array and so cannot detect or surface an issue whose `fieldId` matches no
currently rendered field — that partitioning, including surfacing an
unmatched issue (e.g. in a form-level summary), is each consumer's own
responsibility, currently implemented independently and identically in both
`packages/app/src/screens/TaskScreen.tsx` and
`packages/editor/src/player/PlayerView.tsx` rather than shared in `form-ui`.

#### Scenario: A validation issue displays beside its field

- **WHEN** a consumer passes an `issuesByField` map with an entry for a field
  currently rendered in the form
- **THEN** that entry's message renders attached to that field's input

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
validation errors, path buttons) as part of the package, so both the editor's
Player and the end-user app CAN render forms with identical structure and
identical styling — a shared component tree without a shared stylesheet would
still let the two apps' rendering drift visually. Currently only the
end-user app imports it (`packages/app/src/main.tsx`); the editor's Player
renders the same `form-ui` component tree without importing
`form-ui/form-ui.css` anywhere in `packages/editor`, so the Player's forms
are presently unstyled — the package satisfies its half of this requirement,
the editor does not yet satisfy the other.

#### Scenario: The end-user app imports the shared stylesheet

- **WHEN** `packages/app`'s entry point is inspected
- **THEN** it imports `form-ui/form-ui.css`

#### Scenario: Both consumers import the same stylesheet

- **WHEN** `packages/editor` and `packages/app` each render a step form via
  `form-ui`
- **THEN** both import the same `form-ui`-provided stylesheet, not two
  independently maintained copies
