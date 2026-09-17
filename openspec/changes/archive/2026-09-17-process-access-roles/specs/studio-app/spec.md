## MODIFIED Requirements

### Requirement: The process list shows draft and published state per process

The `/processes` screen SHALL list one row per process on the actor's own
Developer or Owner list, per the `process-access-roles` capability. An actor
holding `ADMIN_ROLE` SHALL see every process instead.

`GET /processes` and `GET /drafts` SHALL stay unfiltered. The participant's
Start-a-process screen and the operator's pickers read them too, and both
need the full list. The `/processes` screen SHALL instead read the actor's
own Developer- and Owner-listed process ids. It SHALL narrow its combined
rows to that set in the browser.

<!-- antislop: allow synonym-rotation -->
<!-- "render" (paint a row) and "surface" (the named Access panel below) name different concepts. -->
Each row SHALL render whether a draft exists. Where one does, the row SHALL
render who last saved it and when. The row SHALL also render the latest
published version with its `definitionHash`. A process with a draft but no
published version SHALL render correctly. A process with published versions
but no draft SHALL also render correctly.

<!-- antislop: allow synonym-rotation -->
<!-- "Discard" names the existing toolbar control. "delete" names removing a list entry in the Access surface below. -->
Actions SHALL be: create a new process, open a process for editing, and
discard its draft. Discarding SHALL need a confirmation and SHALL call
`DELETE /drafts/:processId`, leaving published versions untouched.

#### Scenario: A never-published process appears

- **WHEN** a draft exists for a process with no `definitions` rows
- **THEN** the row renders with its draft metadata and an empty published
  column

#### Scenario: A published process with no draft appears

- **WHEN** a process has published versions and no draft
- **THEN** the row renders the latest version and its hash, and offers
  creating a draft rather than opening one

#### Scenario: Discarding removes only the draft

- **WHEN** an author confirms discard for a process with published versions
- **THEN** the draft disappears from the list and the published version and
  hash still render

#### Scenario: A process outside the actor's lists stays hidden

- **WHEN** an actor holds `system:developer`
- **AND** the actor is on process A's Developer list but not process B's
- **AND** both processes have published versions
- **THEN** the list shows process A's row
- **AND** the list omits process B's row

#### Scenario: An admin sees every process

- **WHEN** an actor holding `ADMIN_ROLE` opens `/processes`
- **THEN** the list shows every process, regardless of that actor's own
  Developer or Owner lists

### Requirement: Creating a new process mints a prefixed id client-side

Creating a process SHALL mint a `proc_`-prefixed UUIDv4 id in the browser.
It SHALL use the minting path the Draft model already uses for every other
entity kind. That path generates `${prefix}_${crypto.randomUUID()}` and
parses it through the contract's own branded id schema. Creating SHALL then
write the row with a `PUT /drafts/:processId` at `revision = 0`. There SHALL
be no separate create-then-save round trip and no server-side id allocation.

The `/processes` screen SHALL offer the create-new-process action only to an
actor holding `CREATE_ROLE`. This is a presentational check alone. The
`PUT /drafts/:processId` call it issues carries the authoritative check, per
`process-drafts`.

Creating SHALL first offer a choice of starting body. The empty choice SHALL
seed the body the studio seeds today. The template choice SHALL seed the body
and the layout of a template the author picks. The picker SHALL list the
templates the account may read.

A process seeded from a template SHALL claim no base version, because a
template is no published version.

#### Scenario: A new process is one round trip

- **WHEN** an author holding `CREATE_ROLE` creates a new process
- **THEN** the browser issues exactly one `PUT /drafts/:processId`, with
  `revision` 0, and the process id carries the `proc_` prefix

#### Scenario: The empty choice behaves as before

- **WHEN** an author creates a new process and picks the empty choice
- **THEN** the draft body declares the base locale and nothing else

#### Scenario: The template choice seeds body and layout

- **WHEN** an author creates a new process from a template
- **THEN** the draft holds that template's body and layout
- **AND** the draft has no base version

#### Scenario: An author with no readable template still creates a process

- **WHEN** an author creates a new process while no template exists
- **THEN** the picker offers the empty choice and states that no template
  exists

#### Scenario: The screen hides the create action without the create role

- **WHEN** an actor holds `system:developer` but not `CREATE_ROLE`
- **THEN** the `/processes` screen offers no create-new-process action

### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft model
(`draft/`), UI-chrome i18n, and live validation. It SHALL also carry over the
structural panels (`panels/`). These panels are steps, paths, timers, actions,
subprocess spec, view editor, field catalog, data sources, and contract.

The draft routes replace file-based persistence. `GET /drafts/:processId` loads
the draft. `PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be one tabbed process surface. The
`studio-process-tabs` capability states the tab row and its eleven tabs. The
canvas stands on the Canvas tab. A steps rail and a step page stand on the
Steps tab, and the `studio-step-page` capability states both.

Seven tabs carry a process-wide subject. They are Fields, Data sources, Paths,
Forms, Field matrix, Contract and Changes. Checks takes the tenth tab. Access
takes the eleventh. Each tab stays reachable whether or not the author has
picked a step.

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
guard's issue therefore names the path rather than the step. A count over the step's own
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
persisted draft rather than the in-browser draft state. When local changes remain
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

The eleven tabs SHALL sit on a routed surface rather than behind a dialog.
The path SHALL read `/processes/:id/edit/:tab`. Here `:tab` is one of `canvas`,
`steps`, `fields`, `dataSources`, `paths`, `forms`, `matrix`, `contract`,
`changes`, `checks` or `access`.

That path SHALL be a sub-state of the `edit` route. It rides as an optional field
on the same route object, the shape `formStepId` already takes. The
`studio-form-editor` capability routes its own screen that way.

An unrecognized `:tab` SHALL fall back to the Canvas tab. The routing table
already answers an unrecognized path with the process list, and this is that rule
one level down.

The surface SHALL stand the tab row above one body. The body SHALL hold the open
tab alone. No rail of tab names SHALL stand beside it. The rail's one-line
summary SHALL stand in the studio's area nav rather than at the surface's
bottom edge.
See the `studio-checks-rail` capability for what the rail carries there.

A tab SHALL fill the body. The tab row above it SHALL keep every other tab one
click away. The surface therefore does not need a control back to the canvas.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `tab` and `formStepId`
matches.

<!-- "Show on the canvas" repeats the control's own name, so the word stays. -->
<!-- antislop: allow synonym-rotation -->
Choosing a "Show on the canvas" control SHALL open the Canvas tab with that step
preselected. The Canvas tab SHALL read the target on every change rather than
only once at mount. Reaching it from another tab therefore still selects the
step.

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
- **THEN** the surface reopens on the Contract tab instead of Canvas

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Back leaves the screen rather than the process

- **WHEN** the author reaches the Fields tab from the Canvas tab and presses
  the browser's Back control
- **THEN** the Canvas tab returns, and the draft keeps every edit

#### Scenario: Show on the canvas preselects a step

- **WHEN** the author picks "Show on the canvas" on a used-in row of the
  Fields tab
- **THEN** the Canvas tab opens and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the author loads `/processes/:id/edit/nonsense`
- **THEN** the Canvas tab opens, and the surface reports no issue

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

<!-- antislop: allow synonym-rotation -->

## ADDED Requirements

### Requirement: A process's Access surface manages its Developer, Owner and Reader lists

A process's edit screen SHALL offer an Access surface to an actor listed as
its Developer or its Owner. That listing follows the `process-access-roles`
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
