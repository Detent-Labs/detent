## ADDED Requirements

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

<!-- antislop: allow synonym-rotation -->
<!-- Why: "edit screen" is this screen's fixed name, set by the route
     `/processes/:id/edit` and by `EditScreen.tsx`. The rule reads it as a
     synonym for the "change" a draft holds, which is a different thing. -->
Three links SHALL sit in the canvas edit screen's rail, under a Process
heading: Fields, Data sources, Contract. See the `studio-canvas`
capability's layout requirement for the rail. Each link SHALL navigate
to the panels screen, opened at its own view. These three views cover
the whole process, not one step. The links stay reachable whether or
not the author has selected a step on the canvas.

The links SHALL belong to the Structure surface alone. The screen SHALL
NOT offer them while the JSON surface is active. All three views mutate
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

- **WHEN** the developer clicks the Fields, Data sources, or Contract
  link in the rail's Process section
- **THEN** the panels screen opens at that view, and the address bar
  carries that view's own path

#### Scenario: A link opens the panels screen with no step selected

- **WHEN** the developer clicks one of those links before selecting any
  step on the canvas
- **THEN** the panels screen still opens at that view

#### Scenario: The JSON surface renders no link into the panels screen

- **WHEN** the developer switches to the JSON surface
- **THEN** the three links are absent, and no control on screen reaches
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

The three process-wide views SHALL sit on a routed screen, not behind a
dialog. The path SHALL read `/processes/:id/edit/panels/:view`. Here
`:view` is one of `fields`, `dataSources` or `contract`.

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
The data sources panel fetches its list keys on mount. All three views
SHALL therefore stay mounted for as long as the panels screen is open.
Switching a view SHALL reveal and hide them, rather than mount them.

An index rail SHALL list the three views. Each entry SHALL carry two
numbers, and they SHALL read as different things. The entity count says
how many fields, data sources or outcomes the view holds. The issue
count says how many of them are wrong. Only the issue count takes the
refusal tone. An entry SHALL surface no issue count when the view holds
no issue.

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

## REMOVED Requirements

### Requirement: Editing is a canvas-primary surface with the carried-over panels as an inspector, loading and saving against the draft routes

**Reason**: Three of its scenarios name a dialog that no longer exists.
Two of its rules send the author into one. The requirement's own
subject moved. The three process-wide views are no longer an overlay
over the canvas.

**Migration**: "Editing is a canvas-primary surface, with the
process-wide views on a routed screen" above carries every rule it
held. Two of them read differently. A link navigates rather than
opening a dialog. And the index rail carrying the per-view issue count
belongs to the panels screen. Its three modal scenarios become the
matching panels-screen ones. Nothing else moves.

### Requirement: The shared editing modal keeps every change and states so

**Reason**: The overlay is gone. A requirement written around
`showModal()`, a backdrop and a Close control describes an element that
no longer exists.

**Migration**: Every rule it carried moves to "The panels screen keeps
every change and states so" above. Three read differently, because the
element differs. Close becomes leaving the screen. The modal's two
chrome bars become the screen's own. And the mounted-for-as-long-as
clause now names the panels screen, where it named the Structure
surface. The move drops no rule.
