## ADDED Requirements

### Requirement: A canvas bar offers Step, Subprocess, and End as an always-available way to add a step

The Canvas tab SHALL carry a canvas bar at all times. The bar stands between
the tab row and the canvas. It runs the tab body's full width. Its height
SHALL stay fixed whatever the canvas selection holds.

The bar SHALL carry three add controls. They read as a step someone works, a
call to another process, and an end, per `studio-guided-vocabulary`. No
control prints "terminal". A step someone works SHALL also stand as the bar's
own button, under an action phrase. The menu its caret opens SHALL list all
three kinds.

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
- **THEN** the three controls name a step someone works, a call to another
  process, and an end

### Requirement: The canvas bar reports one selected step's reachability

The canvas bar SHALL report the reachability of a single selected step. A step
the draft's initial step reaches through paths reads as nothing. A step no
chain of paths reaches reads as unconnected.

A step counts as reached when the draft's initial step reaches it over paths.
That is the rule the steps register's own order already applies. A draft
naming no initial step leaves every step unconnected. The rule reaches a
terminal step the same way it reaches any other.

The report SHALL stand only for a selection of exactly one step. A selection
of none has no report. A selection of several carries the count instead.

#### Scenario: An unreached step reads as unconnected

- **WHEN** an author selects a step no path reaches
- **THEN** the bar reads as unconnected

#### Scenario: A reached step has no report

- **WHEN** an author selects the draft's initial step
- **THEN** the bar has no reachability report

#### Scenario: Several selected steps carry the count instead

- **WHEN** an author selects two steps, one of them unreached
- **THEN** the bar reports a count of two and no reachability

### Requirement: The canvas bar renders from compiled styles

The canvas bar SHALL have no hand-authored CSS class for its own layout,
spacing or color.

<!-- Why: "surface" is the project's word for what the studio presents. -->
<!-- antislop: allow synonym-rotation -->
Its styles SHALL compile from the tokens, the way every studio surface's do.

#### Scenario: The bar's styles compile

- **WHEN** the web package builds
- **THEN** the canvas bar's rules come from compiled styles alone

### Requirement: The canvas bar's menu is a dismissible disclosure

The bar's menu SHALL open from a button that reports its own expanded state.
Escape SHALL close the menu and return focus to that button. A press outside
the menu SHALL close it too.

The menu SHALL stay open for the whole of a drag that starts inside it. It
SHALL close on the release that ends such a drag.

#### Scenario: Escape closes the menu

- **WHEN** an author opens the bar's menu and presses Escape
- **THEN** the menu closes and focus returns to the button

#### Scenario: A press outside closes the menu

- **WHEN** an author opens the bar's menu and presses the canvas
- **THEN** the menu closes

#### Scenario: A drag out of the menu keeps it open

- **WHEN** an author drags the end entry from the menu onto the canvas
- **THEN** the menu stays open until the release
- **AND** the step lands at the drop point

## MODIFIED Requirements

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

The canvas bar SHALL keep the selection count and the delete control for a
selection of more than one step. This capability's own selection requirement
states that rule.

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

### Requirement: A set of several steps offers a count and a delete control

The canvas bar SHALL carry the set's count while the set holds more than one
step. It SHALL carry a control that deletes every step in the set. No panel
SHALL stand below the canvas for either.

The step page holds one step, and a set of several names no one step for it.
The canvas bar therefore carries the set's own controls.

<!-- Why: a remove control acts on one step; the delete control here acts on a whole selection. -->
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

The bar SHALL also carry a control that groups the set. Grouping SHALL create
a group holding exactly the selected steps, with a name the author can change.
It SHALL leave the selection as it is.

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

#### Scenario: The delete control deletes every step in the set

- **WHEN** an author has selected three of five steps
- **AND** activates the delete control
- **THEN** the draft holds the other two steps alone
- **AND** the bar's count and delete control leave

#### Scenario: Deleting the initial step moves the marker

- **WHEN** the set holds the draft's initial step and an author deletes it
- **THEN** the draft's `workflow.initialStep` names the first remaining step

## REMOVED Requirements

### Requirement: A palette offers Step, Subprocess, and End as an always-available way to add a step

**Reason**: The palette stood as a column left of the canvas. Its three
controls move into the canvas bar, which this change adds above the canvas.

**Migration**: The canvas bar requirement above carries every rule this one
stated. The three controls keep their plain phrases and their drag behaviour.
The steps rail's foot stays their second home.
