<!-- antislop: allow-file synonym-rotation -->
<!-- Why: `.claude/rules/ui-glossary.md` fixes "edit screen" and "edit
     rail" as the names of `EditScreen.tsx` and `EditRail.tsx`. This
     delta reuses both terms throughout, from the base spec. The rule
     reads "edit" as a synonym for "change", the word this document
     uses for an OpenSpec change and for what an author does to a
     draft. Those name different concepts that happen to share a word. -->

## MODIFIED Requirements

### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft
model (`draft/`), UI-chrome i18n, and live validation. It SHALL also
carry over the structural panels (`panels/`). These panels are steps,
paths, timers, actions, subprocess spec, view editor, field catalog,
data sources, and contract. The draft routes replace file-based
persistence. `GET /drafts/:processId` loads the draft.
`PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be canvas-primary. An interactive graph (see
the `studio-canvas` capability) occupies the top of the editing well. A
fixed-width section index beside the canvas lists the selected step's
own sections and their entity counts. Those sections are identity,
assignment, paths, timers, actions, subprocess spec, and view. See the
`studio-canvas` capability for how choosing an entry behaves.

The process header's `⋮` overflow menu SHALL carry `baseLocale`. This
capability requires an author to declare a non-English base locale
without leaving the Structure surface. The panels screen SHALL NOT hold
it.

Four links SHALL sit in the canvas edit screen's rail, under a Process
heading: Fields, Data sources, Contract, Field matrix. See the
`studio-canvas` capability's layout requirement for the rail. Each link
SHALL navigate to the panels screen, opened at its own view. These four
views cover the whole process, not one step. The links stay reachable
whether or not the author has selected a step on the canvas.

The links SHALL belong to the Structure surface alone. The screen SHALL
NOT offer them while the JSON surface is active. All four views mutate
the draft body, and the `studio-json-view` capability requires that no
draft-body-mutating control stays reachable there.

This requirement governs where the screen mounts each panel, and how an
author reaches it. What each panel validates, mutates, or persists
stays the same.

Every inline missing-translation warning SHALL survive the move. Six
`LocalizedTextInput` sites carry one.

- the process label, which stays on the screen
- a step's label and description, which move into the section index's
  identity section
- a field's label and description, and a field option's label, which
  move into the panels screen's Fields view

Live validation SHALL remain exactly what it is today. It runs the
engine's own publish-time chain in the browser and reports issues in
place. It SHALL NOT block saving, since a work-in-progress draft is
normally invalid.

The section index SHALL carry one issue count for the selected step as
a whole. That count SHALL cover the step's own issues, and the issues of
its paths, timers and actions. Here `resolveLoc` returns the deepest
entity it finds. A guard's issue therefore names the path, not the step.
A count over the step's own id alone would read zero on such a step.

The panels screen's index rail SHALL carry one issue count per view.
Both counts SHALL use the same visual tone. The rest of the studio area
already uses that tone for issues.

Per-section issue counts are out of scope. `resolveLoc` resolves a
view, assignment or subprocess-spec issue to the step itself. No
per-section number exists to report.

The screen SHALL offer a **Publish** action (see the `studio-publish`
capability). It calls `POST /drafts/:processId/publish` against the
currently persisted draft, not the in-browser draft state. When local
changes remain unsaved, the action SHALL prompt the user to save
first. It must not publish stale or ahead-of-server content. On
success, the screen SHALL confirm the new version number and
`definitionHash`.

#### Scenario: A draft round-trips through the panels

- **WHEN** the developer loads a draft, adds a step through the panels,
  saves the draft, and reloads it
- **THEN** the panels surface the new step identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** the developer loads a draft, repositions a step, connects it
  to another step, then saves and reloads it
- **THEN** the canvas renders the new position and path identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for the current draft
- **THEN** the screen displays the issues, keeps the save action
  available, and the save succeeds

#### Scenario: A Structure-surface link opens the panels screen

- **WHEN** the developer clicks the Fields, Data sources, Contract, or
  Field matrix link in the rail's Process section
- **THEN** the panels screen opens at that view, and the address bar
  carries that view's own path

#### Scenario: A link opens the panels screen with no step selected

- **WHEN** the developer clicks one of those links before selecting any
  step on the canvas
- **THEN** the panels screen still opens at that view

#### Scenario: The JSON surface renders no link into the panels screen

- **WHEN** the developer switches to the JSON surface
- **THEN** the four links are absent, and no control on screen reaches
  the panels screen

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the developer clicks Publish while local changes remain
  unsaved
- **THEN** the studio prompts the developer to save before publishing,
  and does not call `POST /drafts/:processId/publish` until the save
  completes

#### Scenario: The screen confirms a successful publish

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the screen displays the returned version number and
  `definitionHash`

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

The screen SHALL lay out three columns, in order: an index rail, the
open view, and the checks rail. See the `studio-checks-rail` capability
for what the rail shows here.

The panels screen SHALL replace the canvas while it is open. It SHALL
offer one control back to it.

The three columns SHALL fill the height the screen's header rows leave,
above the floor the canvas layout uses. A taller window
therefore shows taller columns, and no empty band sits below them. This
is the rule `studio-canvas` states for the canvas edit screen, and the
panels screen stands in the same well.

#### Scenario: The columns fill a tall window

- **WHEN** the developer opens the panels screen on a window taller
  than the floor
- **THEN** the three columns reach the bottom of the well, and no empty
  band sits below them

#### Scenario: A short window holds the floor

- **WHEN** the developer opens the panels screen on a window shorter
  than the floor
- **THEN** the columns hold that floor and the page scrolls

#### Scenario: A view has its own address

- **WHEN** the developer opens the Data sources view
- **THEN** the address bar reads that view's path, and loading that
  path directly opens the same view

#### Scenario: A reload keeps the open view

- **WHEN** the developer reloads the browser on the Contract view
- **THEN** the screen reopens on the Contract view, not on the canvas

#### Scenario: Back leaves the screen rather than the process

- **WHEN** the developer reaches the panels screen from the canvas and
  presses the browser's Back control
- **THEN** the canvas returns, and the draft keeps every change

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the developer loads `/processes/:id/edit/panels/nonsense`
- **THEN** the edit screen's canvas renders, and the screen reports no
  issue

### Requirement: The panels screen keeps every change and states so

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
takes the refusal tone. An entry SHALL surface no issue count when the
view holds no issue.

For the Fields view the rail SHALL also list the field catalogue and an
Add entry. Choosing a field SHALL scroll that field's row into view
inside the panel. The Add entry SHALL add a field, through the call the
panel's own add control makes. A group field's children indent one
level under it. Contract holds a single editor, so its rail entry SHALL
carry no sub-list.

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

- **WHEN** the developer selects a live cell in the Field matrix view,
  switches to Contract, then switches back
- **THEN** the same cell is still selected, and its editor still shows

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

#### Scenario: The Fields rail adds a field

- **WHEN** the developer chooses the rail's Add entry under Fields
- **THEN** the draft carries one more field, and the rail lists it

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has
  a `label` carrying the base-locale value but no `de` value
- **THEN** the screen's Fields view shows the missing-translation
  warning next to that field's label input

## ADDED Requirements

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
- **Live**, where such an entry exists. A live cell SHALL show a
  compact summary of that entry's `visible`, `required` and `readonly`
  flags. That summary SHALL show whether any of the three carries a CEL
  expression.

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
- **AND** its summary reflects the entry's resolved `visible`,
  `required` and `readonly` values

### Requirement: Selecting a live cell opens one flag editor for that (step, field) pair

The field matrix SHALL offer no per-cell input controls. Selecting a
live cell SHALL open one editor region below the grid. It SHALL appear
once, and it SHALL target exactly the selected cell's view entry.

The editor SHALL offer `visible`, `required` and `readonly` as
independent boolean-or-CEL controls. Each SHALL start from the entry's
own resolved value: an absent key reads the engine's own default, not
false. Changing a control SHALL write to that entry's key on selection.
It SHALL delete the key on a return to its default. That is the same
write the `studio-form-editor` capability's strip already performs
through `setFlag`.

Where the selected cell's own `visible` is a literal `false`, the
editor SHALL disable `required` and `readonly`, the same gating
`studio-form-editor`'s strip already applies.

Selecting a hatched or a blank cell SHALL close the editor, or leave it
closed. Neither state names a view entry to edit.

#### Scenario: Selecting a live cell opens its editor

- **WHEN** the developer selects a live cell
- **THEN** the editor appears below the grid, showing that cell's
  `visible`, `required` and `readonly` controls at their resolved
  values

#### Scenario: Editing a control writes the same entry the form editor writes

- **WHEN** the developer changes one of the editor's three controls
- **THEN** the underlying step's view entry for that field updates
  immediately, in the in-browser draft, without a Save control

#### Scenario: A control returning to its default clears the key

- **WHEN** the developer sets a control back to the engine's own
  default for that flag
- **THEN** the corresponding key is absent from the view entry. It does
  not carry the default value instead

#### Scenario: Turning visible off disables the other two controls

- **WHEN** the developer sets the selected cell's `visible` control to
  literal `false`
- **THEN** the `required` and `readonly` controls disable, and their
  keys clear from the entry

#### Scenario: Selecting a hatched or blank cell shows no editor

- **WHEN** the developer selects a hatched cell or a blank cell
- **THEN** no flag editor appears for it

### Requirement: The field matrix's rail entry counts view entries and view findings

The panels screen's index rail SHALL show the field matrix's entity
count. That count is the total number of view entries across every
step in the draft. A live cell represents one of that same total.

This is the matrix's analogue of two other counts. The Fields view
counts catalog rows. The Contract view counts outcomes.

The field matrix's issue count SHALL equal the number of open findings
`checkViewFlags` reports over the whole draft. Those are the
`view`-sourced findings the `studio-checks-rail` capability's rail
already groups under that name. The count SHALL NOT come from the step
entity type. A `checkViewFlags` finding shares that entity type with
every other per-step issue in the draft.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the developer opens the field matrix on a draft with 54 view
  entries across its steps
- **THEN** the rail's Field matrix entry shows 54 as its entity count

#### Scenario: The issue count reflects only view-source findings

- **WHEN** the draft carries one `checkViewFlags` finding and several
  unrelated issues on the same steps, from other sources
- **THEN** the rail's Field matrix entry shows an issue count of 1, not
  a count including the unrelated issues
