<!-- antislop: allow-file passive-voice synonym-rotation -->
<!-- Why passive-voice: a scenario states an outcome, and the actor is the
     system under test. Why synonym-rotation: "Discard" is a literal
     button label, not a synonym choice. Matches
     openspec/specs/studio-condition-builder's own precedent for both. -->
<!-- Sequencing note: this change depends on
     studio-canvas-first-structure-editor landing first (its proposal
     names that change's "Build the form" entry point). That change
     renames this exact requirement's header from "...expands its detail
     in a permanent inspector..." to "...shows its detail in a permanent,
     selection-driven inspector...". This delta targets the RENAMED
     header and carries the requirement's full post-rename body, so it
     applies correctly whether openspec-sync-specs runs against the live
     spec after structure-editor has already archived (the expected
     order), or a reviewer reads this delta stand-alone. If the two
     changes are ever archived in the other order, this delta's target
     header will need to change back to the pre-rename wording. -->
<!-- Reconciliation note: the requirement body below carries only the
     dialog-to-navigation wording as an intentional change from the
     currently-live openspec/specs/studio-canvas/spec.md (the "Choosing
     the view entry" and "The view entry" paragraphs, and the "Choosing
     the view entry opens the form editor" scenario's THEN clause). Every
     other paragraph and scenario is reconciled to match that live
     spec's wording, not studio-canvas-first-structure-editor's own
     delta, which drifts from it in five spots that carry no meaning
     change (the no-selection-state sentence, the palette-reachability
     sentence, and two scenario WHEN clauses). Re-run this reconciliation
     against whatever `openspec/specs/studio-canvas/spec.md` reads at
     sync or archive time, per the Risks section. -->
## MODIFIED Requirements

### Requirement: Selecting a node or edge shows its detail in a permanent, selection-driven inspector beside the canvas

`StepsPanel` SHALL mount as a fixed-width inspector column beside the
canvas at all times.

When the developer selects no step and no path, the inspector SHALL show a
no-selection state. It SHALL NOT show a list of every step in the draft.

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
the palette requirement below. The inspector needs no always-visible
step list of its own to satisfy this.

The no-selection state SHALL carry `StepsPanel`'s existing "+ Add
step" button. Removing the always-visible step list removes what
hosts that button today. The button relocates to the no-selection
state instead. It stays reachable there, beside the palette's own way
to add a step.

#### Scenario: The empty draft shows a no-selection state

- **WHEN** a draft with no step selected and no path selected is open
- **THEN** the inspector shows a no-selection state, not a list of steps
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
- **THEN** the form editor's routed page opens for that step, and no
  section expands inline within the inspector

#### Scenario: Selecting a path edge shows its source step's inspector

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** the inspector shows the section list for that edge's source
  step
- **AND** the clicked path's own row highlights within the paths
  section

#### Scenario: Deselecting returns the inspector to the no-selection state

- **WHEN** the developer clicks empty canvas space while a step or path
  stays selected
- **THEN** the inspector returns to the no-selection state

#### Scenario: A first step is addable with nothing selected

- **WHEN** an empty draft has no step, and the developer has selected
  nothing
- **THEN** the palette's Step entry stays visible and usable
