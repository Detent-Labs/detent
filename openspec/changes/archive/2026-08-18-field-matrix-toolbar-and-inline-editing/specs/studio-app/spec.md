## MODIFIED Requirements

### Requirement: The field matrix lists every catalog field against every workflow step

The field matrix view SHALL draw a grid. Its rows are the field
catalog, depth-first flattened in catalog order: a group field
immediately followed by its own children. Its columns are
`workflow.steps`, in array order. The grid SHALL include every catalog
field and every step. This holds whether or not a given step's view
references a given field.

Each cell SHALL draw in one of three states:

- **Hatched**, where the column's step declares no `view` at all. Every
  cell in that column SHALL draw hatched, regardless of the row.
- **Blank**, where the step declares a `view` and that view's `fields`
  carries no entry referencing the row's field.
- **Live**, where such an entry exists. A live cell SHALL show
  independent `visible`, `required` and `readonly` controls. Each
  control SHALL show that entry's own resolved value. Where a flag
  carries a CEL expression instead, its control gives way to a CEL
  stamp. That stamp SHALL show the expression's source.

#### Scenario: The grid covers the whole catalog and the whole step list

- **WHEN** the developer opens the field matrix on a draft with N
  catalog fields and M workflow steps
- **THEN** the grid draws N rows and M columns, independent of how many
  view entries exist

#### Scenario: A group field heads its own children

- **WHEN** the field catalog declares a group field with nested fields
- **THEN** the group's row sits immediately above its children's rows,
  in the same order the field catalog panel lists them

#### Scenario: A step with no view hatches its whole column

- **WHEN** a workflow step declares no `view`
- **THEN** every cell in that step's column draws hatched, for every
  field row

#### Scenario: An unreferenced field on a view-bearing step draws blank

- **WHEN** a workflow step declares a `view` whose `fields` carries no
  entry for a given catalog field
- **THEN** that field's cell in that step's column draws blank

#### Scenario: A referenced field draws live with its flags summarized

- **WHEN** a workflow step's view carries an entry referencing a
  catalog field
- **THEN** that cell draws live
- **AND** it shows one control per flag, each at the entry's resolved
  `visible`, `required` and `readonly` value

### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- Why: the toolbar's Discard control drops every unsaved change. The
     panel's Remove control drops one entity. Two separate controls,
     each keeping its own name. -->
The panels screen SHALL carry no Save control. Every change an author
makes on it SHALL write straight into the in-browser draft. That is how
the panels write today. The screen's own Save, Discard and Publish
toolbar SHALL remain the only thing that persists.

Leaving the screen SHALL discard nothing. The screen SHALL state that
plainly, so leaving never reads as a cancel.

A panel's own unsubmitted input SHALL survive a switch between views.
The contract panel holds a half-typed outcome name in component state.
The data sources panel fetches its list keys on mount. The field matrix
holds its selected cell in component state. All four views SHALL
therefore stay mounted for as long as the panels screen is open.
Switching a view SHALL reveal and hide them, rather than mount them.

An index rail SHALL list the four views. Each entry SHALL carry two
numbers, and they SHALL read as different things. The entity count says
how many fields, data sources, outcomes or live cells the view holds.
The issue count says how many of them are wrong. Only the issue count
takes the refusal tone. An entry SHALL carry no issue count when the
view holds no issue.

For the Fields view and for the Data sources view the rail SHALL also
list that view's own entities and an Add entry. Choosing an entity SHALL
select it. The view SHALL render that one entity's editor. The Add entry
SHALL add an entity, through the call the panel's own add control makes.
A group field's children indent one level under it.

Contract holds a single editor, so its rail entry SHALL carry no
sub-list. The field matrix draws a grid, so its entry SHALL carry none
either.

The rail SHALL render a sub-list only under the open view. Two
sub-lists at once fill the column.

A group field SHALL keep one recursive editor. Choosing a child in the
rail SHALL select the parent group and scroll the child into view inside
that editor.

A selection SHALL live in component state and SHALL take no address of
its own. The screen SHALL select the first entity on mount. It SHALL
select the added entity after an Add.
<!-- antislop: allow synonym-rotation -->
<!-- Why: the panel's Remove control drops one entity. The toolbar's
     Discard control drops every unsaved change. The two are separate
     controls, so neither word may stand in for the other. -->
It SHALL select the neighbour after a Remove. Switching to another view
and back SHALL keep the selection the first view held.

Each entity entry SHALL carry its own issue mark, separate from the
view entry's issue count. One entity at a time otherwise hides a broken
entity behind whichever entry an author has open.

The rail SHALL mark the open view with `aria-current`. A rail entry
switches a view rather than disclosing adjacent content, so it SHALL
NOT carry `aria-expanded`.

The rail SHALL cap indentation at two levels. A group field's children
indent once. A field nested deeper SHALL take its own top-level rail
entry rather than a deeper indent. This is a rail-rendering rule only:
the draft's own field tree SHALL keep whatever depth it declares.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the developer adds a field on the screen and then returns to
  the canvas
- **THEN** the draft still carries that field, and the screen's toolbar
  still reports unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the developer types an outcome name in the Contract view,
  switches to Fields without adding it, then switches back
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the developer moves roving focus to a live cell in the
  Field matrix view and activates it
- **AND** the developer switches to Contract, then switches back
- **THEN** the same cell still holds roving focus, and it is still
  activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the developer inspects the open screen
- **THEN** it carries no Save control, and it states that it keeps
  every change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a
  contract
- **THEN** the rail's Fields entry reads three, its Data sources entry
  reads two, and its Contract entry carries no sub-list

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a
  validation issue
- **THEN** the rail's Fields entry reads three for its entity count and
  one for its issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the rail's Data sources entry reads two and shows no issue
  count

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry, not a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the developer chooses the
  second in the rail
- **THEN** the Fields view renders that field's editor, and it renders
  neither of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the developer chooses
  the second in the rail
- **THEN** the Data sources view renders that data source's editor, and
  it renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the developer opens the Data sources view on a draft that
  carries both fields and data sources
- **THEN** the rail lists the data sources under that entry, and it
  lists no field under the Fields entry

#### Scenario: A group child selects its group

- **WHEN** the developer chooses a group field's child in the rail
- **THEN** the view renders the group's own recursive editor, and it
  scrolls the child into view inside that editor

#### Scenario: The Fields rail adds a field

- **WHEN** the developer chooses the rail's Add entry under Fields
- **THEN** the draft carries one more field, the rail lists it, and the
  view renders that new field

#### Scenario: Removing a field selects its neighbour

- **WHEN** the developer removes the selected field from a draft that
  carries three
- **THEN** the view renders a neighbouring field, and it reports no
  empty selection

#### Scenario: A reload selects the first entity

- **WHEN** the developer reloads the browser on the Fields view
- **THEN** the view renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the developer chooses the rail's Add entry under Data sources
- **THEN** the draft carries one more data source, the rail lists it, and
  the view renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the developer removes the selected data source from a draft
  that carries three
- **THEN** the view renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the developer reloads the browser on the Data sources view
- **THEN** the view renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the
  developer has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has
  a `label` carrying the base-locale value but no `de` value
- **THEN** the screen's Fields view shows the missing-translation
  warning next to that field's label input

## REMOVED Requirements

### Requirement: Selecting a live cell opens one flag editor for that (step, field) pair

**Reason**: The below-grid editor let an author change only one
(step, field) pair at a time. The field matrix now edits every live
cell inline, through that cell's own controls. It also offers bulk
row/column toggles alongside them.

**Migration**: An author changes a cell's `visible`, `required` or
`readonly` value directly inside that cell. No separate editor region
opens or closes.

## ADDED Requirements

### Requirement: A live cell edits its own view entry inline

Each live cell's `visible`, `required` and `readonly` controls SHALL
each be a boolean-or-CEL control, matching `studio-form-editor`'s own
strip. Each SHALL start from the entry's own resolved value: an absent
key reads the engine's own default, not `false`. Changing a control
SHALL write to that entry's key immediately, through the same `setFlag`
primitive `studio-form-editor` already uses. It SHALL clear the key on
a return to its default.

Where a live cell's own `visible` resolves to a literal `false`, that
cell's `required` and `readonly` controls SHALL disable. That is the
same gating the field matrix applied through its below-grid editor
before this change.

#### Scenario: Changing a cell's control writes the same entry the form editor writes

- **WHEN** the developer changes a live cell's `visible`, `required` or
  `readonly` control
- **THEN** the underlying step's view entry for that field updates
  immediately, in the in-browser draft, without a Save control

#### Scenario: A control returning to its default clears the key

- **WHEN** the developer sets a live cell's control back to the
  engine's own default for that flag
- **THEN** the corresponding key is absent from the view entry. It does
  not carry the default value instead

#### Scenario: Turning visible off disables the other two controls

- **WHEN** the developer sets a live cell's `visible` control to
  literal `false`
- **THEN** that cell's `required` and `readonly` controls disable, and
  their keys clear from the entry

#### Scenario: A hatched or blank cell offers no control

- **WHEN** the developer inspects a hatched cell or a blank cell
- **THEN** neither cell offers a `visible`, `required` or `readonly`
  control

### Requirement: Column headers name the step and flag steps with no view

Each column header SHALL show the step's `key` alongside its resolved
label. Where a step declares no `view` at all, its column header SHALL
carry an explicit note stating so. That column also draws hatched.

#### Scenario: A column header shows the step's key and label

- **WHEN** the developer opens the field matrix
- **THEN** every column header shows that step's `key` and its
  resolved label

#### Scenario: A step with no view carries a note in its own header

- **WHEN** a workflow step declares no `view`
- **THEN** that step's column header carries a note stating it
  declares no view

### Requirement: Row headers name the field and its type

Each row header SHALL show the field's `key` alongside its `type`.

#### Scenario: A row header shows the field's key and type

- **WHEN** the developer opens the field matrix
- **THEN** every row header shows that field's `key` and its `type`

### Requirement: Column and row headers offer bulk flag toggles on the panels screen

This requirement covers the panels screen's field matrix only. The
canvas dock's Field matrix tab carries no bulk toggle badge. The
requirement below, "The canvas dock's Field matrix tab carries no
toolbar or bulk badges," states that half.

Each column header and each row header SHALL offer `visible`,
`required` and `readonly` toggle badges. This holds wherever that
column or row carries at least one live cell. A badge SHALL flip
every live, non-CEL cell in that column or row. A `required` or
`readonly` badge
SHALL skip any cell whose own `visible` resolves to `false`.

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

### Requirement: The panels screen's field matrix toolbar filters inert columns and reports coverage

This requirement covers the panels screen's field matrix only. See
"The canvas dock's Field matrix tab carries no toolbar or bulk
badges" below.

The field matrix SHALL offer a toolbar above the grid. The toolbar
SHALL carry a toggle that hides every step with no `view` at all from
the grid, when engaged. The toggle SHALL affect only the grid's
columns. It SHALL leave every row in place.

The toolbar SHALL also report one live count line. That line SHALL
state four numbers:

- the number of declared view entries
- the field count
- the count of steps the grid currently draws
- the number of cells among those steps that carry no entry

#### Scenario: Hiding inert columns removes steps with no view

- **WHEN** the developer engages the "Hide inert columns" toggle on a
  draft where 3 of 13 steps declare no view
- **THEN** the grid draws 10 columns, and none of them belongs to a
  step with no view

#### Scenario: The toggle leaves every row in place

- **WHEN** the developer engages the "Hide inert columns" toggle
- **THEN** the grid still draws every catalog field as a row

#### Scenario: The count line reflects the currently drawn columns

- **WHEN** a draft carries 54 view entries, 22 fields and 13 steps, of
  which 3 declare no view
- **AND** the developer engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 view entries, 22 fields, 10 steps,
  and 166 cells the visible steps do not declare

### Requirement: The panels screen's field matrix toolbar explains its marks with a legend

This requirement covers the panels screen's field matrix only. See
"The canvas dock's Field matrix tab carries no toolbar or bulk
badges" below.

The toolbar SHALL carry a legend. The legend SHALL explain five marks:

- a bulk badge sets the whole column or row it sits on
- a cell with no key written reads the engine's own default
- what the CEL stamp marks
- what a blank cell's dash means
- what the flagged-cell marker means

#### Scenario: The legend is visible without further interaction

- **WHEN** the developer opens the field matrix
- **THEN** the toolbar's legend is visible, with no click or hover
  needed to reveal it

### Requirement: The canvas dock's Field matrix tab carries no toolbar or bulk badges

`FieldMatrixPanel` also mounts inside the canvas dock's Field matrix
tab. `studio-canvas`'s "The dock offers three tabs, one active at a
time" requirement already covers that mount. It already states the
Field matrix tab offers no filter. It already states the dock never
grows to fit its content. This requirement restates that boundary
from the field matrix's own side, for this change's toolbar, legend
and bulk badges specifically.

The dock's Field matrix tab SHALL carry no toolbar. It SHALL carry no
inert-column toggle, no count line, no legend, and no bulk row/column
toggle badge. It SHALL draw the same grid the panels screen draws,
with these matching:

- the same live-cell controls
- the same column and row header content
- the same flagged-cell marker
- the same keyboard model

#### Scenario: The dock's Field matrix tab shows no toolbar

- **WHEN** the developer opens the canvas dock's Field matrix tab
- **THEN** it shows no toolbar, no inert-column toggle, no count line,
  and no legend

#### Scenario: The dock's Field matrix tab shows no bulk badges

- **WHEN** the developer opens the canvas dock's Field matrix tab
- **THEN** none of its column or row headers carry a bulk toggle badge

#### Scenario: The dock's Field matrix tab still edits cells inline

- **WHEN** the developer opens the canvas dock's Field matrix tab
- **THEN** each live cell still shows its own `visible`, `required`
  and `readonly` controls
- **AND** editing one still writes through `setFlag`

### Requirement: A live cell marks itself when it produces a view Checks finding

A live cell whose resolved flags currently produce one of
`checkViewFlags`'s findings SHALL carry a flagged marker. That marker
stays separate from the cell's `visible`, `required` and `readonly`
controls. `checkViewFlags` reports two findings, in the same order it
checks them:

1. `required` while `visible` resolves to `false`
2. `required` together with `readonly`, where no other source in the
   draft already writes that field. None of these SHALL write it:
   - an action's `output`
   - a subprocess's `outputMapping`
   - a field's `columnMapping`
   - a `contract.inputFields` entry

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
- **AND** no other source in the draft writes that cell's field
- **THEN** that cell carries the flagged marker

#### Scenario: A required-and-readonly cell already written elsewhere carries no marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** one of these already writes that cell's field:
  - an action output
  - a subprocess output mapping
  - a data source column mapping
  - a contract input field entry
- **THEN** that cell carries no flagged marker

#### Scenario: A group field's cell carries no flagged marker

- **WHEN** a live cell's own field is a group field
- **THEN** that cell carries no flagged marker, regardless of its
  resolved `visible`, `required` and `readonly` values

#### Scenario: A cell with a CEL-driven flag carries no flagged marker

- **WHEN** any of a live cell's `visible`, `required` or `readonly`
  carries a CEL expression
- **THEN** that cell carries no flagged marker

### Requirement: The field matrix stays one tab stop; activating a cell reaches its controls

The field matrix SHALL stay one stop in the page's tab order.
`spa-accessibility`'s existing rule for this grid already requires
that. Arrow-key navigation between cells SHALL continue to move focus
exactly as it did before this change. It SHALL add no tab stop of its
own.

Enter or Space on a focused live cell SHALL activate it. An activated
cell's `visible`, `required` and `readonly` controls SHALL become the
grid's only reachable tab stops. They replace the grid's own stop
until the cell deactivates. Escape SHALL deactivate the active cell.
Moving focus away from an active cell by any other means SHALL also
deactivate it. Deactivating SHALL hand the one tab stop back to the
grid.

#### Scenario: Arrow-key navigation alone adds no tab stop

- **WHEN** the developer moves focus between cells with the arrow keys
- **THEN** the field matrix stays one stop in the page's tab order

#### Scenario: Activating a cell makes its controls reachable by Tab

- **WHEN** the developer presses Enter or Space on a focused live cell
- **THEN** that cell's `visible`, `required` and `readonly` controls
  become the only tab stops inside the field matrix

#### Scenario: Escape deactivates the cell and restores single-stop navigation

- **WHEN** the developer presses Escape on an activated cell
- **THEN** the field matrix returns to being one stop in the page's
  tab order
