## ADDED Requirements

### Requirement: The field catalog's Field tab offers a Technical control

The field catalog's Field tab SHALL offer a Technical checkbox for the
selected top-level field. Checking it SHALL write `technical: true`.
Unchecking it SHALL delete the `technical` key. Every other view-flag
control in the studio already follows that same convention for its own
default value.

A field of `type: "group"` SHALL disable the control. The definition
contract rejects `technical: true` on a group field. Offering the
control there would only invite a rejected publish.

#### Scenario: Checking Technical writes the key

- **WHEN** the developer checks Technical on a non-group field in the
  field catalog
- **THEN** that field's `technical` key becomes `true`

#### Scenario: Unchecking Technical deletes the key

- **WHEN** the developer unchecks Technical on a field already carrying
  `technical: true`
- **THEN** that field carries no `technical` key

#### Scenario: A group field disables the Technical control

- **WHEN** the developer selects a field of `type: "group"` in the field
  catalog
- **THEN** the field catalog disables the Technical checkbox

### Requirement: The field matrix marks a technical field's row

Each row in the field matrix SHALL carry a marker when its field declares
`technical: true`. The marker stays separate from a cell's own `visible`,
`required`, `readonly` and flagged-cell markers. It names a fact about the
field, not about any one cell.

#### Scenario: A technical field's row carries the marker

- **WHEN** the field matrix draws a row for a field declaring
  `technical: true`
- **THEN** that row carries the technical-field marker

#### Scenario: A non-technical field's row carries no marker

- **WHEN** the field matrix draws a row for a field declaring no
  `technical` key
- **THEN** that row carries no technical-field marker

## MODIFIED Requirements

### Requirement: Column and row headers offer bulk flag toggles on the panels screen

This requirement covers the panels screen's field matrix only. The
canvas dock's Field matrix tab carries no bulk toggle badge. The
requirement below, "The canvas dock's Field matrix tab carries no
toolbar or bulk badges," states that half.

Each column header and each row header SHALL offer `visible`,
`required` and `readonly` toggle badges. This holds wherever that
column or row carries at least one live cell. A badge SHALL flip
every live, non-CEL cell in that column or row.

A `required` or `readonly` badge SHALL skip any cell already gated for
that flag. Gated means one of two things: the cell's own `visible`
resolves to `false`, or the field's other flag among
`required`/`readonly` already resolves to `true`. The second case
applies only while nothing else in the draft writes that field.

A row's `required` and `readonly` badges SHALL treat every cell of a
technical field's row as gated, unconditionally. This matches a cell that
already carries the flag's opposite. The definition contract rejects
either key on a technical field's view entry. A bulk badge SHALL NOT
write one there, even where the column's other, non-technical rows are
eligible.

Where every eligible cell already carries the flag's non-default
value, the badge SHALL turn that flag off across those cells. It
turns the flag on otherwise.

A column or row with no live cell SHALL carry no bulk toggle badge.

#### Scenario: A column's bulk badge sets every eligible cell in that step

- **WHEN** the developer selects a column's `required` badge, on a
  step where none of its live, non-CEL, non-gated cells carry
  `required: true`
- **THEN** every one of those cells' `required` value becomes `true`

#### Scenario: A row's bulk badge clears every eligible cell for that field

- **WHEN** every live, non-CEL, non-gated cell for one field already
  carries `required: true`, across every step
- **AND** the developer selects that field's `required` badge
- **THEN** every one of those cells' `required` key clears

#### Scenario: A bulk badge skips CEL and gated cells

- **WHEN** the developer selects a column's or row's `required` or
  `readonly` badge
- **THEN** it does not change a cell whose relevant flag carries a CEL
  expression
- **AND** it does not change a cell whose `visible` resolves to
  `false`

#### Scenario: A column with no live cell carries no bulk badge

- **WHEN** a workflow step declares no `view`
- **THEN** that step's column header carries no bulk toggle badge

#### Scenario: A bulk badge skips a cell gated by the required/readonly rule

- **WHEN** the developer selects a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`, on a field
  nothing else in the draft writes
- **THEN** the badge does not change that cell's `readonly` value

#### Scenario: A technical field's row never receives a bulk required or readonly toggle

- **WHEN** the developer selects a column's `required` or `readonly`
  badge for a step where a technical field's cell is otherwise live
- **THEN** the badge does not change that cell's `required` or
  `readonly` value

#### Scenario: A technical field's row offers no required or readonly bulk badge of its own

- **WHEN** the field matrix draws the row header for a technical field
- **THEN** that row header offers no `required` or `readonly` toggle
  badge
