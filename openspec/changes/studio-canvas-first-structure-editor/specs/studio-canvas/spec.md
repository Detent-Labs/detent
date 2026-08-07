<!-- antislop: allow-file passive-voice synonym-rotation -->
<!-- Why passive-voice: a scenario states an outcome, and the actor is the
     system under test. Why synonym-rotation: several scenarios below are
     copied verbatim from the live studio-canvas spec to preserve fidelity
     (the MODIFIED-requirement convention), and "Discard" is a literal
     button label, not a synonym choice. Matches
     openspec/specs/studio-condition-builder's own precedent for both. -->
## RENAMED Requirements

- FROM: `### Requirement: Selecting a node or edge expands its detail in a permanent inspector beside the canvas`
- TO: `### Requirement: Selecting a node or edge shows its detail in a permanent, selection-driven inspector beside the canvas`
- FROM: `### Requirement: Paths are created by dragging from a source step to a target step`
- TO: `### Requirement: Dragging to a step creates a path; dragging to empty canvas creates a step and a path`

## MODIFIED Requirements

### Requirement: Selecting a node or edge shows its detail in a permanent, selection-driven inspector beside the canvas

`StepsPanel` SHALL mount as a fixed-width inspector column beside the
canvas at all times.

When no step or path is selected, the inspector SHALL show a no-selection
state. It SHALL NOT show a list of every step in the draft.

Selecting a step node on the canvas SHALL show that one step's sections
in the inspector. This replaces any no-selection state, or a prior
step's or path's sections. Each section SHALL carry its own entity
count. The sections are identity (key, label, description, type,
terminal, outcome), assignment, paths, timers, actions, subprocess spec,
and view.

The inspector SHALL carry every section the step card body holds today.
It SHALL NOT drop the assignment section. `studio-app` requires a
no-assignment warning beside the assignment editor. That requirement
has no anchor without the section.

The identity section SHALL keep the missing-translation warning beside
the step's label input and beside its description input. Those are two
of the six `LocalizedTextInput` sites `studio-app` requires a warning
at.

The identity section SHALL also carry a control to set the selected
step as the draft's `initialStep`. Today only `StepsPanel`'s
always-visible select, above its step list, controls
`workflow.initialStep`. The no-selection state removes that list, so
the control moves into the identity section instead.

The subprocess spec section SHALL keep the cross-process check fieldset
beside the spec editor. That fieldset holds the file input which loads a
child body, and `checkSubprocessChildRefs` runs against nothing without
it. Dropping the fieldset would remove the only route to that check.

Selecting a path edge SHALL resolve to its *source* step and show that
step's inspector the same way. A path is not independently addressable.
It only exists nested under its step. The selected path's own row
SHALL also highlight within the expanded paths section, through a new
`selectedPathId` prop on `PathsPanel`.

Choosing any section other than view SHALL expand that one section within
the inspector. Every other section stays collapsed. `StepsPanel` already
nests `PathsPanel` under the paths section. No panel's own fields,
validation, or mutation logic SHALL differ from today's. Only how an
author reaches each section is different.

Choosing the view entry SHALL instead open the form editor (see the
`studio-form-editor` capability). A step's form benefits from a canvas
of its own, not an inline scroll target. This is the one section entry
that opens a dialog instead of expanding inline. `StepsPanel` SHALL hold
no inline view section. The inspector then carries one route to a step's
view, not two.

A section entry is a disclosure. It SHALL therefore be a
`<button type="button">`. It SHALL carry `aria-expanded` for its own
state, and `aria-controls` naming the section it opens. The
`spa-accessibility` capability requires that shape of every disclosure.

The view entry opens a dialog rather than a section. It SHALL instead
carry `aria-haspopup="dialog"` and no `aria-controls`. A disclosure's
`aria-expanded` describes a region the document already holds. A modal
dialog is not that region.

Creating the first step in an empty draft SHALL NOT depend on a prior
selection. The palette stays reachable no matter what is selected; see
the palette requirement below. The inspector needs no always-visible
step list of its own to satisfy this.

The no-selection state SHALL carry `StepsPanel`'s existing "+ Add
step" button. Removing the always-visible step list removes what
hosts that button today. The button relocates to the no-selection
state instead. It stays reachable there, beside the palette's own way
to add a step.

#### Scenario: The empty draft shows a no-selection state

- **WHEN** a draft with no step selected and no path selected is open
- **THEN** the inspector shows a no-selection state, not a list of
  steps
- **AND** the no-selection state shows the "+ Add step" button

#### Scenario: Selecting a step shows its sections

- **WHEN** the developer clicks a step node on the canvas
- **THEN** the inspector shows that step's sections with their entity
  counts, replacing whatever the inspector showed before

#### Scenario: Choosing a non-view section expands it inline

- **WHEN** the developer chooses the identity, assignment, paths,
  timers, actions, or subprocess spec entry for the selected step
- **THEN** the inspector expands that section, and every other section
  stays collapsed

#### Scenario: The inspector carries the assignment section

- **WHEN** the developer selects a non-terminal step carrying no
  `assignment`
- **THEN** the inspector lists an assignment section, and choosing it
  expands the assignment editor with its no-assignment warning beside
  it

#### Scenario: The identity section keeps its translation warnings

- **WHEN** the studio's `contentLocale` is `de`, a step's `label`
  carries the base-locale value but no `de` value, and the developer
  chooses the identity section
- **THEN** the missing-translation warning renders beside that step's
  label input

#### Scenario: The identity section sets the draft's initial step

- **WHEN** the developer chooses the identity section for a selected
  step and activates its "set as initial step" control
- **THEN** the draft's `workflow.initialStep` names that step's id

#### Scenario: The subprocess spec section keeps the cross-process check

- **WHEN** the developer selects a step of type `subprocess` and chooses
  the subprocess spec section
- **THEN** the cross-process check fieldset renders beside the spec
  editor, and its file input still loads a child body

#### Scenario: The step issue count covers an issue on its path

- **WHEN** a step carries no issue of its own and one of its paths
  carries a guard that fails validation
- **THEN** the inspector reports one issue for that step

#### Scenario: A section entry expands with the keyboard

- **WHEN** a keyboard user tabs to a non-view section entry and presses
  Enter or Space
- **THEN** the section expands, `aria-expanded` reads true, and pressing
  again collapses it

#### Scenario: Choosing the view entry opens the form editor

- **WHEN** the developer chooses the view entry for the selected step
- **THEN** the form editor dialog opens for that step, and no section
  expands inline within the inspector

#### Scenario: Selecting a path edge shows its source step's inspector

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** the inspector shows the section list for that edge's source
  step
- **AND** the clicked path's own row highlights within the paths
  section

#### Scenario: Deselecting returns the inspector to the no-selection state

- **WHEN** the developer clicks empty canvas space while a step or path
  is selected
- **THEN** the inspector returns to the no-selection state

#### Scenario: A first step is addable with nothing selected

- **WHEN** an empty draft has no step and nothing is selected
- **THEN** the palette's Step entry stays visible and usable

### Requirement: Dragging to a step creates a path; dragging to empty canvas creates a step and a path

The canvas SHALL offer a connect handle on each step node. Dragging from
a handle and releasing over another step SHALL create a path from the
source to the target. It SHALL use the same path-creation method
`PathsPanel`'s own "add path" action already calls. It SHALL default to
that step's existing trigger type (manual or automatic) when one is
already set.

Releasing a connect-handle drag over empty canvas SHALL first check
the candidate path's trigger consistency. This is the same
`checkConnection` check the drag-to-a-step gesture already runs.

When that check rejects the candidate, the release SHALL create
neither a step nor a path. It SHALL surface the same inline rejection
the drag-to-a-step gesture already shows for a rejected candidate.

When that check accepts the candidate, the release SHALL create a new
step at the drop point. It SHALL then create a path from the source
step to that new step. Both SHALL use the same methods `StepsPanel`'s
"add step" button and `PathsPanel`'s "add path" action already call.
Creating the step before the path means a rejected candidate never
leaves a step behind with no path to it.

#### Scenario: A completed drag to an existing step creates a path

- **WHEN** a connect-handle drag starts on step A and is released over
  step B
- **THEN** a path from A to B exists in the Draft model, creatable
  through the same call `PathsPanel` uses

#### Scenario: A completed drag to empty canvas creates a step and a path

- **WHEN** a connect-handle drag starts on step A and is released over
  empty canvas
- **AND** the candidate path's trigger consistency passes
- **THEN** a new step exists at the drop point
- **AND** a path from A to that new step exists in the Draft model

#### Scenario: A trigger-inconsistent drag to empty canvas creates nothing

- **WHEN** a connect-handle drag starts on step A, which already carries
  an automatic path with no `priority`
- **AND** the drag is released over empty canvas
- **THEN** no new step exists at the drop point
- **AND** no new path exists in the Draft model
- **AND** the same inline rejection the drag-to-a-step gesture shows
  for a trigger-inconsistent candidate appears

## ADDED Requirements

### Requirement: The canvas edit screen lays out a palette, the canvas, the inspector, and a checks rail

The canvas edit screen SHALL show four columns, in order. They are a
place-on-canvas palette, the canvas, the selection-driven inspector, and
the `studio-checks-rail` capability's checks rail.

#### Scenario: All four columns appear

- **WHEN** the canvas edit screen loads
- **THEN** the palette, the canvas, the inspector, and the checks rail
  each appear as their own column

### Requirement: A palette offers Step, Subprocess, and End as an always-available way to add a step

The canvas edit screen SHALL show a palette listing Step, Subprocess, and
End. Each entry SHALL be a drag source. Dragging one onto the canvas
SHALL add a step of that kind at the drop point. That SHALL use
the same Draft-mutation method `StepsPanel`'s own "add step" action
already calls.

The palette SHALL stay visible and usable regardless of canvas selection.

#### Scenario: Dragging a palette entry adds a step

- **WHEN** the developer drags the Step entry from the palette onto the
  canvas
- **THEN** a new step of type `task` exists at the drop point
- **AND** it is added through the same method `StepsPanel`'s "add step"
  action calls

#### Scenario: The palette works with nothing selected

- **WHEN** nothing is selected on the canvas
- **THEN** every palette entry stays visible and usable

### Requirement: A process-identity header bar shows draft and publish status

The canvas edit screen SHALL show a header bar above the four-column
layout. It SHALL show the process name and the draft's revision badge.
It SHALL also show dirty state and, after a publish, the version and
hash. Today, `DraftToolbar` computes both. This design lifts them into
`EditorArea` as controlled props, the same way it already lifts
`saveState`.

The header bar SHALL also show a last-saved time. That time is new,
client-only state: `EditorArea` sets it on every successful save.
`DraftToolbar` does not track it today.

The header bar SHALL NOT duplicate `DraftToolbar`'s Save, Discard, and
Publish actions. It is a read-only summary of state `EditorArea` owns or
passes through, not a second copy of `DraftToolbar`'s own logic.

#### Scenario: The header bar shows an unsaved draft's state

- **WHEN** the draft has unsaved changes
- **THEN** the header bar shows the process name, the draft's revision
  badge, and a dirty indicator

#### Scenario: The header bar shows a just-published version

- **WHEN** a publish succeeds
- **THEN** the header bar shows the published version and its hash
  prefix

### Requirement: A step node on the canvas offers an inline rename

The canvas SHALL let the developer rename a step's label directly on
its node, without opening the inspector's identity section. Committing
the rename SHALL write `step.label` through the same Draft mutation the
identity section's label input already calls.

#### Scenario: Double-clicking a node's label opens an inline text field

- **WHEN** the developer double-clicks a step node's label on the canvas
- **THEN** a text field opens on the node, seeded with the step's current
  label

#### Scenario: Committing the inline rename updates the step's label

- **WHEN** the developer edits a node's inline text field and commits it
- **THEN** the step's `label` updates through the same Draft mutation the
  identity section's label input calls

### Requirement: The identity section's type and terminal controls render as a "performed by" segmented control

The identity section SHALL render the step's existing `type` and
`terminal` fields as a three-option segmented control, labeled
"performed by". The options are participant (type `task`), subprocess
(type `subprocess`), and nothing/terminal. This SHALL set the same
fields the identity section's type control sets today; it adds no new
field.

#### Scenario: Choosing a "performed by" option sets the step's type

- **WHEN** the developer selects the subprocess option in a step's
  "performed by" control
- **THEN** the step's `type` becomes `subprocess`, the same field the
  identity section's type control already sets

### Requirement: The view entry shows form status and a "Build the form" label

The view entry SHALL show a status summary of the step's form. For
example, the summary might read how many fields carry a view entry.
It SHALL also show a "Build the form" label alongside that summary.

This changes the entry's copy only. Choosing it still opens
`FormEditorDialog` through the same call it uses today. No section
expands inline.

#### Scenario: The view entry shows a form-status summary

- **WHEN** the developer selects a step carrying a partially configured
  view
- **THEN** the view entry shows a status summary of the form and a
  "Build the form" label

### Requirement: The step inspector's "Developer view" discloses the step's raw data

The step inspector SHALL carry a collapsible "Developer view"
disclosure, an eighth entry beside the seven content sections. Expanding
it SHALL show the selected step's raw JSON. This is a read-only view;
it is distinct from the path-guard's CEL "Developer view" toggle the
`studio-condition-builder` capability describes.

#### Scenario: The step inspector's "Developer view" shows raw JSON

- **WHEN** the developer expands a selected step's "Developer view"
  disclosure
- **THEN** the step's raw underlying JSON renders read-only
