## MODIFIED Requirements

### Requirement: Selecting a node or edge shows its detail in a permanent, selection-driven inspector beside the canvas

`StepsPanel` SHALL mount as a fixed-width column in the canvas edit
screen's third position. It replaces the `studio-checks-rail`
capability's checks rail there whenever the developer selects a step or
a path.

When the developer selects no step and no path, the third column SHALL
show the checks rail. It SHALL NOT show the inspector at all in that
state.

Selecting a step node on the canvas SHALL show that one step's sections
in the inspector. This replaces the checks rail, and any prior step's or
path's sections. Each section SHALL carry its own entity count. The
sections are identity (key, label, description, type, terminal,
outcome), assignment, paths, timers, actions, subprocess spec, and view.

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
it. Dropping the fieldset would leave that check with no route.

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

Choosing the view entry SHALL instead navigate to the form editor's
routed page (see the `studio-form-editor` capability). A step's form
benefits from a full-screen page of its own, not an inline scroll
target. This is the one section entry that navigates away instead of
expanding inline. `StepsPanel` SHALL hold no inline view section. The
inspector then carries one route to a step's view, not two.

A section entry is a disclosure. It SHALL therefore be a
`<button type="button">`. It SHALL carry `aria-expanded` for its own
state, and `aria-controls` naming the section it opens. The
`spa-accessibility` capability requires that shape of every disclosure.

The view entry navigates rather than opening a dialog or a section. It
SHALL carry no `aria-haspopup` and no `aria-controls`. A disclosure's
`aria-expanded` describes a region the document already holds. A
navigation target is not that region either.

Creating the first step in an empty draft SHALL NOT depend on a prior
selection. The palette stays reachable regardless of selection; see
the palette requirement below.

The checks rail's own no-selection presentation carries no "+ Add step"
button. The palette's Step entry is the sole always-reachable way to add
the first step; see the palette requirement below.

#### Scenario: An empty draft with nothing selected shows the checks rail

- **WHEN** a draft with no step selected and no path selected is open
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: Selecting a step shows its sections

- **WHEN** the developer clicks a step node on the canvas
- **THEN** the inspector shows that step's sections with their entity
  counts, replacing whatever the third column showed before

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
- **THEN** the form editor's routed page opens for that step, and no
  section expands inline within the inspector

#### Scenario: Selecting a path edge shows its source step's inspector

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** the inspector shows the section list for that edge's source
  step
- **AND** the clicked path's own row highlights within the paths
  section

#### Scenario: Deselecting swaps the column back to the checks rail

- **WHEN** the developer clicks empty canvas space while a step or path
  stays selected
- **THEN** the third column shows the checks rail again, not the
  inspector

#### Scenario: A first step is addable with nothing selected

- **WHEN** an empty draft has no step, and the developer has selected
  nothing
- **THEN** the palette's Step entry stays visible and usable

### Requirement: The canvas edit screen lays out a palette, the canvas, the inspector, and a checks rail

The canvas edit screen SHALL show three columns, in order. The first is
a rail. It holds the place-on-canvas palette. Below the palette sits the
`studio-app` capability's Process section: the Fields, Data sources, and
Contract links.

The second column is the canvas. The third column shows either the
`studio-checks-rail` capability's checks rail or the selection-driven
inspector, never both at once.

The third column SHALL show the checks rail when the developer has
selected no step and no path. It SHALL show the inspector when the
developer selects a step or a path. See the `studio-checks-rail`
capability for the rail's own collapsed presentation in the
step-selected state.

#### Scenario: All three columns appear

- **WHEN** the canvas edit screen loads
- **THEN** the rail, the canvas, and the third column each appear as
  their own column

#### Scenario: The third column shows the checks rail with nothing selected

- **WHEN** the developer has selected no step and no path
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: The third column shows the inspector once the developer selects a step

- **WHEN** the developer selects a step or a path
- **THEN** the third column shows the inspector, not the full checks
  rail

### Requirement: A process-identity header bar shows draft and publish status

The canvas edit screen SHALL show a header bar above the three-column
layout. It SHALL show the process name and the key in the mono face.
It SHALL also show the draft's revision badge and dirty state. It SHALL
show the version and hash after a publish. `EditorArea` computes all of
these as controlled props. It already lifts `saveState` the same way.

The header bar SHALL also show a last-saved time. That time is
client-only state. `EditorArea` sets it on every successful save.

The header bar SHALL show the content-locale badge the `studio-app`
capability's content-locale-switcher requirement governs. It SHALL also
show the Structure/JSON toggle.

<!-- antislop: allow synonym-rotation -->
<!-- "Discard" below is the literal button label `DraftToolbar` renders, not a synonym choice against "remove" elsewhere in this file. -->
The header bar SHALL show a `⋮` overflow menu. The menu SHALL hold
`DraftToolbar`'s Save, Discard draft, and Publish actions.
`DraftToolbar` SHALL keep computing when each action is available and
what each one does. The menu calls that logic. The menu holds no save,
discard, or publish logic of its own.

The menu SHALL group its remaining controls under two headings. "Process,
saved with the draft" SHALL hold the editable process key and the
base-locale control the `studio-app` capability's base-locale
requirement governs. "This session only" SHALL hold the `RegistryPanel`
action-registry selector, with a caption stating it is never written to
the draft.

The header bar's summary fields SHALL stay a read-only pass-through of
state `EditorArea` owns. Those fields are the process name, the revision
badge, the dirty state, and the published version and hash. None of
them carries logic of its own.

#### Scenario: The header bar shows an unsaved draft's state

- **WHEN** the draft has unsaved changes
- **THEN** the header bar shows the process name, the draft's revision
  badge, and a dirty indicator

#### Scenario: The header bar shows a just-published version

- **WHEN** a publish succeeds
- **THEN** the header bar shows the published version and its hash
  prefix

#### Scenario: The overflow menu invokes DraftToolbar's own save

- **WHEN** the developer chooses Save from the `⋮` menu
- **THEN** the draft saves through `DraftToolbar`'s existing save call

#### Scenario: The overflow menu separates persisted settings from session-only settings

- **WHEN** the developer opens the `⋮` menu
- **THEN** the key and base-locale control appear under "Process, saved
  with the draft"
- **AND** the action-registry selector appears under "This session only"
