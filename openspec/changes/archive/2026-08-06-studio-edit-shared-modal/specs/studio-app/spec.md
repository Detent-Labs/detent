## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- The requirement title below must match the existing spec's title exactly for archive merge; it is not open for rewording here. -->
### Requirement: Editing is a canvas-primary surface with the carried-over panels as an inspector, loading and saving against the draft routes

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

The process header SHALL stay on the Structure surface, above the
editing well. It carries `baseLocale`, and this capability requires an
author to declare a non-English base locale without leaving that
surface. The shared modal SHALL NOT hold it.

Three links SHALL sit at the top of the Structure surface: Fields, Data
sources, Contract. Each SHALL open a shared modal dialog straight to
its own view. These three views cover the whole process, not one step.
The links stay reachable whether or not the author has selected a step
on the canvas.

The links SHALL belong to the Structure surface alone. The screen SHALL
NOT offer them while the JSON surface is active. All three views mutate
the draft body, and the `studio-json-view` capability requires that no
draft-body-mutating control stays reachable there.

This change touches only where the screen mounts each panel and how an
author reaches it. What each panel validates, mutates, or persists
stays the same.

Every inline missing-translation warning SHALL survive the move. Six
`LocalizedTextInput` sites carry one.

- the process label, which stays on the screen
- a step's label and description, which move into the section index's
  identity section
- a field's label and description, and a field option's label, which
  move into the modal's Fields view

Live validation SHALL remain exactly what it is today. It runs the
engine's own publish-time chain in the browser and reports issues in
place. It SHALL NOT block saving, since a work-in-progress draft is
normally invalid.

The section index SHALL carry one issue count for the selected step as
a whole. That count SHALL cover the step's own issues, and the issues of
its paths, timers and actions. Here `resolveLoc` returns the deepest
entity it finds. A guard's issue therefore names the path, not the step.
A count over the step's own id alone would read zero on such a step.

The shared modal's rail SHALL carry one issue count per view. Both
counts SHALL use the same visual tone. The rest of the studio area
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

#### Scenario: A Structure-surface link opens the shared modal

- **WHEN** the developer clicks the Fields, Data sources, or Contract
  link at the top of the Structure surface
- **THEN** the shared modal dialog opens to that view, and the canvas
  stays visible behind the dimmed backdrop

#### Scenario: A link opens the shared modal with no step selected

- **WHEN** the developer clicks one of those links before selecting any
  step on the canvas
- **THEN** the shared modal dialog still opens to that view

#### Scenario: The JSON surface renders no link into the shared modal

- **WHEN** the developer switches to the JSON surface
- **THEN** the three links are absent, and no control on screen opens
  the shared modal

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

## ADDED Requirements

### Requirement: The shared editing modal keeps every change and states so

The shared modal SHALL carry two chrome bars and no more. The header
names the open view. The footer holds one Close control.

The modal SHALL carry no Save control. Every change an author makes
inside it SHALL write straight into the in-browser draft. That is how
the panels write today. The screen's own Save, Discard and Publish
toolbar SHALL remain the only thing that persists.

Close SHALL discard nothing. The footer SHALL state that plainly, so
Close never reads as a cancel.

A panel's own unsubmitted input SHALL survive a Close too. The contract
panel holds a half-typed outcome name in component state. The data
sources panel fetches its list keys on mount. The modal therefore stays
mounted for as long as the Structure surface is active. Opening it calls
`showModal()` on the already-mounted element, and Close calls `close()`.

A left rail SHALL list the three views. Each entry SHALL carry two
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

#### Scenario: Closing the modal keeps every change

- **WHEN** the developer adds a field in the modal and then clicks Close
- **THEN** the draft still carries that field, and the screen's toolbar
  still reports unsaved changes

#### Scenario: Closing the modal keeps a half-typed outcome name

- **WHEN** the developer types an outcome name in the Contract view,
  clicks Close without adding it, then reopens that view
- **THEN** the typed text is still in the input

#### Scenario: The modal offers no Save of its own

- **WHEN** the developer inspects the open modal
- **THEN** it carries one Close control and no Save control, and the
  footer states that Close keeps every change

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

#### Scenario: The modal keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has
  a `label` carrying the base-locale value but no `de` value
- **THEN** the modal's Fields view shows the missing-translation warning
  next to that field's label input
