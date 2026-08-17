## ADDED Requirements

### Requirement: A step dropped on a path lands inside that path

<!-- Why: "edit rail" is the glossary's one word for the creation palette. -->
<!-- antislop: allow synonym-rotation -->

A release of an edit-rail drag over a rendered path SHALL put the new step
inside that path. The step lands between the path's source step and its
target. The canvas SHALL apply three draft mutations for it, in one commit.

The new step SHALL join `workflow.steps`. The dropped-on path SHALL retarget
its `to` to the new step's id. The new step SHALL take one path, pointing at
the id that path named before.

The retargeted path SHALL keep its `id`, its `key`, its guard and its
priority. It is the same path, and the guard on it still decides whether the
flow enters this branch.

The new path SHALL take the retargeted path's trigger, and nothing else from
it. It SHALL carry no guard and no priority. An automatic chain therefore
stays automatic, and a manual one stays manual.

A guardless automatic path is legal here without a priority. The new step
holds one path, and the priority rule binds two or more.

The insert SHALL clear the retargeted path's stored waypoints. The author
placed them for a route that ended somewhere else. `Arrange` discards
waypoints for that same reason.

The new step SHALL land at the drop point, snapped to the grid. The canvas
SHALL select it. A free-standing drop does both already, and the insert
changes neither.

A step of kind `end` SHALL never land inside a path. A terminal step has no
outgoing path, so it cannot stand between two steps. A release of one over a
path SHALL place it free-standing, which is what it does today.

The topmost element under the pointer SHALL decide. A node draws over a path,
so a release where the two overlap places a free-standing step. A path with no
target draws no edge, so it SHALL never take an insert.

#### Scenario: A task step dropped on a path splits it

- **WHEN** the developer drags a Step from the edit rail
- **AND** releases it over the path from "Submit" to "Approve"
- **THEN** the draft holds a new step at the release point
- **AND** the "Submit" step's path names that new step as its target
- **AND** the new step holds one path naming "Approve"
- **AND** the canvas selects the new step

#### Scenario: The retargeted path keeps its guard and the new path takes the trigger

- **WHEN** the dropped-on path is automatic and carries a guard and priority 10
- **THEN** that path still carries the same guard and priority 10
- **AND** the new path is automatic, with no guard and no priority

#### Scenario: The insert clears the split path's waypoints

- **WHEN** the dropped-on path holds two waypoints in the draft layout
- **THEN** the layout holds none for that path after the insert
- **AND** the new path holds none of its own

#### Scenario: An end step drops free-standing over a path

- **WHEN** the developer releases an End from the edit rail over a path
- **THEN** the draft holds a new terminal step at that point
- **AND** the path names the target it named before

### Requirement: A path draws as the drop target under an edit-rail drag

While an edit-rail drag runs, the path under the pointer SHALL render in a
drop-target state. That state is the affordance the gesture has. The canvas
SHALL add no permanent control to an edge for it.

At most one path SHALL carry the state. It SHALL clear on release, and as soon
as the pointer leaves the path.

The state SHALL differ from a plain path in stroke weight as well as in color.
The signal then does not rest on color alone.

A drag carrying an `end` step SHALL draw the state on no path. Such a step
never lands inside one, so nothing may suggest that it does.

The state SHALL NOT move the priority badge or the guard label. It SHALL NOT
add a second control at the route midpoint. A selected path already carries a
waypoint handle there.

#### Scenario: The path under the pointer marks itself

- **WHEN** the developer holds a Step from the edit rail over a path
- **THEN** that path renders in the drop-target state
- **AND** every other path renders unchanged

#### Scenario: The state clears when the pointer moves off

- **WHEN** the pointer moves from the path to empty canvas
- **THEN** no path renders in the drop-target state

#### Scenario: An end step marks nothing

- **WHEN** the developer holds an End from the edit rail over a path
- **THEN** no path renders in the drop-target state

## MODIFIED Requirements

### Requirement: The canvas introduces no authoring operation unavailable through the panels

<!-- Why: this block repeats the base spec's wording, which the delta must -->
<!-- match for the archive to apply it. Both findings predate this change. -->
<!-- antislop: allow sentence-length passive-voice -->

Every mutation the canvas can trigger (positioning a step, connecting a
path, inserting a step into a path) SHALL have an existing panel-based
equivalent; the canvas SHALL NOT be
the only way to perform any authoring operation, including deletion, which
SHALL remain panel-only.

The insert gesture holds to this rule by composition. It performs no mutation
the panels lack. The rail's own existing step-creation drag creates the step.
Then `PathsPanel` retargets the source step's existing path to the new step.
It also adds a new path on it, naming the old target. Both are
already-existing panel actions.

The canvas spends one gesture where the panels spend four operations, and
reaches the same draft.

That composition is also what a keyboard reaches. Every canvas gesture is
pointer-driven, and the panel route is the equivalent that is not.

#### Scenario: A step and its paths remain deletable without the canvas

<!-- Why: the scenario repeats the base spec's own wording, character for -->
<!-- character. Both findings predate this change. -->
<!-- antislop: allow passive-voice synonym-rotation -->
- **WHEN** a step or path is deleted through its panel
- **THEN** the deletion succeeds identically to before this change, with no
  canvas-only deletion affordance introduced

#### Scenario: The panels reach an inserted step's end state

- **WHEN** the developer drags a Step from the edit rail onto empty canvas
- **AND** retargets the source step's path to it in `PathsPanel`
- **AND** adds a path on the new step naming the old target
- **THEN** the draft matches what one drop on that path produces
- **AND** it differs in the new step's position and the cleared waypoints
