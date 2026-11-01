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

<!-- antislop: allow trailing-negation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The steps rail's row SHALL carry one issue count for the step as a whole. That
count SHALL cover the step's own issues, and the issues of its paths, timers and
actions. Here `resolveLoc` returns the deepest entity it finds. A guard's issue
therefore names the path, not the step. A count over the step's own id alone
would read zero on such a step.

Each section heading on the step page SHALL carry its own count. It counts the
issues `resolveLoc` resolves to an entity that section holds. A path's issue
counts at the paths section, and a timer's at the time-limit section. A check on
the step's key counts at More. A check on its name or description counts on no
header, and stands at its own line. The `studio-step-page` capability states the
section register those counts sit in.

A tab SHALL carry one issue count for its own subject. Every count SHALL take the
same visual tone. The rest of the studio area already takes that tone for issues.

<!-- antislop: allow trailing-negation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The header bar SHALL offer a **Publish** action (see the `studio-publish`
capability). It calls `POST /drafts/:processId/publish` against the currently
persisted draft, not the in-browser draft state. When local changes remain
unsaved, the dialog SHALL say that publishing saves them first. It must not
publish stale or ahead-of-server content. On success, the header bar SHALL state
the new version number. The Settings tab's Developer view SHALL hold its
`definitionHash`.

#### Scenario: A draft round-trips through the panels

- **WHEN** the author loads a draft, adds a step through the panels, saves
  the draft, and reloads it
- **THEN** the panels carry the new step identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** the author loads a draft, repositions a step, connects it to
  another step, then saves and reloads it
- **THEN** the Map tab draws the new position and path identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for a draft carrying unsaved work
- **THEN** the surface prints the issues, offers Save, and the save succeeds

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
- **THEN** the step page's paths section reads a count of one
- **AND** the steps rail row's count also reads one

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the author picks Publish in the header bar while local changes
  remain unsaved
- **THEN** the dialog says publishing saves them first, and the studio does
  not call `POST /drafts/:processId/publish` until the save completes

#### Scenario: The screen confirms a successful publish

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the header bar prints the returned version number
- **AND** the Settings tab's Developer view prints the `definitionHash`
