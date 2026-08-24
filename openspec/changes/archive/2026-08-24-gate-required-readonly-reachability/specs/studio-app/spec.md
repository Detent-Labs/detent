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

The draft may guarantee no other source writes a live cell's field
before the developer submits that cell's own step. Where that holds,
its `required` and `readonly` checkboxes SHALL gate each other.
Checking `required` SHALL disable `readonly`, while `readonly` does
not already read `true`. Checking `readonly` SHALL disable `required`,
while `required` does not already read `true`. "No other source,
guaranteed before this step" means none of these already write the
field:

- an action's `output`, in any of three placements:
  - the action's own step **dominates** this cell's own step (every
    path from `initialStep` to this cell's step passes through the
    action's step)
  - the action sits on this cell's own step, at `onEntry`
  - the action sits on this cell's own step's timer `onFire`,
    declaring a `targetPath`
- a subprocess's `outputMapping`, on a step that dominates this cell's
  own step
- a field's `columnMapping`
- a `contract.inputFields` entry
- another editable view entry (`visible !== false`, `readonly !==
  true`) for the same field, on a step that dominates this cell's own
  step

A step dominating another is the same relation the compile pass's
`definition-contract` check (`checkUnsatisfiableRequiredReadonly`) now
uses. The two share one dominance computation over the draft's
`workflow.steps`. Neither can disagree with the other about which step
guarantees a value before the developer submits a given step. A step
editable only on a step that does NOT dominate this cell's own step
does NOT count. That includes a step reachable solely after it, or
only via a different branch. Gating stays engaged in that case.

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
- **AND** nothing else in the draft, guaranteed before that cell's own
  step, writes that field
- **AND** that cell's `readonly` does not already read `true`
- **THEN** that cell's `readonly` checkbox disables

#### Scenario: Checking readonly disables required on an unwritten field

- **WHEN** the developer checks a live cell's `readonly` box
- **AND** nothing else in the draft, guaranteed before that cell's own
  step, writes that field
- **AND** that cell's `required` does not already read `true`
- **THEN** that cell's `required` checkbox disables

#### Scenario: A field something else writes keeps both controls free

- **WHEN** the developer checks a live cell's `required` box
- **AND** the field already has a writer on a step that dominates
  this cell's own step. That writer is one of five sources: an action
  output, a subprocess output mapping, or a column mapping. It could
  also be a contract input field or another editable view entry for
  the same field
- **THEN** that cell's `readonly` checkbox stays enabled

#### Scenario: A field editable only on a non-dominating step keeps gating engaged

- **WHEN** the developer checks the first step's live cell for a
  field's `required` box
- **AND** the field's only other editable placement sits on a
  non-dominating step. That step is reachable only after this first
  step, or only via a different branch
- **THEN** that cell's `readonly` checkbox disables

#### Scenario: An own-step post-gate output does not clear gating

- **WHEN** the developer checks a live cell's `required` box
- **AND** the field's only other writer is an action's `output` on the
  cell's own step at `onExit`, `onPath`, or `onCancel`
- **THEN** that cell's `readonly` checkbox still disables. An own-step
  post-gate output fires after the submission gate. It does not count
  as a source that writes the field before the developer submits this
  step

#### Scenario: An entry already carrying both flags stays editable

- **WHEN** a live cell already carries `required: true` and
  `readonly: true`
- **AND** nothing else in the draft, guaranteed before that cell's own
  step, writes that field
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

### Requirement: A live cell marks itself when it produces a view Checks finding

A live cell whose resolved flags currently produce one of
`checkViewFlags`'s findings SHALL carry a flagged marker. That marker
stays separate from the cell's `visible`, `required` and `readonly`
controls. `checkViewFlags` reports two findings, in the same order it
checks them:

1. `required` while `visible` resolves to `false`
2. `required` together with `readonly`. This holds where the draft
   guarantees no other source writes that field before this cell's
   step. None of these SHALL write it:
   - an action's `output` on a step that dominates this cell's own step
   - a subprocess's `outputMapping` on a step that dominates this
     cell's own step
   - a field's `columnMapping`
   - a `contract.inputFields` entry
   - another editable view entry for the same field on a step that
     dominates this cell's own step

   A step reachable only after this cell's own step does NOT dominate
   it. Nor does a step reachable only via a different branch. An
   editable placement or action output there does not clear this
   finding.

A live cell whose own field is a group field SHALL carry no flagged
marker, either way. The engine's own `checkViewFlags` function skips
a group field first, before it checks either finding.

A flag carrying a CEL expression resolves per instance. A cell with
any CEL-driven flag SHALL therefore carry no flagged marker, whatever
its other resolved values are.

#### Scenario: A required-and-hidden cell carries the marker

- **WHEN** a live cell's `required` resolves to `true` while its
  `visible` resolves to `false`
- **THEN** that cell carries the flagged marker

#### Scenario: A required-and-readonly cell with nothing else writing it carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** no other source, guaranteed before that cell's own step, in
  the draft writes that cell's field
- **THEN** that cell carries the flagged marker

#### Scenario: A required-and-readonly cell already written elsewhere carries no marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** one of these already writes that cell's field, guaranteed
  before the developer submits that cell's own step:
  - an action output on a step that dominates this cell's own step
  - a subprocess output mapping on a step that dominates this cell's
    own step
  - a data source column mapping
  - a contract input field entry
  - another editable view entry for the same field on a step that
    dominates this cell's own step
- **THEN** that cell carries no flagged marker

#### Scenario: A required-and-readonly cell written only by an own-step post-gate output still carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** the only other source naming that cell's field is an action's
  `output` on the cell's OWN step at `onExit`, `onPath`, or `onCancel`
- **THEN** that cell carries the flagged marker. An own-step post-gate
  output fires after the submission gate, so it does not clear this
  finding. The same own-step exclusion `checkUnsatisfiableRequiredReadonly`
  already applies

#### Scenario: An own-step reminder timer's output still carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** the only other source naming that cell's field is an `onFire`
  action on the cell's OWN step's timer
- **AND** that timer declares no `targetPath`
- **THEN** that cell carries the flagged marker. An own-step reminder
  timer with no `targetPath` is not guaranteed to fire before submission.
  The same own-step reminder-timer exclusion
  `checkUnsatisfiableRequiredReadonly` already applies

#### Scenario: A required-and-readonly cell written only on a non-dominating step still carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** the only other editable placement or action output for that
  field sits on a non-dominating step
- **AND** that step is reachable only after this cell's own step, or
  only via a different branch
- **THEN** that cell carries the flagged marker

#### Scenario: A group field's cell carries no flagged marker

- **WHEN** a live cell's own field is a group field
- **THEN** that cell carries no flagged marker, regardless of its
  resolved `visible`, `required` and `readonly` values

#### Scenario: A cell with a CEL-driven flag carries no flagged marker

- **WHEN** any of a live cell's `visible`, `required` or `readonly`
  carries a CEL expression
- **THEN** that cell carries no flagged marker, whatever its other
  resolved values are

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
applies only while nothing else in the draft writes that field. The
draft must guarantee that no write happens before the developer
submits that cell's own step. This is the same dominance-scoped
"written" test "A live cell edits its own view entry inline" defines.

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
- **AND** a targeted cell already carries `required: true`
- **AND** nothing else in the draft, guaranteed before that cell's own
  step, writes that field
- **THEN** the badge does not change that cell's `readonly` value

#### Scenario: A bulk badge does not skip a cell written only on a non-dominating step

- **WHEN** the developer selects a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`
- **AND** the field's only other editable placement sits on a
  non-dominating step. That step is reachable only after that cell's
  own step, or only via a different branch
- **THEN** the badge still skips that cell. The non-dominating
  placement does not make it eligible

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
  true`
- **AND** nothing else in the draft, guaranteed before each cell's own
  step, writes that field
- **AND** no cell's field declares `technical: true`
- **THEN** that row header offers no `required` toggle badge

#### Scenario: A column header with only one eligible badge still aligns with its column's checkboxes

- **WHEN** every one of a column's live cells is a technical field
- **AND** `visible` stays eligible there, while `required` and
  `readonly` have no eligible cell
- **THEN** that column header shows only the `visible` badge
- **AND** the `visible` badge sits in the same fixed position a
  `visible` checkbox holds in that column's cells
