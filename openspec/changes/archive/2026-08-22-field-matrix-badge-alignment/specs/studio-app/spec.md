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

Every `required` and `readonly` bulk badge SHALL treat a technical
field's cell as gated, unconditionally. This holds on a column header
and on a row header alike. This matches a cell that already carries
the flag's opposite. The definition contract rejects either key on a
technical field's view entry. A bulk badge SHALL NOT write one there,
even where the column's other, non-technical rows are eligible.

Where every eligible cell already carries the flag's non-default
value, the badge SHALL turn that flag off across those cells. It
turns the flag on otherwise.

A column or row with no live cell SHALL carry no bulk toggle badge.

The matrix SHALL NOT show a single badge whose own eligible cell set is
empty. Gating a cell only stops the write. It leaves the button in
place. A button that answers no click reads as a broken control.

This rule widens the live-cell rule above, from the whole badge group to
one badge. It covers a technical field's row with no second exclusion
mechanism. `visible` keeps a non-empty eligible set there. That badge
stays, and the other two go. The rule also removes a badge from a row
whose cells the studio gates for any other reason.

A column header's `visible`/`required`/`readonly` badges SHALL sit in
three fixed positions, one per flag, in that order. Those positions
SHALL match the fixed positions the same three flags hold in the
column's own cells below. A badge can be absent because its eligible
set is empty. Its position SHALL stay empty then, rather than let the
remaining badges shift into it.

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
  with at least one live cell
- **THEN** that row header offers no `required` or `readonly` toggle
  badge
- **AND** it still offers the `visible` toggle badge

#### Scenario: A row already gated on every cell offers no bulk badge either

- **WHEN** every live cell for one field already carries `required:
  true`, on a field nothing else in the draft writes
- **AND** no cell's field declares `technical: true`
- **THEN** that row header offers no `required` toggle badge

#### Scenario: A column header with only one eligible badge still aligns with its column's checkboxes

- **WHEN** every one of a column's live cells is a technical field
- **AND** `visible` stays eligible there, while `required` and
  `readonly` have no eligible cell
- **THEN** that column header shows only the `visible` badge
- **AND** the `visible` badge sits in the same fixed position a
  `visible` checkbox holds in that column's cells
- **AND** the badge does not shift toward where `required` or
  `readonly` would otherwise sit
