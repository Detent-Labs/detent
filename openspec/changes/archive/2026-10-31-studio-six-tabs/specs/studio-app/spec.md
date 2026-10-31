<!-- antislop: allow-file trailing-negation negation-habit -->
<!-- Why: the MODIFIED blocks copy the live spec's text, which carries both habits; the copy must stay whole. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft model
(`draft/`), UI-chrome i18n, and live validation. It SHALL also carry over the
structural panels (`panels/`). These panels are steps, paths, timers, actions,
subprocess spec, view editor, field catalog, data sources, and contract.

The draft routes replace file-based persistence. `GET /drafts/:processId` loads
the draft. `PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be one tabbed process surface. The
`studio-process-tabs` capability states the tab row and its six tabs. The
canvas stands on the Map tab. A steps rail and a step page stand on the
Steps tab, and the `studio-step-page` capability states both.

Four tabs carry a process-wide subject. They are Fields, Forms, Checks and
Settings. Fields holds the catalog and the field matrix as two views.
Settings holds four views: the process settings, the data sources, the
contract and the access lists. Each tab stays reachable whether or not the
author has picked a step.

The Settings tab SHALL carry `baseLocale`. This capability requires an author
to declare a non-English base locale without leaving the process surface.

The tab row SHALL belong to the Structure surface alone. The surface SHALL stand
no tab while the JSON surface is open. Every tab but Checks writes the draft body, and the
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
- **THEN** the Map tab draws the new position and path identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for the current draft
- **THEN** the surface prints the issues, keeps the save action available,
  and the save succeeds

#### Scenario: A Structure-surface link opens the panels screen

- **WHEN** the author picks one of the four process-wide tabs
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

<!-- antislop: allow synonym-rotation -->
<!-- Why: "edit" names the edit route and the edit screen, and "change" names the change list, two unrelated concepts. -->
### Requirement: The panels screen is a routed sub-state of the edit screen

The six tabs SHALL sit on a routed surface, not behind a dialog. The path
SHALL read `/processes/:id/edit/:tab`. Here `:tab` is one of `map`, `steps`,
`fields`, `forms`, `checks` or `settings`. A view of the Fields or Settings
tab rides as a further segment, `/processes/:id/edit/:tab/:view`.

That path SHALL be a sub-state of the `edit` route. It rides as an optional field
on the same route object, the shape `formStepId` already takes. The
`studio-form-editor` capability routes its own screen that way.

An unrecognized `:tab` SHALL fall back to the Map tab. The routing table
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
Choosing a "Show on the canvas" control SHALL open the Map tab with that step
preselected. The Map tab SHALL read the target whenever it changes, not only
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

- **WHEN** the author opens Where values come from on the Settings tab
- **THEN** the address bar reads `/processes/:id/edit/settings/sources`, and
  loading that path directly opens the same view

#### Scenario: The Changes and Paths views have addresses too

- **WHEN** the author loads `/processes/:id/edit/changes`
- **THEN** the Versions screen opens, where the change list stands now
- **AND** loading `/processes/:id/edit/paths` opens the Steps tab

#### Scenario: A reload keeps the open view

- **WHEN** the author reloads the browser on the Settings tab's What it takes
  in and gives back view
- **THEN** the surface reopens on that view, with Map closed

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Back leaves the screen rather than the process

- **WHEN** the author reaches the Fields tab from the Map tab and presses
  the browser's Back control
- **THEN** the Map tab returns, and the draft keeps every change

#### Scenario: Show on the canvas preselects a step

- **WHEN** the author picks "Show on the canvas" on a used-in row of the
  Fields tab
- **THEN** the Map tab opens and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the author loads `/processes/:id/edit/nonsense`
- **THEN** the Map tab opens, and the surface reports no issue

### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- The area nav's Discard control drops every unsaved change; a panel's Remove control drops one entity. -->
No tab SHALL carry a Save control. Every change an author makes on a tab SHALL
write straight into the in-browser draft. That is how the panels write today. The
area nav's Save and Publish controls SHALL remain the only ones that persist.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" here names the process surface, a noun, and no verb of display. -->
Leaving a tab SHALL discard nothing. The surface SHALL state that plainly, so
leaving a tab never reads as a discard.

A tab's own unsubmitted input SHALL survive a switch between tabs. The contract
panel holds a half-typed outcome name in component state. The data sources panel
fetches its list keys on mount. The field matrix holds its selected cell in
component state. Every tab and every view SHALL therefore stay mounted for as
long as the process surface is open. Switching a tab or a view SHALL reveal
and hide them, rather than mount them.

The Fields tab's count says how many fields the catalog holds. A rail row's
issue mark says whether that entity is wrong. Only the issue mark takes the
refusal tone. A row SHALL have no issue mark while its entity has no issue.

Two views SHALL each stand an entity rail beside the open editor. They are
the Fields tab's Catalog view and the Settings tab's Where values come from
view. The rail SHALL list that view's own entities, and an Add entry too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. On the Fields tab, the Add entry SHALL add a top-level field. A group
field's children indent one level under it.

A field entry SHALL be the drag source that moves its field into a group and
out of it. The entry SHALL have no move control of its own, since the field's
editor carries that control. The move requirement below states the drag, its
keyboard route and what the move writes. Data source entries SHALL take no
part in a move, since a data source nests under nothing.

The contract holds a single editor, so its view SHALL stand no entity rail.
The field matrix draws a grid, so its view SHALL stand none either.

A view SHALL stand its own rail alone. No view SHALL list another view's
entities.

Choosing a field nested inside a group SHALL select that field. The tab SHALL
open that field's own editor, the same one a top-level field opens. The rail
SHALL mark that entry alone, and it SHALL leave the group's own entry unmarked.

On the Fields tab, a newly chosen field's editor SHALL open at its top. A move
keeps the same field selected, and the editor keeps its scroll position.

A selection SHALL live in component state and SHALL take no address of its own.
The tab SHALL select the first entity on mount. It SHALL select the added entity
after an Add.

<!-- antislop: allow synonym-rotation -->
<!-- The panel's Remove control drops one entity; the area nav's Discard control drops every unsaved change. -->
It SHALL select the neighbour after a Remove. Inside a group, the neighbour
SHALL be the next field of that group, then the previous one, then the group.
Switching to another tab and back SHALL keep the selection the first tab held.

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
line. A label too long for the rail's width SHALL truncate there rather than
wrap onto a second line. An icon for the field's kind SHALL lead the label on
that same line. The issue mark SHALL follow the label there.

The entry SHALL print neither the kind name nor a group's name as visible
text. The indent alone SHALL show the group. The kind name SHALL stay the
icon's tooltip, and it SHALL stay part of the entry's accessible name. A
nested entry's accessible name SHALL also carry the name of the group that
holds its field. The indent shows that group to a sighted author alone.

The row SHALL NOT print the field's key. The key stays in the definition
half's "What this field asks" zone, once an author selects that field. The
engine's own exact-match value already lives there. The Data sources rail
entry names its data source through the same rail-row name element. An
over-long data source key SHALL truncate on its one line the identical way.

The kind icon and the kind name SHALL come from the same table the kind picker
reads. Each kind SHALL take an icon no other kind takes. A plugin-typed field
SHALL take one further icon. A field whose members name no kind SHALL take
another. A row naming the base type while the picker beside it names the kind
would give one field two vocabularies. The row's kind name therefore reads
"Date" where the picker reads "Date".

The rail SHALL keep the fallback name it carries today. It SHALL trigger on an
EMPTY RESOLVED LABEL rather than an empty key. The label is the row's primary
text now. A field carrying a key but no label needs the fallback exactly as an
empty-key field did before.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the author adds a field on the Fields tab and then opens the
  Map tab
- **THEN** the draft still carries that field, and the area nav still reports
  unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the author types an outcome name on the contract view, opens the
  Fields tab without adding it, then returns
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the author moves roving focus to a live cell on Where fields
  appear and activates it
- **AND** the author opens the Settings tab, then returns
- **THEN** the same cell still holds roving focus, and it is still activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the author inspects an open tab
- **THEN** it has no Save control, and it states that it keeps every
  change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a contract
- **THEN** the Fields tab reads three, the Settings tab prints no count, and
  the contract view stands no entity rail

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a validation
  issue
- **THEN** the Fields tab reads three, and that field's rail row carries an
  issue mark. Only the mark takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** no data source rail row carries an issue mark

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry instead of a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the author picks the second in
  the rail
- **THEN** the Fields tab renders that field's editor, and it renders neither
  of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the author picks the second
  in the rail
- **THEN** Where values come from renders that data source's editor, and it
  renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the author opens Where values come from on a draft that carries
  both fields and data sources
- **THEN** that view's rail lists the data sources, and it lists no field

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child now opens its own editor. -->
#### Scenario: A group child selects its group

- **WHEN** the author picks a group field's child in the rail
- **THEN** the tab renders that child's own editor, with both halves
- **AND** the rail marks the child's entry alone, and neither the group's
  entry nor a sibling's entry

#### Scenario: A newly chosen field's editor opens at its top

- **WHEN** the author scrolls a field's editor down to its "Validation" zone
- **AND** the author picks another field in the rail
- **THEN** the editor shows that field's "What this field asks" zone at its
  top

#### Scenario: The Fields rail adds a field

- **WHEN** the author picks the rail's Add entry on the Fields tab
- **THEN** the draft carries one more field, the rail lists it, and the tab
  renders that new field

<!-- The heading keeps the live spec's wording; the entry now offers the drag, and the editor holds the control. -->
#### Scenario: A field entry offers the move control

- **WHEN** the author opens the Fields tab on a draft carrying a group field
  and a top-level field
- **THEN** each field entry offers the drag that moves its field, and no
  data source entry offers one
- **AND** no rail entry carries a move control of its own

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; "names" means printed text, and a nested entry's accessible name carries the group's name. -->
#### Scenario: A rail entry names no group

- **WHEN** a draft carries a group field holding two fields
- **THEN** both child entries indent once under the group's entry
- **AND** neither child entry prints the group's name

#### Scenario: A nested entry's accessible name carries its group's name

- **WHEN** a draft carries a group field holding a field
- **THEN** the child entry's accessible name carries the group's name
- **AND** the entry prints no group name as visible text

#### Scenario: Removing a field selects its neighbour

- **WHEN** the author removes the selected field from a draft that carries
  three
- **THEN** the tab renders a neighbouring field, and it reports no empty
  selection

#### Scenario: Removing a field inside a group selects the field after it

- **WHEN** a group holds three fields, and the author removes the first
- **THEN** the tab renders the field that followed it in that group

#### Scenario: Removing a group's last field selects the field before it

- **WHEN** a group holds three fields, and the author removes the third
- **THEN** the tab renders the group's second field

#### Scenario: Removing a group's only field selects the group

- **WHEN** a group holds one field, and the author removes it
- **THEN** the tab renders the group's own editor

#### Scenario: A reload selects the first entity

- **WHEN** the author reloads the browser on the Fields tab
- **THEN** the tab renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the author picks the rail's Add entry on Where values come from
- **THEN** the draft carries one more data source, the rail lists it, and the
  view renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the author removes the selected data source from a draft that
  carries three
- **THEN** the tab renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the author reloads the browser on Where values come from
- **THEN** the view renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the author
  has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: A nested field's entry marks its own check

- **WHEN** a field inside a group carries a check on its key
- **THEN** that field's own rail entry carries the issue mark
- **AND** the group's entry carries none for that check

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has a
  `label` carrying the base-locale value but no `de` value
- **THEN** the Fields tab carries the missing-translation warning next to
  that field's label input

#### Scenario: The Fields rail row shows no key

- **WHEN** the author opens the Fields tab on a draft whose fields each carry
  a `key`
- **THEN** every rail row carries the resolved label, the kind icon and any
  issue mark
- **AND** no row prints a `key`

#### Scenario: The rail row and the picker name one kind

- **WHEN** the author selects a `{type: "string", format: "date"}` field
- **THEN** the rail row's kind icon carries, as its tooltip, the word the kind
  picker shows for that field

#### Scenario: Each kind takes its own icon

- **WHEN** a draft carries one field of each kind the kind picker offers
- **THEN** each of those rail entries shows an icon no other entry shows
- **AND** no entry prints its kind name as visible text

#### Scenario: A plugin-typed field takes the plugin icon

- **WHEN** a draft carries a field whose `type` is a plugin envelope
- **THEN** its rail entry shows the plugin icon, and the icon's tooltip reads
  the kind picker's custom-type word

#### Scenario: A long field name truncates instead of wrapping

- **WHEN** a field's resolved label is longer than the rail entry's own
  width, especially once indented under a group
- **THEN** the rail entry shows the label truncated on its one line. It
  prints no character of it on a line of its own

<!-- A MODIFIED block keeps every scenario, so this heading stays though the kind name no longer prints. -->
#### Scenario: A long kind name truncates instead of wrapping

- **WHEN** a field's kind name is longer than any share of the rail entry's
  line
- **THEN** the rail entry keeps its one line and prints no character of the
  kind name on it. The icon's tooltip carries the kind name whole

#### Scenario: A long data source key truncates instead of wrapping

- **WHEN** a data source's `key` is longer than the Data sources rail
  entry's own width
- **THEN** the rail entry shows the key truncated on its one line. It
  prints no character of it on a line of its own

### Requirement: A hidden tab body that derives from the whole draft shows its last visible draft

The field matrix view SHALL stay mounted while it is hidden. A hidden view
SHALL draw the draft as it stood when the view was last visible. The commit
that reveals the view SHALL draw the live draft.

Hiding SHALL discard no state. A selected matrix cell SHALL survive the switch
away and back.

#### Scenario: Typing on the Fields tab does not redraw the hidden matrix

- **WHEN** the Catalog view is open and the author types a character into a
  field's label
- **THEN** the field matrix view does not re-render, and it keeps the draft
  it last drew

#### Scenario: Revealing the matrix draws the live draft

- **WHEN** the author changes a field's label on the Catalog view and then
  opens Where fields appear
- **THEN** the matrix prints the new label in the commit that reveals it

#### Scenario: A selected cell survives a round trip

- **WHEN** the author selects a matrix cell, opens another tab, changes the
  draft there and returns to the matrix view
- **THEN** the same cell stays selected. The matrix prints the changed draft.

### Requirement: A process's Access surface manages its Developer, Owner and Reader lists

The process surface's Settings tab SHALL offer an Access view. It opens for
an actor listed as the process's Developer or its Owner. This requirement
calls that view the Access surface. The view SHALL also carry the link to the admin
area's assignment groups for this process. That listing follows the `process-access-roles`
capability. The surface SHALL render that process's Developer, Owner and
Reader lists, each as users and groups.

Reaching the edit screen at all still needs `requireAuthoring` and that
process's Developer list, or `ADMIN_ROLE`, per `process-drafts`. An Owner
holding neither cannot open this screen, so cannot reach this surface
either. `process-access-roles`'s own deferred non-studio surface is what
such an Owner needs instead.

A Developer SHALL add and delete entries on the Developer list and on the
Owner list from this surface. An Owner SHALL add and delete entries on the
Reader list from this surface. Neither role SHALL see a control for the
other's list. The server enforces every write authoritatively, per
`process-access-roles`.

An actor reaching the edit screen through `ADMIN_ROLE` alone SHALL also
reach the Access surface. It SHALL offer every control this requirement
names, regardless of that actor's own Developer or Owner entry.

#### Scenario: A Developer manages Developer and Owner entries

- **WHEN** an actor listed as a process's Developer opens its Access surface
- **THEN** the surface offers adding and deleting entries on the Developer
  list and on the Owner list

#### Scenario: An Owner manages the Reader list

- **WHEN** an actor listed as a process's Owner opens its Access surface
- **THEN** the surface offers adding and deleting entries on the Reader list

#### Scenario: A Developer holding no Owner entry sees no Reader control

- **WHEN** an actor listed as a process's Developer, but not its Owner,
  opens its Access surface
- **THEN** the surface offers no control over the Reader list

#### Scenario: An admin reaches the Access surface unconditionally

- **WHEN** an actor holding `ADMIN_ROLE`, with no Developer or Owner entry
  of their own, opens a process's Access surface
- **THEN** the surface offers every control this requirement names

## REMOVED Requirements

### Requirement: The panels screen's Changes view shows what a publish would change

**Reason**: The Changes tab is gone. The change list stands in the Publish
dialog and on the Versions screen, and its rows offer no tab command.

**Migration**: "The change list states what a publish would change" below,
with the requirements after it. `studio-publish` states the dialog's row.

### Requirement: The panels screen's Paths view lists every path in the process

**Reason**: The Paths tab is gone. A step's paths have one home, the step
page's Ways out section, which `studio-step-page` states.

**Migration**: None. A check about a path opens the owning step, per
`studio-process-tabs`.

### Requirement: The field matrix's rail entry counts field entries and view findings

**Reason**: The field matrix is a view of the Fields tab now, and no tab
prints a view-finding count.

**Migration**: "The field matrix's count line counts field entries" below
keeps the toolbar's count line.

### Requirement: The process header declares the process's base locale

**Reason**: The `⋮` menu's first group is gone. The base language stands on
the Settings tab.

**Migration**: "The Settings tab declares the process's base locale" below.

### Requirement: The Contract tab stores an outcome trimmed

**Reason**: The Contract tab is gone. The contract editor stands on the
Settings tab.

**Migration**: "The contract editor stores an outcome trimmed" below.

### Requirement: The Changes tab computes its rows while hidden

**Reason**: The Changes tab is gone. The Publish dialog computes the rows
when it opens.

**Migration**: `studio-publish`'s "The publish dialog states the changes
since the base version".

## ADDED Requirements

### Requirement: The change list states what a publish would change

The change list SHALL state the difference between a draft and the version
it sits on. It SHALL stand in two places. The Publish dialog holds it over
the draft as the editor holds it. The Versions screen holds it over the saved
draft.

Both SHALL use one difference computation. The base version is the before
side and the draft the after side. The list SHALL strip the compiled content
from the base body first. A row SHALL offer no command that opens a tab.

#### Scenario: The dialog's list reads the unsaved draft

- **WHEN** the author renames a step and opens the Publish dialog without
  saving
- **THEN** the Steps group holds one changed row for that step
- **AND** opening the row shows the published label before and the unsaved
  label after

#### Scenario: A row offers no open command

- **WHEN** the author opens a row under Fields in the dialog's change list
- **THEN** the row shows its property values and its Developer view
- **AND** it offers no command opening a tab

#### Scenario: A publish moves the base and the list follows it

- **WHEN** the author publishes the draft and opens the Publish dialog again
- **THEN** the dialog compares the draft with the newly published version
- **AND** it reports no change since that version

### Requirement: The change list groups its rows by subject

The list SHALL carry one row per changed entity. A row names its entity by
label and by key, and carries one stamp reading added, changed or removed.
Rows SHALL stand under seven group headings in a fixed order. They read
Process, Fields, Where values come from, Steps, Ways out, Forms, and What it
takes in and gives back. A group holding no row SHALL NOT appear.

#### Scenario: One added field reads as one added row

- **WHEN** the author adds one field to a catalog of 51 fields
- **THEN** the Fields group holds one added row, naming the new field
- **AND** no row repeats any of the other 51 fields

#### Scenario: A field moved into another group stays one row

- **WHEN** the author moves a field out of one group and into another
- **THEN** the Fields group holds one changed row for that field
- **AND** its Group property reads the old group's label before and the new
  group's label after

#### Scenario: A reorder reads as one order property

- **WHEN** the author swaps two field entries on a step's form and changes
  nothing else
- **THEN** the Forms group holds one changed row for that step
- **AND** that row's only property is Form order

#### Scenario: An added step brings its paths and its form

- **WHEN** the author adds a step carrying two paths and a view
- **THEN** the Steps group holds one added row for the step
- **AND** the Ways out group holds two added rows, and the Forms group holds
  one

#### Scenario: A data source row stands under the author's word

- **WHEN** the author adds a data source
- **THEN** its added row stands under the heading Where values come from

### Requirement: The change list pairs its rows by anchor

A list SHALL pair its members by anchor. Steps, fields, paths, timers,
actions and data sources pair by `id`. A form entry pairs by its `ref`, a
form tab by its `key`, and a field option by its `value`. A note pairs by
its position among the view's notes. A list whose members differ only in
position SHALL read as one order property on the row owning that list. It
SHALL add no row for a moved member.

#### Scenario: Two steps swapped read as one order property

- **WHEN** the author swaps two steps and changes nothing else
- **THEN** the Process row carries one Step order property
- **AND** no row names either moved step

### Requirement: A change list row folds

Every row SHALL stand folded when the list first appears. A folded row SHALL
name the properties that differ, four at most, then state how many more
differ. An open row SHALL show each property's value before and after. Every
open row SHALL hold a Developer view listing the row's JSON paths with their
raw values. The list SHALL offer one command that opens every row and folds
them all again.

#### Scenario: A folded row names four properties at most

- **WHEN** the author changes six entries on one step's form
- **THEN** that step's folded row under Forms names four of them
- **AND** it states that two more differ

### Requirement: A change list value reads in words

A value SHALL read in words where the list has a word for the property. A
localized text reads in the content locale, falling back to the base locale.
A yes-or-no value reads as yes or no. A reference to another entity reads as
that entity's label. A CEL expression reads as its source text. A property
the list has no word for SHALL read under its JSON key, with its values
printed as JSON.

#### Scenario: A property with no word reads under its JSON key

- **WHEN** the draft adds a key to a step that the list has no word for
- **THEN** the step's row lists that key as a property
- **AND** its value prints as JSON

#### Scenario: A label reads in the content locale

- **WHEN** the author sets the editor's content locale to German, renames a
  field's German label and opens the Publish dialog
- **THEN** the field's open row shows the German label before and after

#### Scenario: A never-published process reads as a first publish

- **WHEN** the author opens the Publish dialog on a process with no base
  version
- **THEN** the dialog says this publish mints the first version, and shows
  no change list

#### Scenario: A draft matching its base reads as no change

- **WHEN** the author opens the Publish dialog on a draft nobody has changed
  since it seeded from its base version
- **THEN** the dialog says the draft has no changes since that version

### Requirement: The field matrix's count line counts field entries

The matrix toolbar's count line SHALL lead with the total of field entries
across every step in the draft. A live cell represents one of that same
total. A note entry SHALL count as none of them. The count answers how much
a step binds to the catalog, and a note binds to nothing.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the author opens Where fields appear on a draft with 54 field
  entries across its steps
- **THEN** the toolbar's count line reads 54 field entries

#### Scenario: A note leaves the field matrix count alone

- **WHEN** a draft holds one step whose view carries two field entries and
  three notes
- **THEN** the toolbar's count line reads 2 field entries

#### Scenario: A step holding notes alone contributes no entity count

- **WHEN** a draft holds one step whose view carries notes alone
- **THEN** that step raises the toolbar's field-entry count by none

### Requirement: The Settings tab declares the process's base locale

The Settings tab's Process view SHALL carry a control that reads and writes
the process's `baseLocale`. An author SHALL be able to declare a non-English
base locale without leaving the structure surface. The control SHALL write
the typed value through, unvalidated. Live validation reports a value that is
not a well-formed locale code, the route every other malformed authored
value takes. The control SHALL NOT reject or correct the keystroke.

#### Scenario: The Settings tab shows the draft's declared base locale

- **WHEN** the edit screen loads a draft declaring `baseLocale: "de"`
- **THEN** the Settings tab's Process view shows a base-language control
  reading `de`

#### Scenario: Existing text without an entry for the new base locale reports

- **WHEN** an author changes the base locale to `de` on a process whose labels
  carry only `en` entries
- **THEN** live validation reports a missing base-locale entry for every
  `LocalizedText` in the body that carries no `de` entry

#### Scenario: A malformed base locale reports as a validation issue

- **WHEN** an author types a value into the base-locale control that is
  not a well-formed locale code
- **THEN** the draft body carries that value, and live validation
  reports the issue against `baseLocale`

### Requirement: Declaring a base locale moves the edited content locale

A well-formed base locale SHALL also move the edited content locale to it.
The edited content locale decides which entry every text input writes. It
also decides which entry a new step or field seeds. Without the move an
author who declares `de` would keep writing under the previous locale. The
studio SHALL NOT move the content locale for a malformed locale code. A
part-typed value would otherwise become a real locale key.

#### Scenario: Declaring a base locale moves the edited content locale

- **WHEN** an author changes the Process view's base-language control to `de`
- **THEN** the draft body's `baseLocale` is `de`, and the edited content
  locale is `de`. A step created next seeds its label under `de`

#### Scenario: A part-typed base locale leaves the content locale alone

- **WHEN** an author has typed `d` on the way to `de`
- **THEN** the draft body's `baseLocale` is `d`, and the edited content locale
  is whatever it was before

### Requirement: The contract editor stores an outcome trimmed

The contract editor SHALL store a new outcome without leading or trailing white
space. It SHALL compare the trimmed text against the declared outcomes, so
`approved` and ` approved ` count as one outcome. An outcome that trims to
nothing SHALL add nothing.

A parent guard compares `child.outcome` to the stored string exactly. Storing
the text as typed would make the guard never match.

#### Scenario: Adding an outcome typed with spaces

- **WHEN** an author types ` approved ` and presses Add
- **THEN** `contract.outcomes` holds `approved`

#### Scenario: Adding an outcome that already exists

- **WHEN** `contract.outcomes` holds `approved` and the author adds ` approved `
- **THEN** `contract.outcomes` still holds one `approved`
