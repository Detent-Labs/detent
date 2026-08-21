## ADDED Requirements

### Requirement: The field catalog's Field tab offers a Technical control

The field catalog's Field tab SHALL offer a Technical checkbox for the
selected field. It SHALL offer one for each of a group's children in the
same tab. Checking it SHALL write `technical: true`. Unchecking it SHALL delete
the `technical` key. Every other view-flag control in the studio already
follows that same convention for its own default value.

A group's child holds a value of its own, and a structural source can
write it. The compile rule and the rail's own finding both read the
flattened catalog. A control on the top-level field alone would leave
one gap. A nested field would state `technical` through the JSON view
alone.

Checking it SHALL also delete every `required` and `readonly` key that
any step's `view.fields[]` entry carries for that field. That deletion
SHALL happen in the same draft mutation. The definition contract rejects
those keys on a technical field's entry.

Every builder control that could clear one also goes away as the
developer checks the box. The strip omits them, the matrix cell disables
them, the row offers no bulk badge. Without the clearing pass, a stale
key would block the publish. The JSON view would be the only route back
to it. The pass SHALL walk every step, not only the steps the field
matrix currently draws.

Unchecking SHALL write no `required` or `readonly` key back. The pass
records no prior state, so an uncheck cannot restore an authored
`required: true` or `readonly: true` the check deleted. Restoring a
default-valued key instead would move `definitionHash` under a change
that alters no behaviour. Restoring an authored one is not possible.

Checking Technical SHALL need a confirmation before the clearing
pass runs. The confirmation SHALL name the count of `required` and
`readonly` keys the pass will delete. Declining it SHALL leave the
draft as it stands, with no `technical` key written. Checking
Technical on a field carrying no such key SHALL run no confirmation.

A field of `type: "group"` SHALL disable the control, at any nesting
depth. The definition contract rejects `technical: true` on a group
field. Offering the control there would only invite a rejected publish.

#### Scenario: Checking Technical writes the key

- **WHEN** the developer checks Technical on a non-group field in the
  field catalog
- **THEN** that field's `technical` key becomes `true`

#### Scenario: Checking Technical clears the field's stale flag keys

- **WHEN** one step's view entry for a field carries `required: true`
- **AND** another step's entry for it carries `readonly: false`
- **AND** the developer checks Technical on that field
- **THEN** neither entry carries a `required` or a `readonly` key
- **AND** the draft publishes

#### Scenario: Unchecking Technical deletes the key

- **WHEN** the developer unchecks Technical on a field already carrying
  `technical: true`
- **THEN** that field carries no `technical` key
- **AND** no view entry regains a `required` or `readonly` key

#### Scenario: A group's child offers the control

- **WHEN** the field catalog's Field tab draws the recursive field row
  for a field nested inside the selected `type: "group"` field
- **THEN** that row offers the Technical checkbox

#### Scenario: A group field disables the Technical control

- **WHEN** the developer selects a field of `type: "group"` in the field
  catalog
- **THEN** the field catalog disables the Technical checkbox

#### Scenario: Checking Technical confirms the keys it will delete

- **WHEN** the developer checks Technical on a field whose view entries
  carry three `required` or `readonly` keys across the draft's steps
- **THEN** the field catalog asks for a confirmation naming that count
  of keys
- **AND** declining it leaves every one of those keys in place, and
  writes no `technical` key

#### Scenario: A field with no stale key confirms nothing

- **WHEN** the developer checks Technical on a field no view entry
  carries a `required` or `readonly` key for
- **THEN** the field catalog asks for no confirmation

### Requirement: The field matrix marks a technical field's row header

Each row header in the field matrix SHALL carry a marker when its field
declares `technical: true`. The marker stays separate from a cell's own
`visible`, `required`, `readonly` and flagged-cell markers. It names a
fact about the field, not about any one cell.

#### Scenario: A technical field's row carries the marker

- **WHEN** the field matrix draws a row for a field declaring
  `technical: true`
- **THEN** that row header carries the technical-field marker

#### Scenario: A non-technical field's row carries no marker

- **WHEN** the field matrix draws a row for a field declaring no
  `technical` key
- **THEN** that row header carries no technical-field marker

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

### Requirement: The panels screen's field matrix toolbar explains its marks with a legend

This requirement covers the panels screen's field matrix only. See
"The canvas dock's Field matrix tab carries no toolbar or bulk
badges" below.

The toolbar SHALL carry a legend. The legend SHALL explain six marks:

- a bulk badge sets the whole column or row it sits on
- a cell with no key written reads the engine's own default
- what the CEL stamp marks
- what a blank cell's dash means
- what the flagged-cell marker means
- what the technical-field row-header marker means

#### Scenario: The legend is visible without further interaction

- **WHEN** the developer opens the field matrix
- **THEN** the toolbar's legend is visible, with no click or hover
  needed to reveal it

### Requirement: The field matrix's rail entry counts view entries and view findings

The panels screen's index rail SHALL show the field matrix's entity
count. That count is the total number of view entries across every
step in the draft. A live cell represents one of that same total.

This is the matrix's analogue of two other counts. The Fields view
counts catalog rows. The Contract view counts outcomes.

The field matrix's issue count SHALL equal the number of open findings
carrying the `view` source over the whole draft. Those are the findings
the `studio-checks-rail` capability's rail groups under that name.
Since this change, that set holds one finding anchored on a field
rather than a cell: an unwritten technical field. The count therefore
over-reports by one per such field, with nothing to find in the grid.
The field catalog's own badge, which counts by entity type, surfaces
that finding correctly.

The count SHALL NOT come from the step entity type. A per-step view
finding shares that entity type with every other per-step issue in the
draft.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the developer opens the field matrix on a draft with 54 view
  entries across its steps
- **THEN** the rail's Field matrix entry shows 54 as its entity count

#### Scenario: The issue count reflects only view-source findings

- **WHEN** the draft carries one `checkViewFlags` finding and several
  unrelated issues on the same steps, from other sources
- **THEN** the rail's Field matrix entry shows an issue count of 1, not
  a count including the unrelated issues

#### Scenario: An unwritten technical field raises the matrix issue count

- **WHEN** the draft carries one unwritten-technical-field finding and
  no other `view`-source finding
- **THEN** the rail's Field matrix entry shows an issue count of 1

### Requirement: The Fields and Data sources views take the area's field rule

<!-- antislop: allow synonym-rotation -->
Both views SHALL render their editors under the design language's field
rule. The rule `.steps-panel label` states it in the area today. A
label SHALL sit above its control. A `key` and a `type` SHALL print in
mono, because the engine matches both exactly. A hairline SHALL divide
rail rows, and a rule SHALL sit under a view's heading. No corner SHALL
take a radius.

<!-- antislop: allow synonym-rotation -->
The Fields view SHALL edit one field through three tabs, in order:
Field, Values, Rules. The field's checks (`IssueList`) SHALL show
once, above the tab set, so an issue stays visible whatever tab is
open.

The tab set SHALL edit the selected TOP-LEVEL field alone. A group
field's children SHALL render inside the Field tab through the area's
existing flat, recursive field row. They SHALL carry no tab set of
their own. Nesting a tab set inside a tab set would let an issue on a
child hide behind a tab. That is exactly what a field's own
unconsolidated checks did before this change.

The Field tab SHALL hold the key, the label, the description and the
type picker. It SHALL also hold the Technical control and the
translation status. It SHALL further hold a group field's children,
the developer view, the preview and the usage list. The Values tab
SHALL hold the options, the data source and the column mapping. The
Rules tab SHALL hold the condition and the field's validation rules.

All three tab panels SHALL stay mounted while a field stays selected.
Switching a tab SHALL reveal and hide them, rather than mount them.
This is the rule the four views take one level up. It holds here for
the same reason. The developer view holds a half-typed config in
component state. Each builder holds an incomplete row the draft does
not carry.

The type picker SHALL list the ten base field types under friendly
names, each with a short note. It SHALL write the raw `baseFieldType`
value to the draft. It SHALL offer no type the contract does not
carry, and SHALL keep the custom plugin envelope.

Each field SHALL list its translation status: the base locale marked,
every other used locale with its missing count. Adding a language
SHALL stay draft-scoped in the content-locale switcher.

"How it will look" SHALL preview the field through the shared form
component, read-only. Every previewed entry's `readonly` SHALL read
`true`, and the preview's container SHALL carry `inert`.

The preview runs over a synthesized single-field view. For a group
field it synthesizes the group's own entry, plus one entry per
descendant. That reaches every depth, not only the group's immediate
children.

A group holding a group SHALL preview both levels. That is the
grouping the shared form component itself applies. The synthesis
SHALL also carry the sample values in the shape that component reads
them, keyed by field id.

A dataSource-backed field SHALL preview with no option list. The
draft carries no resolved rows for one. The row stating so SHALL name
that the field resolves at runtime. An author previews what a
participant gets.

"Used in" SHALL list every step whose view references the field, with
the modes those references set. A "Show on the canvas" control on a
row SHALL return to the canvas with that step preselected.

"Only ask this when" is a third condition-builder site, alongside the
path guard and the view-override sites `studio-condition-builder`
already names. It SHALL read the `visible` overrides of every step
view that references the field. When those views disagree, the row
SHALL state that plainly. A `visible` override is `boolean` or an
expression. The row edits expressions alone. A referencing view holding
a literal SHALL therefore count as a disagreement, and the row SHALL
name it.

When no step view references the field, the row SHALL show disabled.
It SHALL state that no step asks for it yet.

The row's operand picker SHALL withhold `child.*`. The row writes one
expression across steps of mixed type, and a `visible` override admits
`child` on a subprocess step alone.

Updating the condition SHALL write the same override to every
referencing view, and SHALL name the write before it happens. Where a
referencing view holds a literal, the notice SHALL name that step.
Clearing the condition SHALL drop the `visible` key from every
referencing view. It SHALL name that scope before it happens, on the
same terms a write does. The field SHALL NOT store a field-level
condition.

#### Scenario: A field editor states its labels above its controls

- **WHEN** the developer opens the Fields view on any field
- **THEN** each label sits above its own control, and no label sits
  beside one

#### Scenario: A key prints in mono

- **WHEN** the developer opens the Fields view on any field
- **THEN** the field's key and its type print in the mono face

#### Scenario: The type picker writes a raw type

- **WHEN** the developer chooses "Choice" in the type picker
- **THEN** the draft's field type reads `select`, and the definition
  serializes unchanged

#### Scenario: The preview shows one field, read-only

- **WHEN** the developer opens a field's preview
- **THEN** the shared form component shows that field with sample
  values
- **AND** none of the preview's controls take keyboard or pointer
  interaction

#### Scenario: A group field previews its group and its children

- **WHEN** the developer opens the preview on a group field carrying
  two children
- **THEN** the shared form component draws the group and both children
  inside it

#### Scenario: A tab switch keeps a half-typed developer view

- **WHEN** the developer types a config the developer view cannot parse
  yet, switches to the Rules tab, and switches back
- **THEN** the typed text is still in the input

#### Scenario: Used in lists steps and modes

- **WHEN** a field's ref appears in two step views, one with
  `required` and one with `readonly`
- **THEN** the usage list names both steps and both modes

#### Scenario: A condition writes every referencing view

- **WHEN** the developer sets "Only ask this when" on a field that
  two step views reference
- **THEN** both views carry the same `visible` override, and the row
  named both steps before the write

#### Scenario: Clearing the condition names its scope

- **WHEN** the developer clears "Only ask this when" on a field that
  two step views reference
- **THEN** the row named both steps before the clear, and neither view
  carries a `visible` key afterwards

#### Scenario: The condition row names diverging views

- **WHEN** one referencing view carries a different `visible`
  override than the others
- **THEN** the condition row says so and names the differing step

#### Scenario: A literal override counts as a disagreement

- **WHEN** one referencing view carries `visible: false` and another
  carries an expression
- **THEN** the condition row says the views disagree and names the step
  holding the literal
- **AND** the write notice names that step too

#### Scenario: The condition row offers no child operand

- **WHEN** the developer opens "Only ask this when" on a field a
  subprocess step's view references
- **THEN** the operand picker offers the catalog and the instance and
  actor context, and it offers no `child.outcome` or `child.data` entry

#### Scenario: An unreferenced field disables the condition row

- **WHEN** the developer opens "Only ask this when" on a field no step
  view references
- **THEN** the row shows disabled and states that no step asks for
  the field yet
