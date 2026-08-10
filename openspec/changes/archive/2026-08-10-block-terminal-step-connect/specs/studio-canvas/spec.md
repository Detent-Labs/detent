## MODIFIED Requirements

### Requirement: Dragging to a step creates a path; dragging to empty canvas creates a step and a path

The canvas SHALL offer a connect handle on each step node. Releasing a
drag started from a terminal step's handle SHALL create neither a step
nor a path. This holds no matter where the release lands. It SHALL
surface the same inline rejection other rejected gestures already
surface. This check runs before any other check the gesture would
otherwise run.

The handle SHALL also carry a non-interactive visual state on a
terminal step. The rejection SHALL NOT be the first signal an author
sees.

A drag from a non-terminal step's handle can still target another step.
Releasing it there SHALL create a path from the source to the target.
It SHALL use the same path-creation method `PathsPanel`'s own "add
path" action already calls. It SHALL default to that step's existing
trigger type (manual or automatic) when one is already set.

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

- **WHEN** a connect-handle drag starts on step A
- **AND** the developer releases the drag over step B
- **THEN** a path from A to B exists in the Draft model, creatable
  through the same call `PathsPanel` uses

#### Scenario: A completed drag to empty canvas creates a step and a path

- **WHEN** a connect-handle drag starts on step A
- **AND** the developer releases the drag over empty canvas
- **AND** the candidate path's trigger consistency passes
- **THEN** a new step exists at the drop point
- **AND** a path from A to that new step exists in the Draft model

#### Scenario: A trigger-inconsistent drag to empty canvas creates nothing

- **WHEN** a connect-handle drag starts on step A, which already carries
  an automatic path with no `priority`
- **AND** the developer releases the drag over empty canvas
- **THEN** no new step exists at the drop point
- **AND** no new path exists in the Draft model
- **AND** the same inline rejection the drag-to-a-step gesture shows
  for a trigger-inconsistent candidate appears

#### Scenario: A drag from a terminal step's handle creates nothing

- **WHEN** a connect-handle drag starts on a terminal step
- **AND** the developer releases the drag over another step
- **THEN** no new path exists in the Draft model
- **AND** an inline rejection appears at the drop point

#### Scenario: A drag from a terminal step's handle to empty canvas creates nothing

- **WHEN** a connect-handle drag starts on a terminal step
- **AND** the developer releases the drag over empty canvas
- **THEN** no new step and no new path exist in the Draft model
- **AND** an inline rejection appears at the drop point

#### Scenario: A terminal step's connect handle renders as non-interactive

- **WHEN** the canvas renders a terminal step
- **THEN** that step's connect handle carries a visual state distinct
  from a non-terminal step's handle

## ADDED Requirements

### Requirement: A terminal step disables the inspector's "add path" control

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
