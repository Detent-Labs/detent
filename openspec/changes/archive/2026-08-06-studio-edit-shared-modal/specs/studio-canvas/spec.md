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

The identity section SHALL keep the missing-translation warning beside
the step's label input and beside its description input. Those are two
of the six `LocalizedTextInput` sites `studio-app` requires a warning
at.

The subprocess spec section SHALL keep the cross-process check fieldset
beside the spec editor. That fieldset holds the file input which loads a
child body, and `checkSubprocessChildRefs` runs against nothing without
it. Dropping the fieldset would remove the only route to that check.

Selecting a path edge SHALL resolve to its *source* step and show that
step's index the same way. A path is not independently addressable. It
only exists nested under its step.

Choosing a section in the index SHALL scroll to and expand that one
section beneath the canvas. Every other section stays collapsed. `StepsPanel`
already nests `PathsPanel` under the paths section. Deselecting SHALL
collapse any expanded section, leaving the index visible. No panel's
own fields, validation, or mutation logic SHALL change. Only how an
author reaches each section changes.

A section entry is a disclosure. It SHALL therefore be a
`<button type="button">`. It SHALL carry `aria-expanded` for its own
state, and `aria-controls` naming the section it opens. The
`spa-accessibility` capability requires that shape of every disclosure.

#### Scenario: Selecting a step shows its section index

- **WHEN** the developer clicks a step node on the canvas
- **THEN** `StepsPanel` shows that step's sections with their entity
  counts in the inspector column

#### Scenario: Choosing a section expands it beneath the canvas

- **WHEN** the developer chooses a section entry for the selected step
- **THEN** `StepsPanel` scrolls to and expands that section, and every
  other section stays collapsed

#### Scenario: The index carries the assignment section

- **WHEN** the developer selects a non-terminal step carrying no
  `assignment`
- **THEN** the index lists an assignment section, and choosing it
  expands the assignment editor with its no-assignment warning beside
  it

#### Scenario: The identity section keeps its translation warnings

- **WHEN** the studio's `contentLocale` is `de`, a step's `label`
  carries the base-locale value but no `de` value, and the developer
  chooses the identity section
- **THEN** the missing-translation warning renders beside that step's
  label input

#### Scenario: The subprocess spec section keeps the cross-process check

- **WHEN** the developer selects a step of type `subprocess` and chooses
  the subprocess spec section
- **THEN** the cross-process check fieldset renders beside the spec
  editor, and its file input still loads a child body

#### Scenario: The step issue count covers an issue on its path

- **WHEN** a step carries no issue of its own and one of its paths
  carries a guard that fails validation
- **THEN** the section index reports one issue for that step

#### Scenario: A section entry expands with the keyboard

- **WHEN** a keyboard user tabs to a section entry and presses Enter or
  Space
- **THEN** the section expands, `aria-expanded` reads true, and pressing
  again collapses it

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
