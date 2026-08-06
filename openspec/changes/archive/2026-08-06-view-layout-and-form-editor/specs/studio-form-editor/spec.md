## Purpose

A visual, drag-and-drop editor for a step's form layout, in the studio
area of `packages/web`. It replaces `ViewEditor`'s override-row list.
An author sees the form's actual shape while arranging it, instead of
reading an ordered list of field names.

## ADDED Requirements

### Requirement: The form editor opens as a modal over the step's view

`studio-canvas`'s section index opens the form editor for the view
entry (see the `studio-canvas` capability). The editor SHALL use a
native `<dialog>`. That is the pattern the shared editing modal (see
the `studio-app` capability) and this codebase's existing studio
dialogs already use. The platform supplies `showModal()` on mount, the
focus trap, Escape, and the backdrop.

The editor SHALL write directly to the in-browser draft as the author
works. It offers no Save button of its own. The screen's existing
Save/Discard/Publish toolbar remains the only control that persists.

#### Scenario: Opening the editor shows the current form

- **WHEN** the developer opens the form editor for a step that
  already has view fields
- **THEN** the canvas renders those fields in their current order and
  layout

#### Scenario: Closing the editor keeps every change

- **WHEN** the developer closes the form editor after moving or adding
  a field
- **THEN** the draft keeps that change, and the screen's own toolbar
  still governs Save/Discard/Publish

### Requirement: A left palette lists catalog fields not yet on the form

The editor SHALL show every catalog field not currently referenced by
the step's view in a palette on the left. Dragging a palette field
onto the canvas SHALL add it to the view, at the drop position.

A field already on the view SHALL NOT appear in the palette. Removing
a field from the canvas SHALL return it to the palette.

#### Scenario: A field leaves the palette once placed

- **WHEN** the developer drags a palette field onto the canvas
- **THEN** that field appears on the canvas and no longer appears in
  the palette

#### Scenario: Removing a field returns it to the palette

- **WHEN** the developer removes a placed field from the canvas
- **THEN** that field reappears in the palette, and the view no longer
  references it

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
