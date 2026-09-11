## MODIFIED Requirements

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The structure surface lays out a canvas ribbon, a steps register and the configuration pane

The Canvas tab SHALL carry the canvas bar and the canvas, in that order. The
canvas SHALL fill the body the bar leaves. No other bar and no band SHALL
stand over it. No expand control SHALL stand, and no control SHALL change the
canvas height.

The steps register and the configuration pane SHALL NOT stand. The steps rail
and the step page hold that work, per `studio-step-page`.

Every canvas gesture the other requirements of this capability state SHALL
stay live. Those gestures cover the drag, the connect and the drop on a path.
They cover the pan, the zoom, the keyboard traversal and the focus ring. They
also cover auto layout, Arrange, the grid snap, groups, waypoints and the
inline rename.

The canvas and the step page SHALL share one selected step. Pressing a node
SHALL make that step the one the step page holds. Pressing a rail row SHALL
mark that step's node on the canvas. Pressing a path edge SHALL resolve to
that path's source step. The step page then holds that source step, with its
Path to section in view.

The canvas bar SHALL keep the delete control for a selection of one step or
more. It SHALL keep the selection count for a selection of more than one step.
This capability's own selection requirement states both rules.

The canvas SHALL fill the height the tab body leaves under the bar, above a
floor of 36rem. Past that floor the page scrolls.

<!-- The scenario names below repeat the live spec's wording verbatim, so a delta can match them. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: The three regions appear

- **WHEN** an author opens the Canvas tab
- **THEN** the canvas bar stands under the tab row
- **AND** the canvas fills the body under it
- **AND** no ribbon, no steps register and no configuration pane stand beside
  it

#### Scenario: The ribbon starts collapsed

- **WHEN** an author opens the Canvas tab
- **THEN** the canvas stands at its full height under the bar, carrying no
  band

#### Scenario: The control expands and collapses the ribbon

- **WHEN** an author looks for a control that changes the canvas height
- **THEN** the Canvas tab carries none

#### Scenario: The bar holds its height across a selection

- **WHEN** an author selects three steps, then clears the selection
- **THEN** the bar's height never changes
- **AND** the canvas never reflows

#### Scenario: A canvas selection opens the pane

- **WHEN** an author presses a step node on the Canvas tab
- **THEN** the step page holds that step
- **AND** the node reads as selected

#### Scenario: A register selection marks the node

- **WHEN** an author presses a row of the steps rail
- **THEN** that step's node reads as selected on the Canvas tab

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Several steps show the count

- **WHEN** an author selects more than one step on the canvas
- **THEN** the canvas bar carries the selection count and its delete control

#### Scenario: A reload returns the ribbon to collapsed

- **WHEN** an author reloads the Canvas tab
- **THEN** the canvas fills the body under the bar, as it did before the
  reload

#### Scenario: Saving a draft writes no ribbon state

- **WHEN** an author saves the draft
- **THEN** the saved `layout` blob has no key naming a ribbon

#### Scenario: A short window holds the floor

- **WHEN** an author opens the Canvas tab in a window shorter than the floor
- **THEN** the canvas keeps 36rem and the page scrolls

### Requirement: A canvas bar offers Step, Subprocess, and End as an always-available way to add a step

The Canvas tab SHALL carry a canvas bar at all times. The bar stands between
the tab row and the canvas. It runs the tab body's full width. Its height
SHALL stay fixed whatever the canvas selection holds. That height SHALL be one
row of its controls. A field in the bar SHALL carry its label beside the
field, so no selection state grows the row.

The bar SHALL carry three add controls. They add a step someone works, a call
to another process, and an end, per `studio-guided-vocabulary`. No control
prints "terminal". A step someone works SHALL stand as the bar's own button,
under an action phrase. The menu its caret opens SHALL list the other two
kinds alone: a call to another process, and an end.

Each add control SHALL be a drag source. Dragging one onto the canvas SHALL
add a step of that kind at the drop point. That SHALL use the same
draft-mutation method the steps rail's own add controls call.

<!-- Why: "edit rail" is the live spec's own fixed term for these controls. -->
<!-- antislop: allow synonym-rotation -->
The spec's older word for these three controls is the edit rail. Every
requirement naming an edit-rail drag names a drag from these controls.

Activating an add control without a drag SHALL add a step of that kind. The
step SHALL land at the centre of the visible canvas, on the lattice. It SHALL
stand clear of every step already placed. It SHALL become the selection, the
way a dropped step already does.

The add controls SHALL stay usable whatever the canvas selection holds. No
expand control gates them, because the bar has no collapsed state.

A draft holding no step SHALL still reach the add controls. The steps rail's
foot carries the same three controls, per `studio-step-page`.

#### Scenario: Dragging an add control adds a step

- **WHEN** an author drags the bar's step control onto the canvas
- **THEN** a new step of type `task` stands at the drop point

#### Scenario: Pressing the button adds a step at the centre

- **WHEN** an author presses the bar's step button and drags nothing
- **THEN** a new step of type `task` stands at the visible canvas centre
- **AND** that step becomes the selection

#### Scenario: A pressed step never lands on another

- **WHEN** an author presses the bar's step button twice
- **THEN** the second step stands clear of the first

#### Scenario: The menu holds the other two kinds

- **WHEN** an author opens the bar's menu
- **THEN** the menu offers a call to another process, and an end
- **AND** each entry adds a step of that kind
- **AND** the menu offers no step someone works

#### Scenario: The bar stands one control row tall

- **WHEN** an author selects a set that matches one group
- **THEN** the group name's label stands beside its field
- **AND** the bar keeps the height it has with nothing selected

#### Scenario: The add controls work with nothing selected

- **WHEN** an author selects nothing on the canvas
- **THEN** every add control stays usable

#### Scenario: An empty draft adds its first step from the bar

- **WHEN** a draft has no step and an author opens the Canvas tab
- **THEN** the bar stands, and dragging its step control adds a step of type
  `task`
- **AND** the steps rail's foot carries the same three add controls

#### Scenario: The add controls name themselves in plain words

- **WHEN** an author reads the bar
- **THEN** the bar's button names adding a step
- **AND** the menu names a call to another process, and an end

### Requirement: A set of several steps offers a count and a delete control

The canvas bar SHALL carry the set's count while the set holds more than one
step. It SHALL carry a control that deletes every step in the set while the
set holds one step or more. No panel SHALL stand below the canvas for either.

The step page holds one step, and a set of several names no one step for it.
The canvas bar therefore carries the set's own controls. A single selected
step reaches the same delete control from the canvas, whose label then names
one step.

<!-- Why: the step page's control is named Remove; the delete control here acts on the canvas selection. -->
<!-- antislop: allow synonym-rotation -->
The delete control SHALL take each step in the set out of the draft's
`workflow.steps`. It SHALL leave a path that points at a deleted step as it is.

<!-- Why: the step page's control is named Remove, and acts on one step. -->
<!-- antislop: allow synonym-rotation -->
The step page's own remove control leaves such a path today, and the checks
rail reports it.

The draft SHALL take the first remaining step as its `workflow.initialStep`
when the deleted set held it. That is the rule one step's own removal applies
today.

The bar SHALL also carry a control that groups a set of more than one step.
Grouping SHALL create a group holding exactly the selected steps, with a name
the author can change. It SHALL leave the selection as it is.

The control SHALL refuse a set that any group already holds. A step SHALL
belong to at most one group, so nothing has to decide which box draws it.

When the selection exactly matches one group's members, the bar SHALL carry
that group's own controls instead. Those are its name, a collapse control and
an ungroup control.

The `studio-checks-rail` capability carries the checks rail's own home. The
canvas bar docks none of it.

The set SHALL be empty after the delete.

#### Scenario: Two selected steps show a count

- **WHEN** an author selects two steps
- **THEN** the canvas bar reports a count of two
- **AND** the step page has no section for the set

#### Scenario: One selected step shows the delete control, and no count

- **WHEN** an author selects one step
- **THEN** the canvas bar carries the delete control, labelled for one step
- **AND** the bar has no count and no grouping control

#### Scenario: The delete control deletes every step in the set

- **WHEN** an author has selected three of five steps
- **AND** activates the delete control
- **THEN** the draft holds the other two steps alone
- **AND** the bar's count and delete control leave

#### Scenario: The delete control deletes one selected step

- **WHEN** an author has selected one of five steps
- **AND** activates the delete control
- **THEN** the draft holds the other four steps alone
- **AND** the delete control leaves

#### Scenario: Deleting the initial step moves the marker

- **WHEN** the set holds the draft's initial step and an author deletes it
- **THEN** the draft's `workflow.initialStep` names the first remaining step

### Requirement: The canvas introduces no authoring operation unavailable through the panels

<!-- Why: the copied paragraphs repeat the base spec's wording; remove and delete name two controls. -->
<!-- antislop: allow sentence-length passive-voice synonym-rotation -->

Every mutation the canvas can trigger SHALL have an existing panel-based
equivalent. Those mutations are positioning a step, connecting a path,
inserting a step into a path, and deleting a selection. The canvas SHALL NOT
be the only way to perform any authoring operation. Deletion keeps its panel
route. The step page's own remove control removes each step the canvas bar's
delete control removes.

The insert gesture holds to this rule by composition. It performs no mutation
the panels lack. The rail's own existing step-creation drag creates the step.
Then `PathsPanel` retargets the source step's existing path to the new step.
It also adds a new path on it, naming the old target. Both are
already-existing panel actions.

The canvas spends one gesture where the panels spend four operations, and
reaches the same draft.

Selection and traversal answer the keyboard directly now. A drag gesture stays
pointer-driven, and the panel route is its keyboard equivalent.

#### Scenario: A step and its paths remain deletable without the canvas

<!-- Why: the scenario repeats the base spec's own wording, character for character. -->
<!-- antislop: allow passive-voice synonym-rotation -->
- **WHEN** a step or path is deleted through its panel
- **THEN** the deletion succeeds identically to before this change, with no
  canvas-only deletion affordance introduced

#### Scenario: The panels reach an inserted step's end state

<!-- Why: this scenario repeats the base spec's own wording; the rail carries that name on the screen. -->
<!-- antislop: allow synonym-rotation -->
- **WHEN** the developer drags a Step from the edit rail onto empty canvas
- **AND** retargets the source step's path to it in `PathsPanel`
- **AND** adds a path on the new step naming the old target
- **THEN** the draft matches what one drop on that path produces
- **AND** it differs in the new step's position and the cleared waypoints
