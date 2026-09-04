# studio-form-editor Specification

## Purpose
A visual, drag-and-drop editor for a step's form layout, in the studio
area of `packages/web`. It replaces `ViewEditor`'s override-row list.
An author sees the form's actual shape while arranging it, instead of
reading an ordered list of field names.
## Requirements
### Requirement: The form editor opens as a full-screen routed page over the step's view

`studio-canvas`'s selection-driven inspector opens the form editor for
the view entry (see the `studio-canvas` capability). The editor SHALL
open as a full-screen routed page, reached from the step inspector's
"Build the form" entry point. It replaces the native `<dialog>` this
capability used before.

The editor SHALL write directly to the in-browser draft as the author
works. It offers no Save button of its own. The screen's existing
Save/Discard/Publish toolbar remains the only control that persists.

Navigating away from the editor and back SHALL show the same draft
state a re-opened modal would have shown. The editor's writes already
land in the draft on every change, so it needs no separate
state-preservation step.

#### Scenario: Opening the editor shows the current form

- **WHEN** the developer opens the form editor for a step that
  already has view fields
- **THEN** the page renders those fields in their current order and
  layout

#### Scenario: Navigating away keeps every change

- **WHEN** the developer navigates away from the form editor after
  moving or adding a field
- **THEN** the draft keeps that change, and the screen's own toolbar
  still governs Save/Discard/Publish

#### Scenario: Returning to the editor shows the same state

- **WHEN** the developer navigates away from the form editor and back
  to it, without an intervening save
- **THEN** the page shows the same fields, in the same order, the
  developer left it in

### Requirement: A left palette lists catalog fields not yet on the form, and offers minting a new one

The editor SHALL show every catalog field not currently referenced by
the step's view in a palette on the left. Dragging a placed-field entry
onto the canvas SHALL add it to the view, at the drop position.

The palette SHALL also offer an "add a field to the process" section, by
type. Dragging one of those entries onto the canvas SHALL mint a new
catalog field of that type. It SHALL add that field to the view, at the
drop position, in the same move.

A field already on the view SHALL NOT appear in the palette's
place-an-existing-field list. Removing a field from the canvas SHALL
return it to that list, if the field stays in the catalog.

#### Scenario: A field leaves the palette once placed

- **WHEN** the developer drags a palette field onto the canvas
- **THEN** that field appears on the canvas and no longer appears in
  the placed-an-existing-field list

#### Scenario: Removing a field returns it to the palette

- **WHEN** the developer removes a placed field from the canvas
- **THEN** that field reappears in the palette, and the view no longer
  references it

#### Scenario: Dropping an "add a field" entry mints and places a field

- **WHEN** the developer drags a "Text" entry from the "add a field to
  the process" section onto the canvas
- **THEN** a new catalog field of type `string` exists in the draft
- **AND** that field appears on the canvas at the drop position

#### Scenario: A minted field is reachable through the field catalog too

- **WHEN** the developer mints a field through the form editor's
  palette
- **THEN** that field appears in the process's field catalog
- **AND** it appears there the same way a field minted on the panels
  screen's Fields view does

### Requirement: The canvas places fields at the view's column count, in array order

The canvas SHALL show the form at the step view's declared column
count (see the `runtime-api` and `form-ui` capabilities for `columns`
and `span`). Position on the canvas SHALL be the view array's own
order, read left to right, then down. This is the same order the
override-row list's `↑`/`↓` buttons already express.

A group field's own member fields SHALL show at the same column count
as the form around them. That matches how `form-ui` lays a group out
(see the `form-ui` capability). The editor SHALL offer no separate
column count for a group.

The canvas places view entries, not field entries alone. A note card takes
its position from the same array and answers the same order rule. Nothing
here reads a card's kind: a note occupies a slot the way a field card does.

#### Scenario: A form built before this editor loads unchanged

- **WHEN** the developer opens the editor for a view whose fields carry
  no `span` or `columns`
- **THEN** the canvas shows one column, every field full width, in the
  view array's existing order

#### Scenario: Dragging a field to a new position changes the array

- **WHEN** the developer drags a placed field to a new position on the
  canvas
- **THEN** the view array's order changes to match, left to right then
  down

#### Scenario: A note card takes its position from the same array

- **WHEN** the developer opens the editor for a view holding a field entry,
  a note and a second field entry
- **THEN** the canvas draws three cards in that order, left to right then
  down

### Requirement: The editor sets the form's own column count

A toggle above the canvas SHALL read and write the step view's
`columns`. It offers one column or two. Outside the JSON view, this is
the only control that writes `columns`. An author never has to leave
the editor to lay a form out in two columns.

Changing the toggle SHALL reflow the canvas at once. A card whose
`span` exceeds the new count SHALL show clamped, per the `form-ui`
capability's `min(span, columns)` rule. The editor SHALL NOT rewrite
that field's stored `span`. An author who returns the form to two
columns gets the spanning field back.

#### Scenario: The toggle writes the view's column count

- **WHEN** the developer sets the toggle to two columns
- **THEN** the draft's `view.columns` is `2`, and the canvas lays its
  cards out in two columns

#### Scenario: Narrowing the form clamps a spanning card without losing it

- **WHEN** a `span: 2` field sits on a two-column form and the
  developer sets the toggle to one column
- **THEN** that card renders full width at the new count, and the
  draft still records its `span` as `2`

### Requirement: Each placed field shows its overrides as marks on its card

A placed field's card SHALL mark required and readonly. It SHALL show
a CEL badge when `visible`, `required`, or `readonly` is an expression
rather than a literal. It SHALL show a dashed border when `visible`
resolves to a conditionally-hidden expression.

#### Scenario: A literal override shows as a plain mark

- **WHEN** a placed field's `required` is the literal `true`
- **THEN** its card shows a required mark with no CEL badge

#### Scenario: An expression override shows the CEL badge

- **WHEN** a placed field's `visible` is a CEL expression rather than
  a literal
- **THEN** its card shows the CEL badge, and a dashed border marking
  it conditionally hidden

### Requirement: A selected field's strip sets its overrides and span

Selecting a placed field SHALL show a strip below the canvas for that
field. The strip SHALL offer `visible`, `required`, and `readonly`.
Each is a three-way choice among `true`, `false`, and a CEL
expression. Choosing the expression option SHALL reveal an input for
that field's expression. The strip SHALL also offer `group` and
`span`.

Where the selected field's `FieldDef` declares `technical: true`, the
strip SHALL NOT offer the `required` or `readonly` controls at all. The
definition contract rejects either key on that field's view entry. A
control the author could set there would only invite a rejected publish.
`visible`, `group` and `span` stay offered unchanged.

Each control SHALL start at the value the engine resolves for an absent
key. That value is true for `visible`. It is false for `required` and for
`readonly`. `resolveFlag` (`src/runtime/api.ts`) sets those three. The
strip SHALL show what the engine does, not what the key holds.

Each control SHALL write its key only on a departure from that default.
On a return to the default, the control SHALL clear the key. A view
entry that carried no `visible` key SHALL carry none again, after a tick
and an untick.

That rule keeps `ProcessBody` still under a change that alters no
behaviour. A written `visible: true` moves `definitionHash`, and an
identical re-publish then stops being a no-op.

A `visible` of literal `false` SHALL disable the `required` and the
`readonly` control. It SHALL clear both keys. A `visible` that holds a
CEL expression SHALL leave both controls alone. Nobody can read an
expression's value without an instance.

Nothing else in the draft writes a selected field before the developer
submits its own step. When that holds, its `required` and `readonly`
controls SHALL gate each other. That is the same rule the field
matrix's live cell applies. Checking `required` SHALL disable
`readonly`, while `readonly` does not already read `true`. Checking
`readonly` SHALL disable `required`, while `required` does not already
read `true`.

"No other source, guaranteed before this step" means none of these
already write the field:

- an action's `output`, on a step whose action **dominates** the
  selected field's own step. Every path from `initialStep` to that
  step passes through the action's step.

- an action's `output` on the field's own step, set at `onEntry`.

- an action's `output` on the field's own step's timer `onFire`, when
  that timer declares a `targetPath`.

- a subprocess's `outputMapping`, on a step that dominates the
  selected field's own step.

- a field's `columnMapping`.

- a `contract.inputFields` entry.

- another editable view entry (`visible !== false`, `readonly !==
  true`) for the same field, on a step that dominates the selected
  field's own step.

A step dominating another is the same relation the compile pass's
`definition-contract` check (`checkUnsatisfiableRequiredReadonly`) and
the field matrix's live cell use. All three SHALL share one dominance
computation over the draft's `workflow.steps`. None can disagree with
the others about which step guarantees a value by the time the
developer submits a step.

A field editable only on a step that does NOT dominate the selected
field's own step does NOT count. Gating stays engaged regardless. That
non-dominating step may be reachable solely after it, or only via a
different branch.

Where a selected field already carries `required: true` and
`readonly: true` before either gate engages, neither control SHALL
disable. The developer keeps a path to uncheck either one.

#### Scenario: An absent visible key shows the field as visible

- **WHEN** the developer selects a placed field whose view entry carries
  no `visible` key
- **THEN** the strip's `visible` control reads true

#### Scenario: Returning to the default clears the key

- **WHEN** the developer sets a placed field's `visible` to false, then
  back to true
- **THEN** the view entry carries no `visible` key

#### Scenario: A departure from the default writes the key

- **WHEN** the developer sets a placed field's `visible` to false
- **THEN** the view entry carries `visible: false`

#### Scenario: An absent required key reads false

- **WHEN** the developer selects a placed field whose view entry carries
  no `required` key
- **THEN** the strip's `required` control reads false

#### Scenario: Hiding a field disables and clears its other two flags

- **WHEN** the developer sets a placed field's `visible` to false on an
  entry carrying `required: true` and `readonly: true`
- **THEN** the strip disables the `required` and `readonly` controls
- **AND** the view entry carries neither key

#### Scenario: A CEL visible leaves the other two controls alone

- **WHEN** a placed field's `visible` is a CEL expression
- **THEN** the strip leaves the `required` and `readonly` controls
  enabled

#### Scenario: Leaving the expression option restores the default, not false

- **WHEN** the developer switches a placed field's `visible` from the
  expression option to the boolean option
- **AND** that entry carries `required: true` and `readonly: true`
- **THEN** the view entry carries no `visible` key
- **AND** the `required` and `readonly` keys stay as they were

#### Scenario: Switching an override to an expression reveals the input

- **WHEN** the developer sets a selected field's `required` choice to
  the expression option
- **THEN** a CEL expression input appears in the strip for `required`

#### Scenario: Changing span changes the field's width on the canvas

- **WHEN** the developer sets a selected field's `span` to `2` on a
  `columns: 2` view
- **THEN** that field's card widens to span both columns on the canvas

#### Scenario: Checking required disables readonly on an unwritten field

- **WHEN** the developer checks `required` on a selected field
- **AND** nothing else in the draft writes that field before its own
  step
- **AND** `readonly` does not already read `true`
- **THEN** the strip's `readonly` control disables

#### Scenario: Checking readonly disables required on an unwritten field

- **WHEN** the developer checks `readonly` on a selected field
- **AND** nothing else in the draft writes that field before its own
  step
- **AND** `required` does not already read `true`
- **THEN** the strip's `required` control disables

#### Scenario: A field something else writes keeps both controls free

- **WHEN** the developer checks `required` on a selected field
- **AND** some other source already writes that field, on a step that
  dominates the selected field's own step
- **AND** that source is one the requirement above already lists
- **THEN** the strip's `readonly` control stays enabled

#### Scenario: A field editable only on a non-dominating step keeps gating engaged

- **WHEN** the developer checks `required` on a field selected on the
  process's first step
- **AND** the field's only other writer is an action output or a
  subprocess output mapping on a non-dominating step
- **AND** that non-dominating step is reachable only after this first
  step, or only via a different branch
- **THEN** the strip's `readonly` control disables

#### Scenario: An own-step post-gate output does not clear gating

- **WHEN** the developer checks `required` on a selected field
- **AND** the field's only other writer is an action's `output` on the
  field's own step at `onExit`, `onPath`, or `onCancel`
- **THEN** the strip's `readonly` control still disables. An own-step
  post-gate output fires after the submission gate. It does not count
  as a source that writes the field before the developer submits this
  step.

#### Scenario: An entry already carrying both flags stays editable

- **WHEN** the developer selects a field whose entry already carries
  `required: true` and `readonly: true`
- **AND** nothing else in the draft writes that field before its own
  step
- **THEN** neither the `required` nor the `readonly` control disables
- **AND** the developer can uncheck either one

#### Scenario: A technical field's strip omits required and readonly

- **WHEN** the developer selects a placed field whose `FieldDef` declares
  `technical: true`
- **THEN** the strip shows `visible`, `group` and `span`
- **AND** the strip shows no `required` or `readonly` control

### Requirement: A field's position is reachable by keyboard, not drag alone

Every placed field SHALL offer keyboard-operable move commands, in
addition to its drag handle. The commands are move up, move down, and
move to a chosen group. A keyboard move SHALL change the view array
the same way a drag does.

#### Scenario: A keyboard move reorders the same way a drag does

- **WHEN** the developer uses a placed field's move-up command
- **THEN** the view array's order changes exactly as it would from
  dragging that field one position up

### Requirement: A "Developer view" disclosure holds two existing CEL and JSON escape hatches

A selected field's override strip already lets `visible`, `required`,
and `readonly` fall back to a CEL expression. That escape hatch SHALL
move behind a "Developer view" disclosure on the strip. It stays
reachable; it starts collapsed.

The process-field catalog panel already lets a custom field type carry
a raw JSON textarea for its plugin envelope. The
`studio-plugin-config-form` capability does not cover this position,
per its own carve-out. That escape hatch SHALL move behind its own
"Developer view" disclosure, on the same collapsed-by-default pattern.

Neither disclosure changes what its escape hatch writes. Both match the
structure editor's own "Developer view" placement convention (see
`studio-canvas`).

#### Scenario: The override strip's CEL input starts collapsed

- **WHEN** a developer selects a placed field whose `required` override
  is already set to a CEL expression
- **THEN** the strip shows no CEL input until the developer opens its
  "Developer view" disclosure

#### Scenario: The field catalog's JSON textarea starts collapsed

- **WHEN** a developer selects a custom field type in the field catalog
  panel
- **THEN** the panel shows no JSON textarea until the developer opens
  its "Developer view" disclosure

### Requirement: An author places a note on the form canvas

The form editor SHALL offer adding a note to the step's view. A note SHALL
appear on the canvas as a card among the field cards. It sits at its own
position in the view array. The card shows the text an author gave it.

The palette lists catalog fields not yet on the form. A note belongs to no
catalog, so the editor SHALL offer it beside the palette rather than inside it.

A placed note SHALL answer the same gestures a field card answers. That
includes the keyboard route reaching a field's position without a drag.

#### Scenario: An author adds a note and positions it

- **WHEN** an author adds a note and moves it above the first field card
- **THEN** the note occupies the view array's first position, and the step's
  draft records it there

#### Scenario: A note is reachable without a drag

- **WHEN** an author moves a note using the keyboard route that moves a field
  card
- **THEN** the note changes position the same way a field card does

### Requirement: A note's strip sets its text, its span, its group and its visibility

Selecting a note SHALL open a strip that sets the note's text. It covers the
body's base locale and any other locale the body declares. The strip SHALL set
the note's `span` and its `group`. For `visible` it SHALL offer the same
condition input a field card's strip offers.

The `group` control SHALL be the one a field card's strip already carries. Two
things make it load-bearing rather than decorative. The renderer honors a
note's `group`, per the `form-ui` capability. The keyboard route the
requirement above reuses carries a move-to-group command of its own. A strip
omitting the control would leave an author a gesture they can fire and cannot
see.

The strip SHALL offer no requiredness, no readonly state and no validation. A
note carries none of those. Offering them would invite an author to expect a
value the note never holds.

#### Scenario: An author writes a note's text in the base locale

- **WHEN** an author selects a note and types its text
- **THEN** the draft records that text under the body's `baseLocale`

#### Scenario: A note's strip offers visibility and group but no requiredness

- **WHEN** an author selects a note
- **THEN** the strip shows a condition input for `visible`, a span control and
  a group control
- **AND** it shows no required, readonly or validation control

#### Scenario: An author places a note inside a group from its strip

- **WHEN** an author selects a note and picks a group field's key in its strip
- **THEN** the draft records that key as the note's `group`, and the note
  renders inside that group's container

#### Scenario: The editor reports a note missing its base-locale text

- **WHEN** a step's view holds a note whose text is empty for the body's
  `baseLocale`
- **THEN** the editor reports it before publish, rather than letting publish be
  the first place an author learns of it

### Requirement: A note marks no catalog field as used

A note SHALL appear in no field usage list. A note SHALL mark no catalog field
as used, so the palette keeps offering every field the notes sit beside.

The count of a step's configured fields lives outside the form editor, on the
Steps panel. The `studio-app` capability states its rule.

#### Scenario: A note leaves the usage list alone

- **WHEN** a step's view holds one field entry and three notes
- **THEN** that step appears in the usage list of the one field alone

#### Scenario: A note marks no catalog field as used

- **WHEN** a step's view holds notes alone
- **THEN** the palette still offers every catalog field, and the editor reports
  that step as using none

### Requirement: The form editor renders from compiled styles

`screens/FormEditorScreen.tsx` SHALL render from compiled component
styles, reading `form-ui/tokens.stylex`. The rendered result SHALL
match the previous stylesheet declaration for declaration.

The "How it will look" preview has a two-column layout. It SHALL pick
its style from a parameterized style function, keyed on the column
count. That is the same pattern `form-ui`'s own field renderer uses
for its own columns/span choice. The preview MAY still render a
`data-columns` fact on its container, for a test or another consumer
to read. No stylesheet SHALL select on it after migration.

#### Scenario: The form editor keeps its look

- **WHEN** a browser renders the form editor
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared

#### Scenario: The two-column preview switches correctly

- **WHEN** an author toggles a field group between one and two columns
- **THEN** the preview's computed grid layout matches the deleted
  stylesheet's own two-column and one-column rules
- **AND** no compiled or hand-written stylesheet rule selects on a
  `data-columns` or `data-span` attribute after the migration
