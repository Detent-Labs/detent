## REMOVED Requirements

### Requirement: The Fields and Data sources views take the area's field rule

**Reason**: The requirement's whole shape rested on the three tabs (Field,
Values, Rules). This change replaces the tab set with a definition half and
an effect half. Every rule the requirement stated about a tab has no tab left
to name.

**Migration**: The rules that still hold move to the requirements this change
adds. Their substance does not change. Each row names the rule, then its new
home.

- The design-language rule → "Both process-wide field views take the area's
  field rule".
- The composition → "The Fields view divides into a definition half and an
  effect half".
- The default, the preview and the translation badge → "The Fields view's
  definition half states values, a default and a preview".
- The usage list and the condition → "The Fields view's effect half states
  usage, a condition and requiredness".
- The type, format and control pickers → "The field catalog picks a named
  field kind".

No rule goes without a successor.

## RENAMED Requirements

- FROM: `### Requirement: The field catalog's Field tab offers a Technical control`
- TO: `### Requirement: The field catalog's definition half offers a Technical control`

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- Why: `edit` names the route; a change names a draft mutation. -->
### Requirement: The panels screen is a routed sub-state of the edit screen

The four process-wide views SHALL sit on a routed screen, not behind a
dialog. The path SHALL read `/processes/:id/edit/panels/:view`. Here
`:view` is one of `fields`, `dataSources`, `contract` or `matrix`.

That path SHALL be a sub-state of the `edit` route. It rides as an
optional field on the same route object, the shape `formStepId` already
takes. The `studio-form-editor` capability routes its own screen that
way.

An unrecognized `:view` SHALL fall back to the edit screen's own
canvas. The routing table already answers an unrecognized path with the
process list, and this is that rule one level down.

The screen SHALL lay out two columns, in order: an index rail and the
open view. The checks rail SHALL dock its one-line summary at the
screen's bottom edge instead of standing in a third column. See the
`studio-checks-rail` capability for what the rail shows here.

The panels screen SHALL replace the canvas while it is open. It SHALL
offer one control back to it.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `panel` and
`formStepId` matches. Choosing a "Show on the canvas" control SHALL
navigate back to the canvas with that step preselected. The canvas
SHALL read the target whenever it changes, not only once on mount.
Navigating there from an already-mounted panels screen therefore still
selects the step.

Once read, the screen SHALL replace that history entry with the plain
`edit` route. It SHALL NOT leave the step target addressable. The
browser's Back control therefore still returns to the panels screen
the navigation came from, per `unified-shell`'s navigation
requirement.

The two columns SHALL fill the height the screen's header rows leave.
They SHALL stop above the docked summary, and above the floor the canvas
layout uses. A taller window therefore shows taller columns, and no
empty band sits below them. This is the rule `studio-canvas` states for the canvas edit
screen, and the panels screen stands in the same well.

#### Scenario: The columns fill a tall window

- **WHEN** the developer opens the panels screen on a window taller
  than the floor
- **THEN** the two columns reach the docked summary, and no empty band
  sits below them

#### Scenario: A short window holds the floor

- **WHEN** the developer opens the panels screen on a window shorter
  than the floor
- **THEN** the columns hold that floor and the page scrolls

#### Scenario: The screen stands no checks column

- **WHEN** the developer opens the panels screen
- **THEN** two columns stand beside each other, and the checks summary
  sits docked at the screen's bottom edge

#### Scenario: A view has its own address

- **WHEN** the developer opens the Data sources view
- **THEN** the address bar reads that view's path, and loading that
  path directly opens the same view

#### Scenario: A reload keeps the open view

- **WHEN** the developer reloads the browser on the Contract view
- **THEN** the screen reopens on the Contract view, not on the canvas

#### Scenario: Back leaves the screen rather than the process

<!-- antislop: allow synonym-rotation -->
<!-- Why: the `edit` route is a route name. A change is a draft
     mutation. The two words name different things here. -->
- **WHEN** the developer reaches the panels screen from the canvas and
  presses the browser's Back control
- **THEN** the canvas returns, and the draft keeps every change

#### Scenario: Show on the canvas preselects a step

- **WHEN** the developer chooses "Show on the canvas" on a used-in row
  of the Fields view
- **THEN** the canvas returns and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the developer loads `/processes/:id/edit/panels/nonsense`
- **THEN** the edit screen's canvas renders, and the screen reports no
  issue

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

A field entry SHALL carry a control that moves the field into a group
and out of it. The move requirement below states the gesture, its
keyboard equivalent and what the move writes. A data source entry
SHALL carry no such control, since a data source nests under nothing.

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

The Fields rail entry SHALL name a field by its resolved label alone, on
one line. The field's kind name and the issue mark SHALL sit beside it.
The row SHALL NOT print the field's key. The key stays in the definition
half's "What this field asks" zone, once an author selects that field.
The engine's own exact-match value already lives there.

The kind name SHALL come from the same table the kind picker reads. A
row naming the base type while the picker beside it names the kind would
give one field two vocabularies. The row therefore reads "Date" where
the picker reads "Date".

The rail SHALL keep the fallback name it shows today. It SHALL trigger
on an EMPTY RESOLVED LABEL rather than an empty key. The label is the
row's primary text now. A field carrying a key but no label needs the
fallback exactly as an empty-key field did before.

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

#### Scenario: A field entry offers the move control

- **WHEN** the developer opens the Fields view on a draft carrying a
  group field and a top-level field
- **THEN** each field entry carries a move control, and no data source
  entry carries one

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

#### Scenario: The Fields rail row shows no key

- **WHEN** the developer opens the Fields view on a draft whose fields
  each carry a `key`
- **THEN** every rail row shows the resolved label, the kind name and
  any issue mark
- **AND** no row prints a `key`

#### Scenario: The rail row and the picker name one kind

- **WHEN** the developer selects a `{type: "string", format: "date"}`
  field
- **THEN** the rail row and the kind picker both name that field's kind,
  with the same word

### Requirement: The field catalog's definition half offers a Technical control

The field catalog's definition half SHALL offer a Technical checkbox for
the selected field. It SHALL offer one for each of a group's children in
the same half. Checking it SHALL write `technical: true`. Unchecking it SHALL delete
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

- **WHEN** the field catalog's definition half draws the recursive field row
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

### Requirement: A live cell edits its own view entry inline

Each live cell's `visible`, `required` and `readonly` controls SHALL
each be a plain boolean checkbox. The matrix SHALL offer no
boolean-or-CEL switch.

CEL authoring for `required` and `readonly` happens only on the
field's own strip, `studio-form-editor`'s "Developer view" disclosure.
CEL authoring for `visible` happens there too, or on the field
catalog's "Only ask this when" row. That row writes the
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

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
Where no other source in the draft, **guaranteed to be written before
this cell's own step is submitted**, writes a live cell's field, its
`required` and `readonly` checkboxes SHALL gate each other. Checking
`required` SHALL disable `readonly`, while `readonly` does not already
read `true`. Checking `readonly` SHALL disable `required`, while
`required` does not already read `true`. "No other source, guaranteed
before this step" means none of these already write the field:

<!-- antislop: allow run-ons sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- an action's `output`, where the action sits on a step that
  **dominates** this cell's own step (every path from `initialStep` to
  this cell's step passes through the action's step), or on this
  cell's own step at `onEntry`, or on this cell's own step's timer
  `onFire` declaring a `targetPath`
- a subprocess's `outputMapping`, on a step that dominates this cell's
  own step
- a field's `columnMapping`
- a `contract.inputFields` entry
- another editable view entry (`visible !== false`, `readonly !==
  true`) for the same field, on a step that dominates this cell's own
  step

<!-- antislop: allow sentence-length passive-voice run-ons em-dash -->
<!-- Why: copied byte for byte from the live requirement. -->
A step dominating another is the same relation the compile pass's
`definition-contract` check (`checkUnsatisfiableRequiredReadonly`) now
uses. The two SHALL share one dominance computation over the draft's
`workflow.steps`, so neither can disagree with the other about which
step guarantees a value by the time a given step is submitted. A step
editable only on a step that does NOT dominate this cell's own step —
reachable solely after it, or only via a different branch — does NOT
count, and gating stays engaged.

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
possible on the field catalog's condition row.

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

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** the developer checks a live cell's `required` box
- **AND** an action output, a subprocess output mapping, a column
  mapping, a contract input field, or another editable view entry for
  the same field on a step that dominates this cell's own step already
  writes that field
- **THEN** that cell's `readonly` checkbox stays enabled

#### Scenario: A field editable only on a non-dominating step keeps gating engaged

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** the developer checks the first step's live cell for a
  field's `required` box
- **AND** the field's only other editable placement is on a step
  reachable only after this first step, or only via a different branch
- **THEN** that cell's `readonly` checkbox disables

#### Scenario: An own-step post-gate output does not clear gating

<!-- antislop: allow sentence-length em-dash passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** the developer checks a live cell's `required` box
- **AND** the field's only other writer is an action's `output` on the
  cell's own step at `onExit`, `onPath`, or `onCancel`
- **THEN** that cell's `readonly` checkbox still disables — an own-step
  post-gate output fires after the submission gate, so it does not
  count as a source that writes the field before this step is
  submitted

#### Scenario: An entry already carrying both flags stays editable

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** a live cell already carries `required: true` and
  `readonly: true`, on a field nothing else in the draft, guaranteed
  before that cell's own step, writes
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

## ADDED Requirements

### Requirement: Both process-wide field views take the area's field rule

<!-- antislop: allow synonym-rotation -->
<!-- Why: carried from the live requirement, with the mono rule scoped to the key. -->
Both views SHALL render their editors under the design language's field
rule. The rule `.steps-panel label` states it in the area today. A
label SHALL sit above its control. A `key` SHALL print in mono, because
the engine matches it exactly. A hairline SHALL divide rail rows, and a
rule SHALL sit under a view's heading. No corner SHALL take a radius.

#### Scenario: A field editor states its labels above its controls

- **WHEN** the developer opens the Fields view on any field
- **THEN** each label sits above its own control, and no label sits
  beside one

#### Scenario: A key prints in mono

- **WHEN** the developer opens the Fields view on any field
- **THEN** the field's key prints in the mono face

#### Scenario: The Data sources view takes the same rule

- **WHEN** the developer opens the Data sources view on any data source
- **THEN** each label sits above its own control, a hairline divides the
  rail rows, and no corner takes a radius

### Requirement: The Fields view divides into a definition half and an effect half

The Fields view SHALL edit one field through two halves under one
heading. The definition half comes first, the effect half second. The
view SHALL carry no tab set.

The definition half says what the field is. It SHALL hold five zones. Their
order reads "What this field asks", "What kind of field", "Where values
come from", "Default value", "Validation". Each zone SHALL sit under its
own heading, with a rule between it and its neighbour.

"What this field asks" holds the label, the description and the key.
"What kind of field" holds the kind picker and the Technical control.
"Where values come from" holds the data source and the options.

The effect half says where the field acts in the process. It SHALL hold
four zones, in this order: "Used in", "Only ask this when", "Ask for
this" and "Column mapping". The same heading and rule treatment holds.

"Used in" lists every step whose view references the field, with the
modes those references set. "Only ask this when" holds the condition.
"Ask for this" holds the requiredness.

Neither half SHALL sit behind a disclosure. Both SHALL show as the view
opens. A closed disclosure over the usage list is what this change
removes. Returning one would undo the change.

A change in the definition half SHALL tint the affected row in the
effect half. That tint SHALL be the only motion the two halves carry.

#### Scenario: The view draws two halves and no tab set

- **WHEN** the developer opens the Fields view on any field
- **THEN** the definition half and the effect half both show, side by
  side under one heading
- **AND** no tab set renders

#### Scenario: A definition change tints its effect row

- **WHEN** the developer changes the label of a field two step views
  reference
- **THEN** both rows for those steps tint in the effect half

### Requirement: A field's checks stand at the zone each one belongs to

The Fields view SHALL place a check on the selected field at the zone
the check names. A check on the key stands in "What this field asks". A
check on an option stands in "Where values come from". A check on a
validation rule stands in "Validation".

A check the view cannot place SHALL stand at the top of the definition
half. No check SHALL go unshown for want of a matching zone.

Placement SHALL read the check's own location in the body. A check
carries that location today. The studio's issue model drops it, so this
rule needs the model to carry it through. The `studio-app` capability
states no shape for that model. What it states is the outcome: two
checks on one field, naming two zones, stand apart.

A group's child rows SHALL keep their own check list. A child row is not
the selected field, and the zones describe the selected field alone. The
child row's list SHALL show the child's own checks, as it does today.

The view SHALL carry no consolidated check list of its own. The
draft-wide roll-up and the publish gate sit in the docked summary the
`studio-checks-rail` capability states.

A zone holding a check SHALL take the refusal tone at its own heading.
An author scanning the halves then sees which zone is wrong, with
nothing to open.

#### Scenario: A key check stands at the key's zone

- **WHEN** the selected field's key breaks the identifier grammar
- **THEN** the check shows inside "What this field asks", and that
  zone's heading takes the refusal tone

#### Scenario: An unplaceable check stands at the top

- **WHEN** the selected field carries a check naming no zone the view
  draws
- **THEN** the check shows at the top of the definition half

#### Scenario: The view carries no consolidated list

- **WHEN** the developer opens the Fields view on a field carrying two
  checks in two zones
- **THEN** each check shows at its own zone, and no list gathers both
  in one place

#### Scenario: A group's child row keeps its own list

- **WHEN** the developer selects a group field whose child carries a
  check
- **THEN** that child's row shows the check in its own list, and the
  group's zones show the group's own checks

### Requirement: The effect half states its own empty state

The effect half SHALL show an empty state for as long as no step view
references the selected field. It SHALL say that no step asks for the
field yet.

It SHALL offer the route from there to a step view. That route SHALL
reach the canvas with a step preselected, on the terms the panels
screen's own step-target rule states.

The empty state SHALL take the empty tone, never the refusal tone. A
field no step asks for yet is an unfinished draft, not a broken one.

#### Scenario: An unused field draws the empty state

- **WHEN** the developer selects a field no step view references
- **THEN** the effect half says that no step asks for the field yet
- **AND** it offers the route to a step view, in the empty tone

#### Scenario: The empty state clears when a step references the field

- **WHEN** a step view gains a reference to the selected field
- **THEN** the effect half lists that step, and the empty state goes

### Requirement: The Fields view's definition half states values, a default and a preview

The two halves SHALL edit the selected TOP-LEVEL field alone. A group
field's children SHALL render inside the definition half through the
area's existing flat, recursive field row. They SHALL carry no halves
of their own.

Translation status SHALL show as a badge beside the label input. The
badge SHALL name the current locale's missing count. The field SHALL
carry no separate translation-status list. Adding a language SHALL stay
draft-scoped in the content-locale switcher.

"How it will look" SHALL sit in the definition half, inside a collapsed
`<details>` disclosure. It SHALL start closed. The developer view SHALL
keep its own existing, separate `<details>` disclosure, untouched by
this change. A group field's children SHALL stay outside any
disclosure.

Remove field SHALL sit below a rule at the definition half's end. It
SHALL read as the half's least frequent action.

Every zone SHALL stay mounted while a field stays selected. A
disclosure SHALL keep its own open state for as long as the same field
stays selected. Each builder holds an incomplete row the draft does not
carry. The developer view holds a half-typed config in component state.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, rewrapped so no code span breaks across a line. -->
The Default value zone SHALL offer a literal input matching the field's
type and its declared format. For a field carrying static `options`
that input SHALL be a `<select>` bound to those options, or the
multi-value equivalent when the field's type is `list`.
For a `string` field declaring a `format` it SHALL be that format's own
native input.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
Either control SHALL offer no option when the field is
`dataSource`-bound, since the draft carries no resolved rows for one.
That is the same carve-out named below for the preview. The CEL toggle
SHALL still work there. A field declaring `format: "person"` and
neither `options` nor `dataSource` SHALL get the identical carve-out,
whether its type is `string` or `list`: the draft resolves no
`allowedGroups`-sourced people list either, since that resolution needs
a live database read the draft editor does not have. The CEL toggle
still works there too.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
The note the zone shows in the person case SHALL name the people list,
not a data source. The existing note names a data source by hand, and
this field declares none; an author reading it would learn the wrong
thing about their own draft.

For a `file` field the whole Default value zone SHALL show disabled. It
SHALL state that the type accepts no default here. This mirrors "Only
ask this when" 's own disabled state for a field no step view
references.

For a `group` field the whole Default value zone SHALL also show
disabled. It SHALL state that a group's own default is never read. A
group carries no slot of its own in the flat data payload. A literal
or CEL default written there would silently never apply.

Every other type gets a link-styled toggle. It SHALL switch the zone
to a raw CEL text input for an expression default. This mirrors the
toggle affordance the condition zone already uses. The zone SHALL NOT
mount the guard-shaped condition-builder component. A default is a
value, not a boolean. It needs no comparison-row builder.

Writing through the literal input SHALL set the field's `default` key
to that literal value. Writing through the CEL input SHALL set it to `{
lang: "cel", src }`. Clearing either input SHALL remove the `default`
key.

"How it will look" SHALL preview the field through the shared form
component, read-only, inside its disclosure. Every previewed entry's
`readonly` SHALL read `true`, and the preview's container SHALL carry
`inert`.

The preview runs over a synthesized single-field view. For a group
field it synthesizes the group's own entry, plus one entry per
descendant. That reaches every depth, not only the group's immediate
children.

A group holding a group SHALL preview both levels. That is the
grouping the shared form component itself applies. The synthesis
SHALL also carry the sample values in the shape that component reads
them, keyed by field id.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
A dataSource-backed field SHALL preview with no option list. The
draft carries no resolved rows for one. The row stating so SHALL name
that the field resolves at runtime. An author previews what a
participant gets. A field declaring `format: "person"` and neither
`options` nor `dataSource` SHALL preview the same way, for the
identical reason: the draft cannot reach the live `allowedGroups`
expansion either. That field SHALL get its own row wording, naming the
people list rather than a data source it does not declare.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, with its em-dash rewritten as two sentences. -->
The preview's sample value SHALL match the shape the field's own type
takes. A `format` narrows the value domain, so a formatted field
previews that format's sample rather than its type's. A `{type:
"list"}` field holds an array whatever its format, so its sample SHALL
be the format's sample inside an array. A scalar there would draw a
multi-select with nothing selected, since the shared form component
reads a non-array value as an empty selection.

#### Scenario: A group's children render without halves of their own

- **WHEN** the developer selects a `group` field carrying two children
- **THEN** both children render as recursive field rows inside the
  definition half
- **AND** neither child draws a definition half of its own

#### Scenario: Translation status shows as a badge

- **WHEN** the studio's `contentLocale` is `de`, and a field's label
  carries a base-locale value but no `de` value
- **THEN** a badge beside the label input names its missing count for
  the active content locale
- **AND** no separate translation-status list renders
- **AND** the badge names no locale of its own. The content-locale
  switcher already names `de` once, in the toolbar

#### Scenario: A disclosure survives a selection that returns

- **WHEN** the developer opens the preview disclosure, selects another
  field, and selects the first field again
- **THEN** the preview disclosure state follows the rule the view
  states, and no half remounts

#### Scenario: Remove field sits below a rule

- **WHEN** the developer opens the Fields view on any field
- **THEN** Remove field is the definition half's last control, below a
  rule that separates it from every other control

#### Scenario: The definition half shows its zones ruled apart

- **WHEN** the developer opens the Fields view on any field
- **THEN** the five zone headings show, in the order the requirement
  names
- **AND** a rule sits between each zone and its neighbour

#### Scenario: A literal default writes the field's raw value

- **WHEN** the developer types `100` into a Number field's Default
  value input, with the CEL toggle off
- **THEN** the draft's field carries `default: 100`

#### Scenario: A CEL default writes an expression

- **WHEN** the developer switches the Default value zone to CEL and
  types `data.subtotal * 1.1`
- **THEN** the draft's field carries `default: { lang: "cel", src:
  "data.subtotal * 1.1" }`

#### Scenario: Clearing the default drops the key

- **WHEN** the developer clears a field's Default value input, whether
  literal or CEL
- **THEN** the draft's field carries no `default` key

#### Scenario: A literal default on a Choice field uses its own options

- **WHEN** the developer chooses one of a `string` field's own
  `options` in its Default value zone, with the CEL toggle off
- **THEN** the draft's field carries `default` set to that option's
  value

#### Scenario: A dataSource-bound field's default offers no option list

- **WHEN** the developer opens the Default value zone on a
  `dataSource`-bound `string` field
- **THEN** the literal control offers no option, and the CEL toggle
  still lets the developer write an expression default

#### Scenario: A bare person field's default offers no option list

- **WHEN** the developer opens the Default value zone on a `{type:
  "string", format: "person"}` field declaring neither `options` nor
  `dataSource`
- **THEN** the literal control offers no option, and the CEL toggle
  still lets the developer write an expression default
- **AND** the note names the people list, not a data source

#### Scenario: A bare person list's default offers no checkbox group

- **WHEN** the developer opens the Default value zone on a `{type:
  "list", format: "person"}` field declaring neither `options` nor
  `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the literal control offers no option, rather than a checkbox
  group over an empty option set, and the CEL toggle still lets the
  developer write an expression default

#### Scenario: The Default value zone disables for a reference or file field

- **WHEN** the developer opens the Fields view on a `file` field
- **THEN** the Default value zone shows disabled, and states that the
  type accepts no default here

#### Scenario: A formatted string field's default uses that format's input

- **WHEN** the developer opens the Default value zone on a
  `{type: "string", format: "date"}` field, with the CEL toggle off
- **THEN** the literal input is a native date input

#### Scenario: The Default value zone disables for a group field

- **WHEN** the developer opens the Fields view on a `group` field
- **THEN** the Default value zone shows disabled, and states that a
  group's own default is never read

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

#### Scenario: A bare person field previews with no option list

- **WHEN** the developer opens the preview on a `{type: "string",
  format: "person"}` field declaring neither `options` nor `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the preview shows no option list, and the row states that
  the field's people list resolves at runtime, naming no data source

#### Scenario: A person list previews an array sample

- **WHEN** the developer opens the preview on a `{type: "list", format:
  "person"}` field
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the synthesized sample value is an array holding the person
  format's own sample, not that sample as a bare scalar
- **AND** the `{type: "string"}` twin still previews the scalar

### Requirement: The Fields view's effect half states usage, a condition and requiredness

"Column mapping" SHALL show in the effect half only when the field's
data source is mappable, per the existing `showsColumnMapping` rule.
Its absence draws no rule of its own. It sits in the effect half
because a column mapping writes into other fields. That is effect, not
definition.

"Used in" SHALL list every step whose view references the field, with
the modes those references set. A "Show on the canvas" control on a row
SHALL return to the canvas with that step preselected.

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

"Ask for this" SHALL read and write the `required` override of every
step view that references the field. The catalog declares no `required`
key of its own, so this control writes the view and never the field.
That is the definition contract's own rule, and this control does not
bend it.

When those views disagree, the row SHALL state that plainly and name
the differing step. Updating SHALL name the write before it happens,
on the same terms the condition row takes. A technical field SHALL show
the row disabled, since `technical` already forces `required: false` on
every step. A field no step view references SHALL show it disabled too.

#### Scenario: A mappable field shows Column mapping in the effect half

- **WHEN** the developer opens the Fields view on a field whose data
  source is mappable
- **THEN** "Column mapping" shows in the effect half, ruled apart from
  its neighbour

#### Scenario: An unmappable field shows no Column mapping zone

- **WHEN** the developer opens the Fields view on a field whose data
  source is not mappable
- **THEN** no "Column mapping" heading renders, and its neighbour draws
  no rule below it for a zone that isn't there

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

#### Scenario: Ask for this writes every referencing view

- **WHEN** the developer turns "Ask for this" on for a field that two
  step views reference
- **THEN** both views carry `required: true`, and the row named both
  steps before the write

#### Scenario: Ask for this names disagreeing views

- **WHEN** one referencing view carries `required: true` and another
  carries no `required` key
- **THEN** the row says the views disagree and names the differing step

#### Scenario: A technical field disables Ask for this

- **WHEN** the developer selects a field carrying `technical: true`
- **THEN** "Ask for this" shows disabled, and the draft's view entries
  keep no `required` key

### Requirement: A field moves into a group and out of it from the catalog rail

The catalog rail SHALL move a field into a group field and out of it,
in place. The move SHALL neither remove the group nor rebuild it. It
SHALL neither remove the moved field nor rebuild it.

The move SHALL write one thing: the field's place in the draft's field
array. The field SHALL keep its `id`, its `key` and every other key it
carries. No CEL expression, no view entry and no column mapping SHALL
change.

That holds because a group carries no entry in the flat data payload,
and `FieldDef.key` is unique across every depth. A leaf field takes a
flat address through its own key, whatever group it sits in. Views and
column mappings reference the `id`. The `definition-contract` capability
states both rules, and this requirement rests on them rather than
restating them.

A pointer SHALL move the field by dragging its rail entry. The keyboard
SHALL move the same field from the same entry, per
`spa-accessibility`'s in-list reordering requirement. Both gestures
SHALL reach one write.

The two gestures SHALL reach the same set of destinations. A drop names
its target by the row it lands on, so it reaches every group. The
keyboard's control SHALL therefore name every group too, and the top
level beside them. A control offering one direction fails this rule. It
reaches the nearest group alone. Every other group then needs a pointer.

A move may nest a field below the rail's own two-level indentation cap.
The rail SHALL then draw that field at the cap. The draft's own field
tree SHALL keep whatever depth the move produces.
That split is the rail-rendering rule the panels screen already states.

A move SHALL keep the moved field selected. The view SHALL keep showing
that field's own two halves.

#### Scenario: A field moves into a group with a pointer

- **WHEN** the developer drags a top-level field's rail entry onto a
  group field's entry
- **THEN** the draft carries that field inside the group's `fields`
  array, and the group keeps its own `id` and `key`

#### Scenario: A field moves out of a group with the keyboard

- **WHEN** the developer focuses a group child's rail entry and presses
  the documented move keystroke
- **THEN** the draft carries that field at the top level, and the
  group's remaining children keep their order

#### Scenario: The keyboard reaches every group the pointer reaches

- **WHEN** the developer moves a top-level field with the keyboard, on a
  draft carrying two group fields
- **THEN** the move control names both groups and the top level
- **AND** the field reaches whichever group the developer picks

#### Scenario: A move rewrites no reference

- **WHEN** the developer moves a field that two step views reference
  and one column mapping targets
- **THEN** both view entries and the column mapping still resolve, and
  neither carries a changed `id`

#### Scenario: A move keeps the key

- **WHEN** the developer moves a field whose `key` is `amount` into a
  group
- **THEN** the field's `key` still reads `amount`, and every CEL
  expression naming `data.amount` still resolves

#### Scenario: The moved field stays selected

- **WHEN** the developer moves the selected field into a group
- **THEN** the view still shows that field's definition half and its
  effect half

### Requirement: An empty field catalog offers a start state

The Fields view SHALL show a start state when the draft carries no
field at all. That state SHALL replace both halves, since neither has a
field to describe.

The start state SHALL do more than report the count. It SHALL name what
a field is for in this process. It SHALL carry the control that adds the
first field. That control SHALL be the same call the rail's Add entry
makes.

The start state SHALL take the empty tone. A draft with no field yet is
a new draft, not a broken one.

The state SHALL go as soon as the draft carries one field. The view
SHALL then select that field and show its two halves.

#### Scenario: A fresh draft shows the start state

- **WHEN** the developer opens the Fields view on a draft carrying no
  field
- **THEN** the view shows the start state instead of the two halves
- **AND** it carries a control that adds the first field

#### Scenario: Adding the first field leaves the start state

- **WHEN** the developer chooses the start state's add control
- **THEN** the draft carries one field, the view selects it, and it
  shows that field's definition half and effect half

#### Scenario: The start state takes the empty tone

- **WHEN** the developer opens the Fields view on a draft carrying no
  field
- **THEN** the start state carries no refusal tone and no issue mark

### Requirement: The field catalog picks a named field kind

The field catalog SHALL offer one picker naming a field kind. A kind
names, in one entry, the `type`, the `format` and the `control` a field
declares. The catalog SHALL NOT ask an author to pick those three
separately.

The kind picker SHALL read its entries from a named table the engine
package exports beside `ALLOWED_BY_TYPE`. The studio SHALL reach that
table over the engine package's `exports` map, the same boundary it
already uses for `ALLOWED_BY_TYPE`. The studio SHALL declare no table
of its own. A second table in the browser package would drift from the
engine's, and the drift would first show at publish.

Choosing a kind SHALL write the raw `type`, `format` and `control`
values that entry names. It SHALL drop a key the entry does not name.
The serialized definition SHALL carry exactly the keys it carries
today. This change adds no key to the definition contract.

Every entry in the table SHALL name a `{type, format, control}` triple
the publish-time format-and-control check accepts. A table entry the
check would reject is unpublishable, so it may not exist.

Changing the kind SHALL name what it drops before it happens, on the
terms `droppedByTypeChange` already states for a type change. An
author changing kind on a field carrying an incompatible `format` or
`control` SHALL see that drop named first.

A field the table names no kind for SHALL keep an escape route. The
picker SHALL offer the plugin envelope. The JSON view SHALL stay the
route for any triple the table omits.

#### Scenario: The picker names a kind, not three members

- **WHEN** the developer opens the kind picker on any field
- **THEN** each entry names one kind, and the view offers no separate
  format picker and no separate control picker

#### Scenario: Choosing a kind writes the raw members

- **WHEN** the developer picks the kind naming `{type: "string",
  format: "date"}`
- **THEN** the draft's field carries `type: "string"` and `format:
  "date"`, and it carries no `control` key

#### Scenario: Changing the kind names the drop

- **WHEN** the developer changes a `{type: "string", format: "date"}`
  field to a kind naming `{type: "number"}`
- **THEN** the studio names the drop before it happens, and the draft's
  field carries no `format` key afterwards

#### Scenario: Every table entry publishes

- **WHEN** a definition declares a field for each entry the table names
- **THEN** the publish-time format-and-control check accepts every one
  of them

#### Scenario: A plugin-typed field keeps its envelope

- **WHEN** the developer opens the kind picker on a field carrying a
  plugin type
- **THEN** the picker offers the plugin envelope, and choosing it keeps
  the field's own `{type, config}` shape

#### Scenario: The definition serializes unchanged

- **WHEN** the developer sets every field in a draft through the kind
  picker and publishes
- **THEN** the serialized body carries the same keys the same draft
  carried before this change, and its `definitionHash` matches
