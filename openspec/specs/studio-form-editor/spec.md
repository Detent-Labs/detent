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
