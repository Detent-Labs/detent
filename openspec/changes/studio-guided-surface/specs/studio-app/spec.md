## MODIFIED Requirements

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft model
(`draft/`), UI-chrome i18n, and live validation. It SHALL also carry over the
structural panels (`panels/`). These panels are steps, paths, timers, actions,
subprocess spec, view editor, field catalog, data sources, and contract.

The draft routes replace file-based persistence. `GET /drafts/:processId` loads
the draft. `PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be one tabbed process surface. The
`studio-process-tabs` capability states the tab row and its ten tabs. The canvas
stands on the Canvas tab. A steps rail and a step page stand on the Steps tab,
and the `studio-step-page` capability states both.

Seven tabs carry a process-wide subject. They are Fields, Data sources, Paths,
Forms, Field matrix, Contract and Changes. Checks takes the tenth tab. Each tab
stays reachable whether or not the author has picked a step.

The process header's `⋮` overflow menu SHALL carry `baseLocale`. This capability
requires an author to declare a non-English base locale without leaving the
process surface. No tab SHALL hold that control.

The tab row SHALL belong to the Structure surface alone. The surface SHALL stand
no tab while the JSON surface is open. Four tabs write the draft body, and the
`studio-json-view` capability requires that no draft-body-writing control stays
reachable there.

This requirement governs where the surface mounts each panel, and how an author
reaches it. What each panel validates, writes, or persists stays the same.

Every inline missing-translation warning SHALL survive the move. Six
`LocalizedTextInput` sites carry one.

- the process label, which stays on the screen
- a step's label and description, which sit in the step page's masthead
- a field's label and description, and a field option's label, which sit in the
  Fields tab

Live validation SHALL remain exactly what it is today. It runs the engine's own
publish-time chain in the browser and reports issues in place. It SHALL NOT block
saving, since a work-in-progress draft is normally invalid.

The step page's masthead SHALL carry one issue count for the open step as a
whole. That count SHALL cover the step's own issues, and the issues of its paths,
timers and actions. Here `resolveLoc` returns the deepest entity it finds. A
guard's issue therefore names the path, not the step. A count over the step's own
id alone would read zero on such a step.

Each section heading on the step page SHALL carry its own count. It counts the
issues `resolveLoc` resolves to an entity that section holds. A path's issue
counts at the paths section, and a timer's at the time-limit section. An issue
`resolveLoc` resolves to the step itself counts on the masthead alone. The
`studio-step-page` capability states the section register those counts sit in.

A tab SHALL carry one issue count for its own subject. Every count SHALL take the
same visual tone. The rest of the studio area already takes that tone for issues.

The studio's area nav SHALL offer a **Publish** action (see the `studio-publish`
capability). It calls `POST /drafts/:processId/publish` against the currently
persisted draft, not the in-browser draft state. When local changes remain
unsaved, the action SHALL prompt the author to save first. It must not publish
stale or ahead-of-server content. On success, the studio SHALL confirm the new
version number and `definitionHash`.

#### Scenario: A draft round-trips through the panels

- **WHEN** the author loads a draft, adds a step through the panels, saves
  the draft, and reloads it
- **THEN** the panels carry the new step identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** the author loads a draft, repositions a step, connects it to
  another step, then saves and reloads it
- **THEN** the Canvas tab draws the new position and path identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for the current draft
- **THEN** the surface prints the issues, keeps the save action available,
  and the save succeeds

#### Scenario: A Structure-surface link opens the panels screen

- **WHEN** the author picks one of the seven process-wide tabs
- **THEN** the surface opens that tab, and the address bar carries that
  tab's own path

#### Scenario: A link opens the panels screen with no step selected

- **WHEN** the author picks one of those tabs before selecting any step
- **THEN** the surface still opens that tab

#### Scenario: The JSON surface renders no link into the panels screen

- **WHEN** the author opens the JSON surface from the overflow menu
- **THEN** the tab row stands away, and no control on screen reaches a tab

#### Scenario: A path's issue counts on the Paths head

- **WHEN** a step's path carries a failing guard
- **THEN** the step page's paths section reads a count of one, and the
  masthead's count also reads one

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the author picks Publish in the area nav while local changes
  remain unsaved
- **THEN** the studio prompts the author to save before publishing, and does
  not call `POST /drafts/:processId/publish` until the save completes

#### Scenario: The screen confirms a successful publish

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the studio prints the returned version number and `definitionHash`

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen is a routed sub-state of the edit screen

The ten tabs SHALL sit on a routed surface, not behind a dialog. The path SHALL
read `/processes/:id/edit/:tab`. Here `:tab` is one of `canvas`, `steps`,
`fields`, `dataSources`, `paths`, `forms`, `matrix`, `contract`, `changes` or
`checks`.

That path SHALL be a sub-state of the `edit` route. It rides as an optional field
on the same route object, the shape `formStepId` already takes. The
`studio-form-editor` capability routes its own screen that way.

An unrecognized `:tab` SHALL fall back to the Canvas tab. The routing table
already answers an unrecognized path with the process list, and this is that rule
one level down.

The surface SHALL stand the tab row above one body. The body SHALL hold the open
tab alone. No rail of tab names SHALL stand beside it. The rail's one-line
summary SHALL stand in the studio's area nav, not at the surface's bottom edge.
See the `studio-checks-rail` capability for what the rail carries there.

A tab SHALL fill the body. The tab row above it SHALL keep every other tab one
click away. The surface therefore needs no control back to the canvas.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `tab` and `formStepId`
matches.

<!-- "Show on the canvas" repeats the control's own name, so the word stays. -->
<!-- antislop: allow synonym-rotation -->
Choosing a "Show on the canvas" control SHALL open the Canvas tab with that step
preselected. The Canvas tab SHALL read the target whenever it changes, not only
once on mount. Reaching it from another tab therefore still selects the step.

Once read, the surface SHALL replace that history entry with the plain `edit`
route. It SHALL NOT leave the step target addressable. The browser's Back control
therefore still returns to the tab the navigation came from, per
`unified-shell`'s navigation requirement.

The body SHALL fill the height the header rows and the tab row leave. It SHALL
stop above the floor the surface uses. A taller window therefore carries a taller
body, and no empty band sits below it.

#### Scenario: The columns fill a tall window

- **WHEN** the author opens a tab on a window taller than the floor
- **THEN** the body reaches the surface's bottom edge
- **AND** no empty band sits below it

#### Scenario: A short window holds the floor

- **WHEN** the author opens a tab on a window shorter than the floor
- **THEN** the body holds that floor and the page scrolls

#### Scenario: The screen stands no checks column

- **WHEN** the author opens a tab
- **THEN** the open tab fills the body
- **AND** the checks summary stands in the area nav, in no column of its own

#### Scenario: A view has its own address

- **WHEN** the author opens the Data sources tab
- **THEN** the address bar reads that tab's path, and loading that path
  directly opens the same tab

#### Scenario: The Changes and Paths views have addresses too

- **WHEN** the author opens the Changes tab
- **THEN** the address bar reads `/processes/:id/edit/changes`, and loading
  it directly opens the same tab

#### Scenario: A reload keeps the open view

- **WHEN** the author reloads the browser on the Contract tab
- **THEN** the surface reopens on the Contract tab, not on Canvas

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Back leaves the screen rather than the process

- **WHEN** the author reaches the Fields tab from the Canvas tab and presses
  the browser's Back control
- **THEN** the Canvas tab returns, and the draft keeps every change

#### Scenario: Show on the canvas preselects a step

- **WHEN** the author picks "Show on the canvas" on a used-in row of the
  Fields tab
- **THEN** the Canvas tab opens and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the author loads `/processes/:id/edit/nonsense`
- **THEN** the Canvas tab opens, and the surface reports no issue

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- The area nav's Discard control drops every unsaved change; a panel's Remove control drops one entity. -->
No tab SHALL carry a Save control. Every change an author makes on a tab SHALL
write straight into the in-browser draft. That is how the panels write today. The
area nav's Save and Publish controls SHALL remain the only ones that persist.

Leaving a tab SHALL discard nothing. The surface SHALL state that plainly, so
leaving a tab never reads as a discard.

A tab's own unsubmitted input SHALL survive a switch between tabs. The contract
panel holds a half-typed outcome name in component state. The data sources panel
fetches its list keys on mount. The field matrix holds its selected cell in
component state. All four tabs SHALL therefore stay mounted for as long as the
process surface is open. Switching a tab SHALL reveal and hide them, rather than
mount them.

Each of those four tabs SHALL carry two numbers, and they SHALL read as different
things. The entity count says how many fields, data sources, outcomes or live
cells the tab holds. The `studio-process-tabs` capability states which tab prints
one. The issue count says how many of them are wrong. Only the issue count takes
the refusal tone. A tab SHALL carry no issue count while its subject holds no
issue.

The Fields tab and the Data sources tab SHALL each stand an entity rail beside
the open editor. The rail SHALL list that tab's own entities, and an Add entry
too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. A group field's children indent one level under it.

A field entry SHALL carry a control that moves the field into a group and out of
it. The move requirement below states the gesture, its keyboard equivalent and
what the move writes. A data source entry SHALL carry no such control, since a
data source nests under nothing.

Contract holds a single editor, so its tab SHALL stand no entity rail. The field
matrix draws a grid, so its tab SHALL stand none either.

A tab SHALL stand its own rail alone. No tab SHALL list another tab's entities.

A group field SHALL keep one recursive editor. Choosing a child in the rail SHALL
select the parent group and scroll the child into view inside that editor.

A selection SHALL live in component state and SHALL take no address of its own.
The tab SHALL select the first entity on mount. It SHALL select the added entity
after an Add.

<!-- antislop: allow synonym-rotation -->
<!-- The panel's Remove control drops one entity; the area nav's Discard control drops every unsaved change. -->
It SHALL select the neighbour after a Remove. Switching to another tab and back
SHALL keep the selection the first tab held.

Each entity entry SHALL carry its own issue mark, separate from the tab's issue
count. One entity at a time otherwise hides a broken entity behind whichever
entry an author has open.

The rail SHALL mark the selected entity with `aria-current`. A rail entry selects
an entity rather than disclosing adjacent content, so it SHALL NOT carry
`aria-expanded`. The `studio-process-tabs` capability states the tab row's own
tab-set semantics.

The rail SHALL cap indentation at two levels. A group field's children indent
once. A field nested deeper SHALL take its own top-level rail entry rather than a
deeper indent. This is a rail-rendering rule only: the draft's own field tree
SHALL keep whatever depth it declares.

The Fields rail entry SHALL name a field by its resolved label alone, on one
line. The field's kind name and the issue mark SHALL sit beside it. The row SHALL
NOT print the field's key. The key stays in the definition half's "What this
field asks" zone, once an author selects that field. The engine's own exact-match
value already lives there.

The kind name SHALL come from the same table the kind picker reads. A row naming
the base type while the picker beside it names the kind would give one field two
vocabularies. The row therefore reads "Date" where the picker reads "Date".

The rail SHALL keep the fallback name it carries today. It SHALL trigger on an
EMPTY RESOLVED LABEL rather than an empty key. The label is the row's primary
text now. A field carrying a key but no label needs the fallback exactly as an
empty-key field did before.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the author adds a field on the Fields tab and then opens the
  Canvas tab
- **THEN** the draft still carries that field, and the area nav still reports
  unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the author types an outcome name on the Contract tab, opens the
  Fields tab without adding it, then returns
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the author moves roving focus to a live cell on the Field matrix
  tab and activates it
- **AND** the author opens the Contract tab, then returns
- **THEN** the same cell still holds roving focus, and it is still activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the author inspects an open tab
- **THEN** it carries no Save control, and it states that it keeps every
  change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a contract
- **THEN** the Fields tab reads three, the Data sources tab reads two, and
  the Contract tab stands no entity rail

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a validation
  issue
- **THEN** the Fields tab reads three for its entity count and one for its
  issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the Data sources tab reads two and carries no issue count

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry, not a third indent
  level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the author picks the second in
  the rail
- **THEN** the Fields tab renders that field's editor, and it renders neither
  of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the author picks the second
  in the rail
- **THEN** the Data sources tab renders that data source's editor, and it
  renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the author opens the Data sources tab on a draft that carries both
  fields and data sources
- **THEN** that tab's rail lists the data sources, and it lists no field

#### Scenario: A group child selects its group

- **WHEN** the author picks a group field's child in the rail
- **THEN** the tab renders the group's own recursive editor, and it scrolls
  the child into view inside that editor

#### Scenario: The Fields rail adds a field

- **WHEN** the author picks the rail's Add entry on the Fields tab
- **THEN** the draft carries one more field, the rail lists it, and the tab
  renders that new field

#### Scenario: A field entry offers the move control

- **WHEN** the author opens the Fields tab on a draft carrying a group field
  and a top-level field
- **THEN** each field entry carries a move control, and no data source entry
  carries one

#### Scenario: Removing a field selects its neighbour

- **WHEN** the author removes the selected field from a draft that carries
  three
- **THEN** the tab renders a neighbouring field, and it reports no empty
  selection

#### Scenario: A reload selects the first entity

- **WHEN** the author reloads the browser on the Fields tab
- **THEN** the tab renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the author picks the rail's Add entry on the Data sources tab
- **THEN** the draft carries one more data source, the rail lists it, and the
  tab renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the author removes the selected data source from a draft that
  carries three
- **THEN** the tab renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the author reloads the browser on the Data sources tab
- **THEN** the tab renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the author
  has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has a
  `label` carrying the base-locale value but no `de` value
- **THEN** the Fields tab carries the missing-translation warning next to
  that field's label input

#### Scenario: The Fields rail row shows no key

- **WHEN** the author opens the Fields tab on a draft whose fields each carry
  a `key`
- **THEN** every rail row carries the resolved label, the kind name and any
  issue mark
- **AND** no row prints a `key`

#### Scenario: The rail row and the picker name one kind

- **WHEN** the author selects a `{type: "string", format: "date"}` field
- **THEN** the rail row and the kind picker both name that field's kind, with
  the same word

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's Changes view shows what a publish would change

The Changes tab SHALL state the difference between the draft and the version the
draft sits on. It answers the question a publish raises.

The tab SHALL read the draft as the surface holds it, including changes the
author has not saved. The `process-version-inspection` capability's versions
screen reads the saved draft from the server instead.

Both use one difference computation. The tab SHALL pass the base version first
and the draft second. Every entry then runs from the published value toward the
draft value, the direction a publish moves.

That order decides how an entry reads. A key the draft adds reads as added, and a
key it drops reads as removed. The reverse order inverts both, and it prints a
changed entry's two values the wrong way round.

A list compares whole. The difference computation treats an array as one value. A
draft that adds one catalog field reports one changed entry over that whole list.
It reports no added entry.

<!-- The compile pass's cancel sink is the engine's own term. -->
<!-- antislop: allow synonym-rotation -->
The tab SHALL strip the compiled content from the base version's body first. The
versions screen gives that body the same treatment. The compile pass injects a
cancel sink, and no author wrote it.

A process with no base version SHALL read as a first publish. The tab says so,
and it carries no difference.

An empty difference SHALL read as such. The tab says the draft matches its base
version.

The Changes tab SHALL print the difference's entry count as its own count.

#### Scenario: A draft over a published version shows its difference

- **WHEN** the author opens the Changes tab on a draft of a published process
- **THEN** the tab states what the draft changes against its base version

#### Scenario: An unsaved edit reaches the view

- **WHEN** the author renames a step and opens the Changes tab without saving
- **THEN** the tab lists that rename
- **AND** the entry's first value is the published label, and its second is
  the unsaved one

#### Scenario: A publish moves the base and the view follows it

- **WHEN** the author publishes the draft from the area nav and returns to
  the Changes tab
- **THEN** the tab reads the newly published version, with no reload
- **AND** it reports that the draft matches that version

#### Scenario: A never-published process reads as a first publish

- **WHEN** the author opens the Changes tab on a process with no base version
- **THEN** the tab says the publish would be the first one, and it carries no
  difference

#### Scenario: A draft matching its base reads as no difference

- **WHEN** the author opens the Changes tab on a draft nobody has changed
  since it seeded from its base version
- **THEN** the tab says the draft matches that version

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's Paths view lists every path in the process

The Paths tab SHALL carry one row per path across the whole draft. The five
columns are source step, trigger, priority, guard and target. A canvas draws a
path as a line, and a line hides those five values.

Rows SHALL follow the draft's own order. The steps order the rows first, and each
step's own path order orders the rows inside it.

A path with no guard SHALL read as such, and so SHALL a path with no priority.
The tab states each absence rather than leaving a blank cell unexplained. A guard
is independent of the trigger. A manual path can carry one. That guard decides
whether the participant may take the path, so the tab SHALL carry it.

A draft with no path at all SHALL carry an empty state naming that fact.

The row derivation SHALL live in a pure module with `bun:test` coverage, the
convention `packages/web/src/areas/app/screens/inboxLogic.ts` sets. It takes the
draft's steps and returns the rows. The test needs no DOM and no rendering.

The Paths tab SHALL print the path count as its own count.

#### Scenario: Every path takes a row

- **WHEN** the author opens the Paths tab on a draft holding four steps and
  five paths
- **THEN** the tab carries five rows

#### Scenario: A row names its source step and its target step

- **WHEN** the tab carries a path's row
- **THEN** that row names the step the path leaves and the step it enters

#### Scenario: A manual path with no guard reads as carrying none

- **WHEN** a step's manual paths carry no guard and no priority
- **THEN** each of their rows reads as carrying no priority and no guard

#### Scenario: A manual path carrying a guard shows it

- **WHEN** a manual path carries a guard
- **THEN** its row carries that guard's CEL source

#### Scenario: An automatic path shows its priority and its guard source

- **WHEN** a step carries two automatic paths, one guarded
- **THEN** each row carries that path's priority
- **AND** the guarded row carries its guard's CEL source

#### Scenario: A draft with no path shows an empty state

- **WHEN** the author opens the Paths tab on a draft holding no path
- **THEN** the tab says the process has no path yet

#### Scenario: The row derivation holds without rendering

- **WHEN** a test gives the row derivation a list of steps
- **THEN** it returns one row per path, in the draft's own order
- **AND** the test needs no DOM or canvas rendering

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: Column and row headers offer bulk flag toggles on the panels screen

The Field matrix tab mounts the only field matrix, and this requirement covers
it. The wrapper adds these badges to the bare grid.

Each column header and each row header SHALL offer `visible`, `required` and
`readonly` toggle badges. This holds wherever that column or row carries at least
one live cell. A badge SHALL flip every live, non-CEL cell in that column or row.

A `required` or `readonly` badge SHALL skip any cell already gated for that flag.
Gated means one of two things. The cell's own `visible` resolves to `false`, or
the field's other flag among `required`/`readonly` already resolves to `true`.
The second case applies only while nothing else in the draft writes that field.
Such a writer must land before the participant submits that cell's own step.
That is the same dominance-scoped test "A live cell edits its own view entry
inline" defines.

Every `required` and `readonly` bulk badge SHALL treat a technical field's cell
as gated, unconditionally. This holds on a column header and on a row header
alike. This matches a cell that already carries the flag's opposite. The
definition contract rejects either key on a technical field's view entry. A bulk
badge SHALL NOT write one there, even where the column's other rows are eligible.

Where every eligible cell already carries the flag's non-default value, the badge
SHALL turn that flag off across those cells. It turns the flag on otherwise.

A column or row with no live cell SHALL carry no bulk toggle badge.

The matrix SHALL NOT stand a single badge whose own eligible cell set is empty.
Gating a cell only stops the write. It leaves the button in place. A button that
answers no click reads as a broken control.

This rule widens the live-cell rule above, from the whole badge group to one
badge. It covers a technical field's row with no second exclusion mechanism.
`visible` keeps a non-empty eligible set there. That badge stays, and the other
two go. The rule also removes a badge from a row whose cells the studio gates for
any other reason.

A column header's `visible`/`required`/`readonly` badges SHALL sit in three fixed
positions, one per flag, in that order. Those positions SHALL match the fixed
positions the same three flags hold in the column's own cells below. A badge can
be absent because its eligible set is empty. Its position SHALL stay empty then,
rather than let the remaining badges shift into it.

#### Scenario: A column's bulk badge sets every eligible cell in that step

- **WHEN** the author picks a column's `required` badge, on a step where none
  of its live, non-CEL, non-gated cells carry `required: true`
- **THEN** every one of those cells' `required` value becomes `true`

#### Scenario: A row's bulk badge clears every eligible cell for that field

- **WHEN** every live, non-CEL, non-gated cell for one field already carries
  `required: true`, across every step
- **AND** the author picks that field's `required` badge
- **THEN** every one of those cells' `required` key clears

#### Scenario: A bulk badge skips CEL and gated cells

- **WHEN** the author picks a column's or row's `required` or `readonly`
  badge
- **THEN** it changes no cell whose relevant flag carries a CEL expression
- **AND** it changes no cell whose `visible` resolves to `false`

#### Scenario: A column with no live cell carries no bulk badge

- **WHEN** a workflow step declares no `view`
- **THEN** that step's column header carries no bulk toggle badge

#### Scenario: A bulk badge skips a cell gated by the required/readonly rule

- **WHEN** the author picks a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`, on a field
  nothing else in the draft writes before that cell's own step
- **THEN** the badge leaves that cell's `readonly` value alone

#### Scenario: A bulk badge does not skip a cell written only on a non-dominating step

- **WHEN** the author picks a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`
- **AND** the field's one other editable placement sits on a non-dominating
  step
- **AND** that step follows this cell's own step, or sits on a different
  branch
- **THEN** the badge still skips that cell
- **AND** the non-dominating placement makes it no more eligible

#### Scenario: A technical field's row never receives a bulk required or readonly toggle

- **WHEN** the author picks a column's `required` or `readonly` badge for a
  step where a technical field's cell is otherwise live
- **THEN** the badge leaves that cell's `required` and `readonly` value alone

#### Scenario: A technical field's row offers no required or readonly bulk badge of its own

- **WHEN** the field matrix draws the row header for a technical field with
  at least one live cell
- **THEN** that row header offers no `required` or `readonly` toggle badge
- **AND** it still offers the `visible` toggle badge

#### Scenario: A row already gated on every cell offers no bulk badge either

- **WHEN** every live cell for one field already carries `required: true`
- **AND** nothing else in the draft writes that field before each cell's own
  step
- **AND** no cell's field declares `technical: true`
- **THEN** that row header offers no `required` toggle badge

#### Scenario: A column header with only one eligible badge still aligns with its column's checkboxes

- **WHEN** every one of a column's live cells is a technical field
- **AND** `visible` stays eligible there, while `required` and `readonly`
  have no eligible cell
- **THEN** that column header carries the `visible` badge alone
- **AND** the `visible` badge sits in the same fixed position a `visible`
  checkbox holds in that column's cells
- **AND** the badge does not shift toward where `required` or `readonly`
  would otherwise sit

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's field matrix toolbar filters inert columns and reports coverage

The Field matrix tab mounts the only field matrix, and this requirement covers
it.

The field matrix SHALL carry a toolbar above the grid. The toolbar SHALL carry a
toggle that hides every step with no `view` at all from the grid, when engaged.
The toggle SHALL affect only the grid's columns. It SHALL leave every row in
place.

The toolbar SHALL also carry one live count line. That line SHALL state four
numbers. A note entry SHALL raise neither the declared field-entry count nor,
through it, the undeclared-cell count. The one case below is its only exception.
The fourth number subtracts the first from a grid of cells, so the two must count
the same thing.

- the number of declared field entries
- the field count
- the count of steps the grid currently draws
- the number of cells among those steps that carry no entry

That case moves two of the four numbers. Where a note is the first entry in a
step that declared no `view`, that step stops being inert. It then joins the
drawn columns. `stepCount` rises by one, and `undeclaredCells` by the whole field
count.

That is one more cell than a first field entry moves it. A field entry adds a
declared entry, and the fourth number subtracts that entry back out. A note adds
none. The note itself still counts as no entry and occupies no cell.

#### Scenario: Hiding inert columns removes steps with no view

- **WHEN** the author engages the "Hide inert columns" toggle on a draft
  where 3 of 13 steps declare no view
- **THEN** the grid draws 10 columns, and none of them belongs to a step with
  no view

#### Scenario: The toggle leaves every row in place

- **WHEN** the author engages the "Hide inert columns" toggle
- **THEN** the grid still draws every catalog field as a row

#### Scenario: The count line reflects the currently drawn columns

- **WHEN** a draft carries 54 field entries, 22 fields and 13 steps, of which
  3 declare no view
- **AND** the author engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 10 steps, and
  166 cells the visible steps do not declare

#### Scenario: A note moves none of the four numbers

- **WHEN** a step that already declares a view in that same draft gains three
  note entries
- **THEN** the count line still reads 54 field entries and 166 undeclared
  cells, because a note occupies no cell

#### Scenario: A note in a viewless step joins the drawn columns

- **WHEN** a note is the first entry in one of that same draft's 3 steps
  declaring no `view`
- **AND** the author engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 11 steps, and
  188 cells the visible steps do not declare

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's field matrix toolbar explains its marks with a legend

The Field matrix tab mounts the only field matrix, and this requirement covers
it.

The toolbar SHALL carry a legend. The legend SHALL explain seven marks:

- a bulk badge sets the whole column or row it sits on
- a cell with no key written reads the engine's own default
- what the CEL stamp marks
- what a blank cell's dash means
- what the flagged-cell marker means
- what the technical-field row-header marker means
- which color maps to `visible`, which to `required`, and which to `readonly`

The seventh entry SHALL carry a swatch in each of the three checkbox colors
beside that color's flag name. A swatch SHALL use the exact color the live cells'
checkboxes use for that flag. The legend defines no separate color of its own.

#### Scenario: The legend is visible without further interaction

- **WHEN** the author opens the Field matrix tab
- **THEN** the toolbar's legend is visible, with no click or hover needed to
  reveal it

#### Scenario: The legend's color entry matches the grid's own colors

- **WHEN** the author compares the legend's `visible`/`required`/`readonly`
  swatches against a live cell's checkboxes
- **THEN** each swatch's color equals that flag's checkbox color in the grid

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The field matrix's rail entry counts field entries and view findings

The `studio-process-tabs` capability gives the Field matrix tab no entity count.
The toolbar's own count line carries that number instead, as the first of its
four. That number is the total of field entries across every step in the draft. A
live cell represents one of that same total.

A note entry SHALL count as none of them. The count answers how much a step binds
to the catalog, and a note binds to nothing. Counting one would report a step as
busier than its data says.

This is the matrix's analogue of two other counts. The Fields tab counts catalog
rows. The Contract tab counts outcomes.

The Field matrix tab SHALL carry an issue count. It SHALL equal the number of
open findings carrying the `view` source over the whole draft. Those are the
findings the `studio-checks-rail` capability's rail groups under that name. Since
this change, that set holds one finding anchored on a field rather than a cell:
an unwritten technical field. The count therefore over-reports by one per such
field, with nothing to find in the grid.

The field catalog's own badge, which counts by entity type, carries that finding
correctly.

The count SHALL NOT come from the step entity type. A per-step view finding
shares that entity type with every other per-step issue in the draft.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the author opens the Field matrix tab on a draft with 54 field
  entries across its steps
- **THEN** the toolbar's count line reads 54 field entries

#### Scenario: A note leaves the field matrix count alone

- **WHEN** a draft holds one step whose view carries two field entries and
  three notes
- **THEN** the toolbar's count line reads 2 field entries

#### Scenario: A step holding notes alone contributes no entity count

- **WHEN** a draft holds one step whose view carries notes alone
- **THEN** that step raises the toolbar's field-entry count by none

#### Scenario: The issue count reflects only view-source findings

- **WHEN** the draft carries one `checkViewFlags` finding and several
  unrelated issues on the same steps, from other sources
- **THEN** the Field matrix tab carries an issue count of 1, not a count
  including the unrelated issues

#### Scenario: An unwritten technical field raises the matrix issue count

- **WHEN** the draft carries one unwritten-technical-field finding and no
  other `view`-source finding
- **THEN** the Field matrix tab carries an issue count of 1

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen and its process-wide views render from compiled styles

Four tabs carry a process-wide subject this requirement covers. They are the
field catalog, the field matrix's toolbar and legend, the data sources panel, and
the contract panel. The process surface, the field catalog, the field matrix and
the data sources panel SHALL render from compiled component styles. Each reads
`form-ui/tokens.stylex`. The rendered result SHALL match the previous stylesheet
declaration for declaration.

The contract panel renders no class this migration covers. It already satisfies
this requirement, unchanged, since it carries no rule to compile.

The field matrix's cell state, hatched, blank or live, SHALL pick its style from
an exhaustive check. That check covers this closed, three-value type in full. A
blank cell carries no extra style. That matches today's stylesheet, which
declares no rule for it either.

#### Scenario: The panels screen keeps its look

- **WHEN** a browser renders the process surface after the migration
- **THEN** the field catalog keeps its computed layout, spacing, color and
  border
- **AND** the field matrix and the data sources panel each do too
- **AND** every value matches the deleted stylesheet's own

#### Scenario: A field matrix cell's state picks the right style

- **WHEN** the field matrix renders a hatched cell, a live cell, and a blank
  cell side by side
- **THEN** each renders the same visual result the deleted stylesheet
  produced
- **AND** the blank cell carries no color override
