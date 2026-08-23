## ADDED Requirements

### Requirement: Selecting a node or edge shows its detail in a three-zone, tab-driven inspector beside the canvas

<!-- antislop: allow-file synonym-rotation -- "edit" (the canvas edit screen, ui-glossary.md) and "change" (SHALL/state-change wording) name unrelated concepts here -->

`StepsPanel` SHALL mount as a fixed-width column in the canvas edit
screen's third position. It replaces the `studio-checks-rail`
capability's checks rail there whenever the developer selects exactly
one step, or a path.

When the developer selects no step and no path, the third column SHALL
show the checks rail. It SHALL NOT show the inspector at all in that
state.

A selection of more than one step reaches neither of those two. The
third column SHALL show that selection's own count and delete control
instead. The selection-set requirements above state both.

Selecting a step node on the canvas SHALL show that one step in the
inspector. The inspector SHALL lay the step out in three zones. The
zones are an always-visible identity zone, a tab-driven behavior zone,
and a diagnostics drawer. This replaces the checks rail. It also
replaces any prior step's or path's content.

The identity zone SHALL carry no disclosure. It SHALL always show key,
label, description, a performed-by control, the initial-step control,
and the view button. The performed-by control SHALL offer participant,
subprocess, and terminal. The identity zone SHALL also show an outcome
field when the selected step carries `terminal: true`.

The identity zone SHALL keep the missing-translation warning beside
the step's label input and beside its description input. Those are two
of the six `LocalizedTextInput` sites `studio-app` requires a warning
at.

The identity zone SHALL also carry a control to set the selected step
as the draft's `initialStep`. Today `StepsPanel` renders that control
as a button inside its identity section, hidden until the identity
entry opens. The no-selection state hides the whole panel. The control
moves into the always-visible identity zone instead.

The behavior zone SHALL show a tab row: Assignment, Paths, Actions,
Timers. Subprocess joins that row only when the selected step's
performed-by control reads Subprocess. Exactly one tab's content SHALL
show at a time. Choosing a different tab SHALL replace the shown
content. It SHALL NOT expand a second panel alongside it.

Selecting a step node SHALL show its Assignment tab by default. Moving
the selection to a different step SHALL reset the shown tab back to
Assignment. The one exception: a selection that arrives through a path
edge click selects the Paths tab instead (see below).

Changing the performed-by control away from Subprocess while the
Subprocess tab shows SHALL move the shown tab to Assignment. The
Subprocess tab no longer lists once performed-by reads something
else, so it cannot stay shown.

`StepsPanel` already nests `PathsPanel` under the paths tab. No panel's
own fields, validation, or mutation logic SHALL differ from today's.
Only how an author reaches each panel is different.

The subprocess tab SHALL keep the cross-process check fieldset beside
the spec editor. That fieldset holds the file input which loads a child
body. `checkSubprocessChildRefs` runs against nothing without it.
Dropping the fieldset would leave that check with no route.

A step carrying `terminal: true` SHALL show an empty state on the Paths
tab, in place of a path editor. The empty state SHALL name that a
terminal step has no outgoing paths. A step carrying `terminal: true`
SHALL also suppress the assignment tab's no-assignment warning. Both
mirror the existing rule that already exempts a terminal step from
needing an assignment elsewhere:
`terminal === true || assignment !== undefined`.

Selecting a path edge SHALL resolve to its *source* step. It SHALL show
that step's inspector the same way, with its Paths tab selected. A path
is not independently addressable. It only exists nested under its
step. The selected path's own row SHALL also highlight within the
shown paths tab, through the existing `selectedPathId` prop on
`PathsPanel`.

The view button SHALL navigate to the form editor's routed page (see
the `studio-form-editor` capability). It SHALL NOT be a tab. It SHALL
NOT expand any content in place. It SHALL show a form-status summary
and a "Build the form" label beside that summary. A step's form
benefits from a full-screen page of its own, not an inline scroll
target. This is the inspector's one control that navigates away
instead of showing content in the column.

A behavior-zone tab is a `<button type="button" role="tab">` inside a
`role="tablist"`, carrying `aria-selected` for its own state. The
`spa-accessibility` capability's tab pattern governs this shape. The
studio area's other tab rows already use the same pattern. That set
includes the field catalog's field tabs, the dock tabs, and the
structure/JSON surface toggle. The identity zone's fields carry no
disclosure or tab semantics. They are plain, always-shown form
controls.

Creating the first step in an empty draft SHALL NOT depend on a prior
selection. The palette stays reachable regardless of selection; see
the palette requirement below.

The checks rail's own no-selection presentation carries no "+ Add
step" button. The palette's Step entry is the sole always-reachable way
to add the first step; see the palette requirement below.

#### Scenario: An empty draft with nothing selected shows the checks rail

- **WHEN** a draft with no step selected and no path selected is open
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: Selecting a step shows its identity zone and behavior tabs

- **WHEN** the developer clicks a step node on the canvas
- **THEN** the inspector shows that step's identity zone and behavior
  tab row, replacing whatever the third column showed before
- **AND** the Assignment tab shows by default

#### Scenario: Selecting a different step resets the shown tab

- **WHEN** the developer has the Timers tab shown for one step and
  clicks a different step node
- **THEN** the inspector shows the new step with its Assignment tab

#### Scenario: Choosing a behavior tab replaces the shown content

- **WHEN** the developer chooses the Assignment, Paths, Actions, Timers,
  or Subprocess tab for the selected step
- **THEN** the inspector shows that tab's content in place of whichever
  tab's content showed before

#### Scenario: Leaving Subprocess moves the shown tab to Assignment

- **WHEN** the developer has the Subprocess tab shown and changes the
  performed-by control away from Subprocess
- **THEN** the Subprocess tab no longer lists, and the Assignment tab
  shows

#### Scenario: The inspector carries the assignment tab

- **WHEN** the developer selects a non-terminal step with no
  `assignment`
- **THEN** the Assignment tab shows, and its editor carries the
  no-assignment warning

#### Scenario: A terminal step suppresses the no-assignment warning

<!-- Why: the linter's sentence splitter merges this WHEN/THEN pair, -->
<!-- since OpenSpec scenario bullets carry no terminal period. -->
<!-- antislop: allow sentence-length -->
- **WHEN** the developer selects a step carrying `terminal: true` and no
  `assignment`, and chooses its Assignment tab
- **THEN** the assignment editor shows with no no-assignment warning

#### Scenario: A terminal step's Paths tab shows an empty state

<!-- Why: the linter's sentence splitter merges this WHEN/THEN pair, -->
<!-- since OpenSpec scenario bullets carry no terminal period. -->
<!-- antislop: allow sentence-length -->
- **WHEN** the developer selects a step carrying `terminal: true` and
  chooses its Paths tab
- **THEN** the tab shows an empty state naming that a terminal step has
  no outgoing paths, and no path editor renders

#### Scenario: The identity zone keeps its translation warnings

- **WHEN** the studio's `contentLocale` is `de`, a step's `label`
  carries the base-locale value but no `de` value, and the developer
  selects that step
- **THEN** the missing-translation warning renders beside that step's
  label input in the identity zone

#### Scenario: The identity zone sets the draft's initial step

- **WHEN** the developer activates the selected step's "set as initial
  step" control in the identity zone
- **THEN** the draft's `workflow.initialStep` names that step's id

#### Scenario: The subprocess tab keeps the cross-process check

- **WHEN** the developer selects a step of type `subprocess` and
  chooses its Subprocess tab
- **THEN** the cross-process check fieldset renders beside the spec
  editor, and its file input still loads a child body

#### Scenario: The step issue count covers an issue on its path

- **WHEN** a step carries no issue of its own and one of its paths
  carries a guard that fails validation
- **THEN** the inspector's diagnostics drawer reports one issue for
  that step

#### Scenario: A behavior tab activates with the keyboard

- **WHEN** a keyboard user tabs to a behavior-zone tab button and
  presses Enter or Space
- **THEN** that tab's content shows, and `aria-selected` reads true on
  that tab alone

#### Scenario: Choosing the view button opens the form editor

- **WHEN** the developer chooses the view button for the selected step
- **THEN** the form editor's routed page opens for that step, and the
  behavior zone's shown tab does not change

#### Scenario: The view button shows a form-status summary

- **WHEN** the developer selects a step carrying a partially configured
  view
- **THEN** the view button shows a status summary of the form and a
  "Build the form" label

#### Scenario: Selecting a path edge shows its source step's Paths tab

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** the inspector shows that edge's source step, with the Paths
  tab shown
- **AND** the clicked path's own row highlights within the paths tab

#### Scenario: Deselecting swaps the column back to the checks rail

- **WHEN** the developer clicks empty canvas space while a step or path
  stays selected
- **THEN** the third column shows the checks rail again, not the
  inspector

#### Scenario: A first step is addable with nothing selected

- **WHEN** an empty draft has no step, and the developer has selected
  nothing
- **THEN** the palette's Step entry stays visible and usable

### Requirement: The step inspector's diagnostics drawer discloses the step's raw data

The step inspector SHALL carry a diagnostics drawer at the bottom of
the inspector. The drawer SHALL sit visually separate from the
identity and behavior zones. The drawer SHALL hold the selected step's
issue count, a "View raw JSON" toggle, and the existing docked checks
rail. It SHALL also hold the step's "Remove step" control. Expanding
the toggle SHALL show the selected step's raw JSON, read-only.

The "View raw JSON" toggle SHALL be a `<button type="button">`. It
SHALL carry `aria-expanded` for its own state and `aria-controls`
naming the JSON region it discloses, per the `spa-accessibility`
capability's disclosure requirement.

The toggle replaces the former "Developer view" disclosure entry,
which was a peer of the seven content sections. It is distinct from
the path-guard's CEL "Developer view" toggle. The
`studio-condition-builder` capability describes that other toggle.

#### Scenario: The diagnostics drawer's raw-JSON toggle shows the step's JSON

- **WHEN** the developer expands a selected step's "View raw JSON"
  toggle in the diagnostics drawer
- **THEN** the step's raw underlying JSON renders read-only

#### Scenario: Diagnostics drawer offers step removal

- **WHEN** the developer selects a step
- **THEN** the diagnostics drawer shows a "Remove step" control

### Requirement: The identity zone's type and terminal controls render as a "performed by" segmented control

The identity zone SHALL render the step's existing `type` and
`terminal` fields as a three-option segmented control, labeled
"performed by". The options are participant (type `task`), subprocess
(type `subprocess`), and nothing/terminal. This SHALL set the same
fields the identity zone's type control sets today; it adds no new
field.

#### Scenario: Choosing a "performed by" option sets the step's type

- **WHEN** the developer selects the subprocess option in a step's
  "performed by" control
- **THEN** the step's `type` becomes `subprocess`, the same field the
  identity zone's type control already sets

### Requirement: The identity zone constrains a terminal step's outcome to the process's declared outcomes

When the draft's contract declares one or more `outcomes`, the identity
zone's `outcome` field SHALL offer only those values, not free text.
Without a contract, or with a contract that declares no outcomes, the field
carries no validated meaning. It SHALL stay a free-text field.

#### Scenario: The developer picks an outcome from the declared list

- **WHEN** the developer selects a terminal step on a draft whose contract
  declares one or more outcomes
- **THEN** the identity zone's outcome field offers only those declared
  outcomes as choices

#### Scenario: An outcome field stays free text without a declared outcome list

- **WHEN** the developer selects a terminal step on a draft with no
  contract, or a contract that declares no outcomes
- **THEN** the identity zone's outcome field accepts any text

## MODIFIED Requirements

### Requirement: A step node on the canvas offers an inline rename

The canvas SHALL let the developer rename a step's label directly on
its node. Renaming SHALL NOT need editing the step through the
inspector's identity zone. Committing the rename SHALL write
`step.label` through the same Draft mutation the identity zone's label
input already calls.

#### Scenario: Double-clicking a node's label opens an inline text field

- **WHEN** the developer double-clicks a step node's label on the canvas
- **THEN** a text field opens on the node, seeded with the step's current
  label

#### Scenario: Committing the inline rename updates the step's label

- **WHEN** the developer edits a node's inline text field and commits it
- **THEN** the step's `label` updates through the same Draft mutation the
  identity zone's label input calls

## REMOVED Requirements

### Requirement: Selecting a node or edge shows its detail in a permanent, selection-driven inspector beside the canvas

**Reason**: The new "three-zone, tab-driven inspector" requirement
above replaces this one. The eight-entry, single-open accordion this
requirement described no longer exists. The identity zone, behavior
tabs, and diagnostics drawer replace it.

**Migration**: None needed. This is a studio-only presentation change.
No persisted data changes, and no API shape changes.

`StepsPanel` SHALL mount as a fixed-width column in the canvas edit
screen's third position. It replaces the `studio-checks-rail`
capability's checks rail there whenever the developer selects exactly one
step, or a path.

When the developer selects no step and no path, the third column SHALL
show the checks rail. It SHALL NOT show the inspector at all in that
state.

A selection of more than one step reaches neither of those two. The third
column SHALL show that selection's own count and delete control instead. The
selection-set requirements above state both.

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

### Requirement: The step inspector's "Developer view" discloses the step's raw data

**Reason**: The "The step inspector's diagnostics drawer discloses the
step's raw data" requirement above replaces this one. The "Developer
view" disclosure entry it described is no longer a peer of the content
sections. The diagnostics drawer's raw-JSON toggle replaces it.

**Migration**: None needed. This is a studio-only presentation change.
No persisted data changes, and no API shape changes.

The step inspector SHALL carry a collapsible "Developer view"
disclosure, an eighth entry beside the seven content sections. Expanding
it SHALL show the selected step's raw JSON. This is a read-only view;
it is distinct from the path-guard's CEL "Developer view" toggle the
`studio-condition-builder` capability describes.

#### Scenario: The step inspector's "Developer view" shows raw JSON

- **WHEN** the developer expands a selected step's "Developer view"
  disclosure
- **THEN** the step's raw underlying JSON renders read-only

### Requirement: A terminal step disables the inspector's "add path" control

**Reason**: This requirement described an always-shown paths section
whose "add path" control disables. The "Selecting a node or edge shows
its detail..." requirement's terminal-step scenario replaces that
behavior. A terminal step's Paths tab now shows an empty state and
renders no path editor. No "add path" control remains to disable.

**Migration**: None needed. This is a studio-only presentation change.
No persisted data changes, and no API shape changes.

The paths section's "add path" control SHALL disable when the selected
step carries `terminal: true`. This extends the control's existing
disabled condition, which already covers the case of no step to
target. Both share one reason: the resulting draft could never
publish.

#### Scenario: A terminal step disables the add-path control

- **WHEN** the developer selects a terminal step and opens its paths
  section
- **THEN** the "add path" control renders disabled

#### Scenario: A non-terminal step keeps the add-path control enabled

- **WHEN** the developer selects a non-terminal step, in a process with
  at least one other step
- **THEN** the "add path" control renders enabled

### Requirement: The identity section's type and terminal controls render as a "performed by" segmented control

**Reason**: The "identity zone" requirement above renames this
requirement's region. The redesigned inspector calls the region a zone,
not a section. The segmented control and the fields it sets stay the
same.

**Migration**: None needed. This is a studio-only presentation change.
No persisted data changes, and no API shape changes.

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

### Requirement: The identity section constrains a terminal step's outcome to the process's declared outcomes

**Reason**: The "identity zone" requirement above renames this
requirement's region. The redesigned inspector calls the region a zone,
not a section; the outcome field and its constraint stay the same.

**Migration**: None needed. This is a studio-only presentation change.
No persisted data changes, and no API shape changes.

When the draft's contract declares one or more `outcomes`, the identity
section's `outcome` field SHALL offer only those values, not free text.
Without a contract, or with a contract that declares no outcomes, the field
carries no validated meaning. It SHALL stay a free-text field.

#### Scenario: The developer picks an outcome from the declared list

- **WHEN** the developer selects a terminal step on a draft whose contract
  declares one or more outcomes
- **THEN** the identity section's outcome field offers only those declared
  outcomes as choices

#### Scenario: An outcome field stays free text without a declared outcome list

- **WHEN** the developer selects a terminal step on a draft with no
  contract, or a contract that declares no outcomes
- **THEN** the identity section's outcome field accepts any text

### Requirement: The view entry shows form status and a "Build the form" label

**Reason**: The three-zone requirement above replaces this one. The
"view entry" this requirement describes is no longer a disclosure
entry; it is the identity zone's view button. The form-status summary
and "Build the form" label it carried move there.

**Migration**: None needed. This is a studio-only presentation change.
No persisted data changes, and no API shape changes.

The view entry SHALL show a status summary of the step's form. For
example, the summary might read how many fields carry a view entry.
It SHALL also show a "Build the form" label alongside that summary.

This changes the entry's copy only. Choosing it still navigates to the
form editor's routed page, per the view-entry requirement above. No
section expands inline.

#### Scenario: The view entry shows a form-status summary

- **WHEN** the developer selects a step carrying a partially configured
  view
- **THEN** the view entry shows a status summary of the form and a
  "Build the form" label
