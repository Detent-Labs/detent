## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- The requirement title below must match the existing spec's title exactly for archive merge; it is not open for rewording here. -->
### Requirement: Selecting a node or edge expands its detail in a permanent inspector beside the canvas

`StepsPanel` SHALL mount as a fixed-width inspector column beside the
canvas at all times. Its own list and "+ Add step" action stay
reachable whether or not the developer has selected anything. Creating
the first step never depends on a prior selection.

Selecting a step node on the canvas SHALL show that step's sections in
a compact index. Each entry carries its own entity count. The sections
are identity (key, label, description, type, terminal, outcome),
assignment, paths, timers, actions, subprocess spec, and view.

The index SHALL carry every section the step card body holds today. It
SHALL NOT drop the assignment section. `studio-app` requires a
no-assignment warning beside the assignment editor. That requirement
has no anchor without the section.

Selecting a path edge SHALL resolve to its *source* step and show that
step's index the same way. A path is not independently addressable. It
only exists nested under its step.

Choosing any entry other than view SHALL scroll to and expand that one
section beneath the canvas. Every other section stays collapsed.
`StepsPanel` already nests `PathsPanel` under the paths section.

Choosing the view entry SHALL instead open the form editor (see the
`studio-form-editor` capability). A step's form benefits from a canvas
of its own, not an inline scroll target. This is the one section entry
that opens a dialog instead of scrolling.

Deselecting SHALL collapse any expanded section, leaving the index
visible. No panel's own fields, validation, or mutation logic SHALL
change. Only how an author reaches each section changes.

#### Scenario: Selecting a step shows its section index

- **WHEN** the developer clicks a step node on the canvas
- **THEN** `StepsPanel` shows that step's sections with their entity
  counts in the inspector column

#### Scenario: Choosing a non-view section expands it beneath the canvas

- **WHEN** the developer chooses the identity, assignment, paths,
  timers, actions, or subprocess spec entry for the selected step
- **THEN** `StepsPanel` scrolls to and expands that section, and every
  other section stays collapsed

#### Scenario: The index carries the assignment section

- **WHEN** the developer selects a non-terminal step carrying no
  `assignment`
- **THEN** the index lists an assignment section, and choosing it
  expands the assignment editor with its no-assignment warning beside
  it

#### Scenario: Choosing the view entry opens the form editor

- **WHEN** the developer chooses the view entry for the selected step
- **THEN** the form editor dialog opens for that step, and no section
  expands inline beneath the canvas

#### Scenario: Selecting a path edge shows its source step's index

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** `StepsPanel` shows the section index for that edge's source
  step

#### Scenario: Deselecting collapses the expanded section, not the index

- **WHEN** the developer clicks empty canvas space while a section is
  open
- **THEN** the section collapses, no entity stays selected, and
  `StepsPanel`'s list (including "+ Add step") remains visible

#### Scenario: A step is addable with nothing selected

- **WHEN** the developer has selected no step or edge
- **THEN** `StepsPanel`'s "+ Add step" action stays visible and usable
  in the inspector column
