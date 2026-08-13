## ADDED Requirements

### Requirement: A subprocess step's node is distinct from a task step's node

The canvas SHALL draw a marker on the node of every step whose `type` is
`subprocess`. It SHALL draw no such marker on a step whose `type` is `task`.
This lets an author see which steps call another process, from the canvas
alone and with no per-step inspection.

The marker SHALL be a second rule inside the node's rectangle, inset from the
outer one. It SHALL carry no corner radius and no fill. It SHALL read the same
colour role the node's outer rule reads. A selected subprocess step keeps the
selection treatment on its outer rule. The marker therefore never hides which
steps the author holds.

The canvas SHALL draw the marker before the node's label, its key, its stamps
and its connect handle. The marker therefore obscures none of them. A
subprocess step that is also initial or terminal SHALL show the marker and
every stamp it earns.

#### Scenario: A subprocess step shows the marker

- **WHEN** a step's `type` is `subprocess`
- **THEN** the canvas draws the inset rule inside that step's node

#### Scenario: A task step shows no marker

- **WHEN** a step's `type` is `task`
- **THEN** the canvas draws that step's node with its outer rule alone

#### Scenario: Changing the step type adds or removes the marker

- **WHEN** the developer switches a selected step's type between `task` and
  `subprocess`
- **THEN** the marker appears on, or leaves, that step's node, with no reload
  and no other node affected

#### Scenario: A subprocess step that is also terminal shows both

- **WHEN** a step's `type` is `subprocess` and the step is terminal
- **THEN** the canvas draws the marker and the outcome stamp, with neither
  one obscured by the other

#### Scenario: A selected subprocess step keeps its selection treatment

- **WHEN** the author selects a subprocess step
- **THEN** the node's outer rule shows the selection treatment every selected
  step shows
- **AND** the marker draws as it does on an unselected step
