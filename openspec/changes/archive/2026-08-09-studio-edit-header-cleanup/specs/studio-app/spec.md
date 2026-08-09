## MODIFIED Requirements

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

The process header's `⋮` overflow menu SHALL carry `baseLocale`. This
capability requires an author to declare a non-English base locale
without leaving the Structure surface. The shared modal SHALL NOT hold
it.

Three links SHALL sit in the canvas edit screen's rail, under a Process
heading: Fields, Data sources, Contract. See the `studio-canvas`
capability's layout requirement for the rail. Each link SHALL open a
shared modal dialog straight to its own view. These three views cover
the whole process, not one step. The links stay reachable whether or
not the author has selected a step on the canvas.

The links SHALL belong to the Structure surface alone. The screen SHALL
NOT offer them while the JSON surface is active. All three views mutate
the draft body, and the `studio-json-view` capability requires that no
draft-body-mutating control stays reachable there.

This proposal touches only where the screen mounts each panel and how
an author reaches it. What each panel validates, mutates, or persists
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
  link in the rail's Process section
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

### Requirement: The process header declares the process's base locale

The process header's `⋮` overflow menu SHALL carry a control that reads
and writes the process's `baseLocale`. An author SHALL be able to
declare a non-English base locale without leaving the Structure surface.

`baseLocale` decides which entry of every `LocalizedText` in the body is
mandatory, and publish requires it. Leaving it to the JSON surface alone
made a process authored only through the structural panels unpublishable.

The control SHALL write the typed value through, unvalidated. Live
validation reports a value that is not a well-formed locale code. That
is the route every other malformed authored value takes. The menu SHALL
NOT reject or correct the keystroke.

When the typed value is a well-formed locale code, the studio SHALL also
move the edited content locale to it.

Without that move, the control opens a trap. The edited content locale
decides which entry every text input writes. It also decides which
entry a newly created step or field seeds. An author who declares `de`
and keeps typing would write every value under the previous locale. Each
new entity would then report a missing `de` entry while visibly holding
text.

The studio SHALL NOT move the edited content locale for a value that is
not a well-formed locale code. A part-typed value would otherwise become
a real locale key. One character typed into any text field is enough.

#### Scenario: The header shows the draft's declared base locale

- **WHEN** the edit screen loads a draft declaring `baseLocale: "de"`
- **THEN** opening the process header's `⋮` menu shows a base-locale
  control reading `de`

#### Scenario: Declaring a base locale moves the edited content locale

- **WHEN** an author changes the process header's base-locale control to
  `de`
- **THEN** the draft body's `baseLocale` is `de`, and the edited content
  locale is `de`. A step created next seeds its label under `de`

#### Scenario: A part-typed base locale leaves the content locale alone

- **WHEN** an author has typed `d` on the way to `de`
- **THEN** the draft body's `baseLocale` is `d`, and the edited content
  locale is whatever it was before

#### Scenario: Existing text without an entry for the new base locale reports

- **WHEN** an author changes the base locale to `de` on a process whose
  labels carry only `en` entries
- **THEN** live validation reports a missing base-locale entry for every
  `LocalizedText` in the body that carries no `de` entry

#### Scenario: A malformed base locale reports as a validation issue

- **WHEN** an author types a value into the base-locale control that is
  not a well-formed locale code
- **THEN** the draft body carries that value, and live validation
  reports the issue against `baseLocale`
