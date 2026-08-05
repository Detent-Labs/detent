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

Live validation SHALL remain exactly what it is today. It runs the
engine's own publish-time chain in the browser and reports issues in
place. It SHALL NOT block saving, since a work-in-progress draft is
normally invalid.

The section index SHALL carry one issue count for the selected step as
a whole. The shared modal's rail SHALL carry one per view. Both SHALL
use the same visual tone. The rest of the studio area already uses that
tone for issues.

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

A left rail SHALL list the three views with their entity counts. For
the Fields view the rail SHALL also list the field catalogue and an Add
entry. A group field's children indent one level under it. Contract
holds a single editor, so its rail entry SHALL carry no sub-list.

The rail SHALL cap indentation at two levels. A group field's children
indent once. A field nested deeper SHALL take its own top-level rail
entry rather than a deeper indent. This is a rail-rendering rule only:
the draft's own field tree SHALL keep whatever depth it declares.

#### Scenario: Closing the modal keeps every change

- **WHEN** the developer adds a field in the modal and then clicks Close
- **THEN** the draft still carries that field, and the screen's toolbar
  still reports unsaved changes

#### Scenario: The modal offers no Save of its own

- **WHEN** the developer inspects the open modal
- **THEN** it carries one Close control and no Save control, and the
  footer states that Close keeps every change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a
  contract
- **THEN** the rail's Fields entry reads three, its Data sources entry
  reads two, and its Contract entry carries no sub-list

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry, not a third
  indent level. The draft keeps its own nesting
