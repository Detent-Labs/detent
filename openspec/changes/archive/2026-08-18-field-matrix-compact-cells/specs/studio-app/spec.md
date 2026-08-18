## MODIFIED Requirements

### Requirement: A live cell edits its own view entry inline

Each live cell's `visible`, `required` and `readonly` controls SHALL
each be a plain boolean checkbox. The matrix SHALL offer no
boolean-or-CEL switch. CEL authoring for these three flags happens only
on the field's own strip: `studio-form-editor`'s "Developer view"
disclosure.

Each checkbox SHALL carry no visible label. It SHALL carry an
`aria-label` naming its own flag, so a screen reader still announces
which control it reached. The cell's three flag controls SHALL sit in
one horizontal row. That row keeps `visible`/`required`/`readonly`
order, the same order the column and row bulk-toggle badges already
use.

Each checkbox SHALL start from the entry's own resolved value: an
absent key reads the engine's own default, not `false`. Changing a
checkbox SHALL write to that entry's key immediately, through the same
`setFlag` primitive `studio-form-editor` already uses. It SHALL clear
the key on a return to its default.

Where a live cell's own `visible` resolves to a literal `false`, that
cell's `required` and `readonly` checkboxes SHALL disable. That is the
same gating the field matrix applied before this change.

Where a flag already carries a CEL expression, its checkbox SHALL give
way entirely to the CEL stamp. That stamp sits in the same horizontal
row as the cell's other controls. The matrix SHALL offer no control
there, boolean or otherwise. It SHALL offer no way to switch that flag
back to a boolean from inside the matrix. Editing that flag stays
possible only on the field's own strip.

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
