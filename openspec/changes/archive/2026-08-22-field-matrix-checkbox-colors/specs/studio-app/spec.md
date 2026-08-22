## MODIFIED Requirements

### Requirement: A live cell edits its own view entry inline

Each live cell's `visible`, `required` and `readonly` controls SHALL
each be a plain boolean checkbox. The matrix SHALL offer no
boolean-or-CEL switch.

CEL authoring for `required` and `readonly` happens only on the
field's own strip, `studio-form-editor`'s "Developer view" disclosure.
CEL authoring for `visible` happens there too, or on the field
catalog's Rules tab "Only ask this when" row. That row writes the
same `visible` override across every referencing step view.

Each checkbox SHALL carry no visible label. It SHALL carry an
`aria-label` naming its own flag, so a screen reader still announces
which control it reached. The cell's three flag controls SHALL sit in
one horizontal row. That row keeps `visible`/`required`/`readonly`
order, the same order the column and row bulk-toggle badges already
use.

Each checked checkbox SHALL also carry its own color, one of three
fixed colors keyed on which flag it controls. The `visible` checkbox
SHALL use one color, `required` a second, and `readonly` a third, once
each one reads checked. An unchecked checkbox keeps the platform's own
default appearance. The native `accent-color` mechanism this requirement
relies on tints only a checked or indeterminate control, in every
evergreen browser.

Every checked live cell in the field matrix SHALL use the same three
colors, in the same `visible`/`required`/`readonly` assignment. This
holds identically on the panels screen's grid and the canvas dock's
Field matrix tab. The color adds to the checkbox's `aria-label` and its
row position; neither of those changes.

Each checkbox SHALL start from the entry's own resolved value: an
absent key reads the engine's own default, not `false`. Changing a
checkbox SHALL write to that entry's key immediately, through the same
`setFlag` primitive `studio-form-editor` already uses. It SHALL clear
the key on a return to its default.

Where a live cell's own `visible` resolves to a literal `false`, that
cell's `required` and `readonly` checkboxes SHALL disable. That is the
same gating the field matrix applied before this change.

Where no other source in the draft writes a live cell's field, its
`required` and `readonly` checkboxes SHALL gate each other. Checking
`required` SHALL disable `readonly`, while `readonly` does not already
read `true`. Checking `readonly` SHALL disable `required`, while
`required` does not already read `true`. "No other source" means none
of these already write the field:

- an action's `output`
- a subprocess's `outputMapping`
- a field's `columnMapping`
- a `contract.inputFields` entry

Where a cell already carries `required: true` and `readonly: true`
before either gate engages, neither checkbox SHALL disable. The
developer keeps a path to uncheck either one.

Where a live cell's field declares `technical: true`, that cell's
`required` and `readonly` checkboxes SHALL disable, whatever the two
keys already hold. This case overrides the both-flags escape above.
The definition contract rejects either key on a technical field's view
entry. No path to set one may stay open. The field catalog's Technical
checkbox clears any key already there.

Where a flag already carries a CEL expression, its checkbox SHALL give
way entirely to the CEL stamp. That stamp sits in the same horizontal
row as the cell's other controls. The matrix SHALL offer no control
there, boolean or otherwise. It SHALL offer no way to switch that flag
back to a boolean from inside the matrix. Editing that flag stays
possible on the field's own strip. For `visible` alone it is also
possible on the field catalog's Rules tab condition row.

A disabled checkbox that reads checked SHALL keep its flag's own
color. The same opacity rule every other disabled control in the
studio area uses dims it. A checked, gated checkbox does not lose its
color to a neutral shade. It stays identifiable by color, only
fainter.

A disabled checkbox that reads unchecked keeps the platform's own
default unchecked appearance, per this requirement's earlier rule.
That same reduced opacity still applies to it.

#### Scenario: Changing a cell's control writes the same entry the form editor writes

- **WHEN** the developer changes a live cell's `visible`, `required` or
  `readonly` checkbox
- **THEN** the underlying step's view entry for that field updates
  immediately, in the in-browser draft, without a Save control

#### Scenario: A control returning to its default clears the key

- **WHEN** the developer sets a live cell's checkbox back to the
  engine's own default for that flag
- **THEN** the corresponding key is absent from the view entry. It does
  not carry the default value instead

#### Scenario: Turning visible off disables the other two controls

- **WHEN** the developer sets a live cell's `visible` checkbox to
  literal `false`
- **THEN** that cell's `required` and `readonly` checkboxes disable,
  and their keys clear from the entry

#### Scenario: A hatched or blank cell offers no control

- **WHEN** the developer inspects a hatched cell or a blank cell
- **THEN** neither cell offers a `visible`, `required` or `readonly`
  control

#### Scenario: A boolean or undefined flag shows a checkbox only

- **WHEN** the developer opens a live cell whose `visible`, `required`
  or `readonly` value is boolean or absent
- **THEN** that flag's control is a plain checkbox
- **AND** the matrix shows no select or other control to choose CEL
  mode for that flag

#### Scenario: A CEL-carrying flag offers no checkbox

- **WHEN** a live cell's `visible`, `required` or `readonly` already
  carries a CEL expression
- **THEN** the matrix shows that flag's CEL stamp only
- **AND** the matrix offers no checkbox, select, or other way to change
  or clear that flag

#### Scenario: A cell's three controls sit in one row

- **WHEN** the developer inspects a live cell carrying two or more
  flags
- **THEN** those flags' controls sit side by side in one horizontal
  row, not stacked

#### Scenario: A checkbox with no visible label still names its flag

- **WHEN** a screen reader reaches a live cell's `visible`, `required`
  or `readonly` checkbox
- **THEN** it announces that flag's own name, through the checkbox's
  `aria-label`

#### Scenario: Checking required disables readonly on an unwritten field

- **WHEN** the developer checks a live cell's `required` box
- **AND** nothing else in the draft writes that field
- **AND** that cell's `readonly` does not already read `true`
- **THEN** that cell's `readonly` checkbox disables

#### Scenario: Checking readonly disables required on an unwritten field

- **WHEN** the developer checks a live cell's `readonly` box
- **AND** nothing else in the draft writes that field
- **AND** that cell's `required` does not already read `true`
- **THEN** that cell's `required` checkbox disables

#### Scenario: A field something else writes keeps both controls free

- **WHEN** the developer checks a live cell's `required` box
- **AND** an action output, a subprocess output mapping, a column
  mapping, or a contract input field already writes that field
- **THEN** that cell's `readonly` checkbox stays enabled

#### Scenario: An entry already carrying both flags stays editable

- **WHEN** a live cell already carries `required: true` and
  `readonly: true`, on a field nothing else in the draft writes
- **THEN** neither the `required` nor the `readonly` checkbox disables
- **AND** the developer can uncheck either one

#### Scenario: A technical field's cell disables required and readonly

- **WHEN** a live cell's field declares `technical: true`
- **THEN** that cell's `required` and `readonly` checkboxes disable
- **AND** its `visible` checkbox stays enabled

#### Scenario: Every checked checkbox for one flag shares one color

- **WHEN** the developer opens the field matrix on a draft with
  multiple live cells carrying a checked `visible` checkbox
- **THEN** every one of those checked `visible` checkboxes renders in
  the same color
- **AND** that color differs from the color every checked `required`
  checkbox and every checked `readonly` checkbox renders in

#### Scenario: A disabled, checked checkbox stays identifiable by color

- **WHEN** a live cell's `required` or `readonly` checkbox reads
  checked and then disables, through any of this requirement's gating
  rules
- **THEN** that checkbox still renders in its own flag's color
- **AND** it renders at the reduced opacity every disabled control in
  the studio area already uses

#### Scenario: A disabled, unchecked checkbox keeps the default appearance

- **WHEN** a live cell's `required` or `readonly` checkbox reads
  unchecked and then disables, through any of this requirement's
  gating rules
- **THEN** that checkbox keeps the platform's own default unchecked
  appearance, carrying no color
- **AND** it renders at the reduced opacity every disabled control in
  the studio area already uses

### Requirement: The panels screen's field matrix toolbar explains its marks with a legend

This requirement covers the panels screen's field matrix only. See
"The canvas dock's Field matrix tab carries no toolbar or bulk
badges" below.

The toolbar SHALL carry a legend. The legend SHALL explain seven marks:

- a bulk badge sets the whole column or row it sits on
- a cell with no key written reads the engine's own default
- what the CEL stamp marks
- what a blank cell's dash means
- what the flagged-cell marker means
- what the technical-field row-header marker means
- which color maps to `visible`, which to `required`, and which to
  `readonly`

The seventh entry SHALL show a swatch in each of the three checkbox
colors beside that color's flag name. A swatch SHALL use the exact
color the live cells' checkboxes use for that flag. The legend defines
no separate color of its own.

#### Scenario: The legend is visible without further interaction

- **WHEN** the developer opens the field matrix
- **THEN** the toolbar's legend is visible, with no click or hover
  needed to reveal it

#### Scenario: The legend's color entry matches the grid's own colors

- **WHEN** the developer compares the legend's `visible`/`required`/
  `readonly` swatches against a live cell's checkboxes
- **THEN** each swatch's color equals that flag's checkbox color in
  the grid
