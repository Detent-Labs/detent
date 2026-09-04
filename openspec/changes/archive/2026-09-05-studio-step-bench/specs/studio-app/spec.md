## REMOVED Requirements

### Requirement: The canvas dock's Field matrix tab carries no toolbar or bulk badges

**Reason**: The dock goes with `studio-canvas`'s bench. Its Field matrix
tab goes with it, so there is no second mount left to constrain.

**Migration**: None. The panels screen's field matrix keeps its toolbar,
legend and bulk badges, and the requirements that state them stand.

## RENAMED Requirements

- FROM: `### Requirement: The Steps panel's configured-field count reads field entries alone`
- TO: `### Requirement: The Form section's configured-field count reads field entries alone`

## MODIFIED Requirements

<!-- Why: `edit` names the route; a change names a draft mutation. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft
model (`draft/`), UI-chrome i18n, and live validation. It SHALL also
carry over the structural panels (`panels/`). These panels are steps,
paths, timers, actions, subprocess spec, view editor, field catalog,
data sources, and contract. The draft routes replace file-based
persistence. `GET /drafts/:processId` loads the draft.
`PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be the step bench the `studio-canvas`
capability states. A collapsible canvas ribbon spans the top. A steps
register stands on the left, and the selected step's configuration on the
right. That configuration is a register of always-visible sections.

The process header's `⋮` overflow menu SHALL carry `baseLocale`. This
capability requires an author to declare a non-English base locale
without leaving the Structure surface. The panels screen SHALL NOT hold
it.

Six links SHALL sit below the steps in the steps register, under a
Process heading. They are Fields, Data sources, Contract, Field matrix,
Changes and Paths. Each link SHALL navigate to the panels screen, opened
at its own view. These six views cover the whole process, not one step. The links
stay reachable whether or not the author has selected a step.

The links SHALL belong to the Structure surface alone. The screen SHALL
NOT offer them while the JSON surface is active. Four of the six views
mutate the draft body, and the `studio-json-view` capability requires
that no draft-body-mutating control stays reachable there.

This requirement governs where the screen mounts each panel, and how an
author reaches it. What each panel validates, mutates, or persists
stays the same.

Every inline missing-translation warning SHALL survive the move. Six
`LocalizedTextInput` sites carry one.

- the process label, which stays on the screen
- a step's label and description, which sit in the configuration pane's
  masthead
<!-- Why: a field option is a catalog term; configuration names the pane. -->
<!-- antislop: allow synonym-rotation -->
- a field's label and description, and a field option's label, which
  sit in the panels screen's Fields view

Live validation SHALL remain exactly what it is today. It runs the
engine's own publish-time chain in the browser and reports issues in
place. It SHALL NOT block saving, since a work-in-progress draft is
normally invalid.

The masthead SHALL carry one issue count for the selected step as a
whole. That count SHALL cover the step's own issues, and the issues of
its paths, timers and actions. Here `resolveLoc` returns the deepest
entity it finds. A guard's issue therefore names the path, not the step.
A count over the step's own id alone would read zero on such a step.

Each section head in the configuration pane SHALL carry its own count.
It counts the issues `resolveLoc` resolves to an entity that section
holds. A path's issue counts on Paths and a timer's on Timers. An issue
`resolveLoc` resolves to the step itself counts on the masthead alone.

The panels screen's index rail SHALL carry one issue count per view.
Every count SHALL use the same visual tone. The rest of the studio area
already uses that tone for issues.

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

- **WHEN** the developer clicks one of the six links in the register's
  Process section
- **THEN** the panels screen opens at that view, and the address bar
  carries that view's own path

#### Scenario: A link opens the panels screen with no step selected

- **WHEN** the developer clicks one of those links before selecting any
  step
- **THEN** the panels screen still opens at that view

#### Scenario: The JSON surface renders no link into the panels screen

- **WHEN** the developer switches to the JSON surface
- **THEN** the six links are absent, and no control on screen reaches
  the panels screen

#### Scenario: A path's issue counts on the Paths head

- **WHEN** a step's path carries a failing guard
- **THEN** the Paths head shows a count of one, and the masthead's count
  also reads one

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

<!-- Why: `edit` names the route; a change names a draft mutation. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen is a routed sub-state of the edit screen

The six process-wide views SHALL sit on a routed screen, not behind a
dialog. The path SHALL read `/processes/:id/edit/panels/:view`. Here
`:view` is one of `fields`, `dataSources`, `contract`, `matrix`,
`changes` or `paths`.

That path SHALL be a sub-state of the `edit` route. It rides as an
optional field on the same route object, the shape `formStepId` already
takes. The `studio-form-editor` capability routes its own screen that
way.

An unrecognized `:view` SHALL fall back to the edit screen's own
bench. The routing table already answers an unrecognized path with the
process list, and this is that rule one level down.

The screen SHALL lay out two columns, in order: an index rail and the
open view. The checks rail SHALL dock its one-line summary at the
screen's bottom edge instead of standing in a third column. See the
`studio-checks-rail` capability for what the rail shows here.

The panels screen SHALL replace the bench while it is open. It SHALL
offer one control back to it.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `panel` and
`formStepId` matches. Choosing a "Show on the canvas" control SHALL
navigate back to the bench with that step preselected. The bench
SHALL read the target whenever it changes, not only once on mount.
Navigating there from an already-mounted panels screen therefore still
selects the step.

Once read, the screen SHALL replace that history entry with the plain
`edit` route. It SHALL NOT leave the step target addressable. The
browser's Back control therefore still returns to the panels screen
the navigation came from, per `unified-shell`'s navigation
requirement.

The two columns SHALL fill the height the screen's header rows leave.
They SHALL stop above the docked summary, and above the floor the bench
uses. A taller window therefore shows taller columns, and no
empty band sits below them.

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

#### Scenario: The Changes and Paths views have addresses too

- **WHEN** the developer opens the Changes view
- **THEN** the address bar reads `/processes/:id/edit/panels/changes`,
  and loading it directly opens the same view

#### Scenario: A reload keeps the open view

- **WHEN** the developer reloads the browser on the Contract view
- **THEN** the screen reopens on the Contract view, not on the bench

#### Scenario: Back leaves the screen rather than the process

<!-- Why: the `edit` route is a route name; a change is a draft mutation. -->
<!-- antislop: allow synonym-rotation -->
- **WHEN** the developer reaches the panels screen from the bench and
  presses the browser's Back control
- **THEN** the bench returns, and the draft keeps every change

#### Scenario: Show on the canvas preselects a step

- **WHEN** the developer chooses "Show on the canvas" on a used-in row
  of the Fields view
- **THEN** the bench returns and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the developer loads `/processes/:id/edit/panels/nonsense`
- **THEN** the edit screen's bench renders, and the screen reports no
  issue

## ADDED Requirements

<!-- Why: "Changes" is this view's own name, and "change" is what a publish -->
<!-- does to a published version. The rule reads both as synonyms for -->
<!-- the "edit" in the route name. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's Changes view shows what a publish would change

The Changes view SHALL show the difference between the draft and the
version the draft sits on. It answers the question a publish raises.

The view SHALL read the draft as the editor holds it, including edits the
developer has not saved. The `process-version-inspection` capability's
versions screen reads the saved draft from the server instead.

Both use one difference computation. The view SHALL pass the base version
first and the draft second. Every entry then runs from the published value
toward the draft value, the direction a publish moves.

That order decides how an entry reads. A key the draft adds reads as added,
and a key it drops reads as removed. The reverse order inverts both, and it
prints a changed entry's two values the wrong way round.

A list compares whole. The difference computation treats an array as one
value. A draft that adds one catalog field reports one changed entry over
that whole list. It reports no added entry.

<!-- The compile pass's cancel sink is the engine's own term. -->
<!-- antislop: allow synonym-rotation -->
The view SHALL strip the compiled content from the base version's body
first. The versions screen gives that body the same treatment. The compile
pass injects a cancel sink, and no developer authored it.

A process with no base version SHALL read as a first publish. The view says
so, and it shows no difference.

An empty difference SHALL read as such. The view says the draft matches its
base version.

The index rail's Changes entry SHALL show the difference's entry count.

#### Scenario: A draft over a published version shows its difference

- **WHEN** the developer opens the Changes view on a draft of a published
  process
- **THEN** the view shows what the draft changes against its base version

#### Scenario: An unsaved edit reaches the view

- **WHEN** the developer renames a step and opens the Changes view without
  saving
- **THEN** the view lists that rename
- **AND** the entry's first value is the published label, and its second is
  the unsaved one

#### Scenario: A publish moves the base and the view follows it

- **WHEN** the developer publishes the draft from the header bar and
  returns to the Changes view
- **THEN** the view reads the newly published version, with no reload
- **AND** it reports that the draft matches that version

#### Scenario: A never-published process reads as a first publish

- **WHEN** the developer opens the Changes view on a process with no base
  version
- **THEN** the view says the publish would be the first one, and it shows
  no difference

#### Scenario: A draft matching its base reads as no difference

- **WHEN** the developer opens the Changes view on a draft nobody has edited
  since it seeded from its base version
- **THEN** the view says the draft matches that version

### Requirement: The panels screen's Paths view lists every path in the process

The Paths view SHALL show one row per path across the whole draft. The five
columns are source step, trigger, priority, guard and target. A canvas
draws a path as a line, and a line hides those five values.

Rows SHALL follow the draft's own order. The steps order the rows first,
and each step's own path order orders the rows inside it.

A path with no guard SHALL read as such, and so SHALL a path with no
priority. The view states each absence rather than leaving a blank cell
unexplained. A guard is independent of the trigger. A manual path can carry
one. That guard decides whether the participant may take the path, so the
view SHALL show it.

A draft with no path at all SHALL show an empty state naming that fact.

The row derivation SHALL live in a pure module with `bun:test` coverage,
the convention `packages/web/src/areas/app/screens/inboxLogic.ts` sets. It
takes the draft's steps and returns the rows. The test needs no DOM and no
rendering.

The index rail's Paths entry SHALL show the path count.

#### Scenario: Every path takes a row

- **WHEN** the developer opens the Paths view on a draft holding four
  steps and five paths
- **THEN** the view shows five rows

#### Scenario: A row names its source step and its target step

- **WHEN** the view shows a path's row
- **THEN** that row names the step the path leaves and the step it enters

#### Scenario: A manual path with no guard reads as carrying none

- **WHEN** a step's manual paths carry no guard and no priority
- **THEN** each of their rows reads as carrying no priority and no guard

#### Scenario: A manual path carrying a guard shows it

- **WHEN** a manual path carries a guard
- **THEN** its row shows that guard's CEL source

#### Scenario: An automatic path shows its priority and its guard source

- **WHEN** a step carries two automatic paths, one guarded
- **THEN** each row shows that path's priority
- **AND** the guarded row shows its guard's CEL source

#### Scenario: A draft with no path shows an empty state

- **WHEN** the developer opens the Paths view on a draft holding no path
- **THEN** the view says the process has no path yet

#### Scenario: The row derivation holds without rendering

- **WHEN** a test gives the row derivation a list of steps
- **THEN** it returns one row per path, in the draft's own order
- **AND** the test needs no DOM or canvas rendering
