## ADDED Requirements

### Requirement: The canvas holds a set of selected steps

The canvas selection SHALL be a set of step ids rather than one id. A set of
one step SHALL behave as a single selection behaves today.

A click on a step node SHALL replace the set with that one step. A shift-click
SHALL add that step to the set. A shift-click on a step the set already holds
SHALL drop it. A click on empty canvas SHALL empty the set.

A shift-drag on empty canvas SHALL draw a marquee rectangle. It spans the press
point and the pointer. On release the set SHALL hold every step whose node
rectangle the marquee overlaps. It SHALL hold no other step. An overlap of any
part of a node counts.

The marquee SHALL NOT pan the canvas while it draws. A drag with no shift held
SHALL pan the canvas as it does today.

A click on a path SHALL leave the set holding that path's source step alone.
The canvas SHALL hold one selected path at most.

#### Scenario: Shift-clicking a second node selects both

- **WHEN** the developer clicks one step node, then shift-clicks a second one
- **THEN** the canvas draws both nodes as selected

#### Scenario: Shift-clicking a node already in the set drops it

- **WHEN** the developer has selected two nodes and shift-clicks one of them
- **THEN** the canvas draws that node as unselected, and keeps the other one
  selected

#### Scenario: A plain click replaces the whole set

- **WHEN** the developer has selected three nodes and clicks a fourth one with
  no shift held
- **THEN** the canvas draws the fourth node alone as selected

#### Scenario: A marquee selects every node it touches

- **WHEN** the developer shift-drags a rectangle over empty canvas
- **AND** that rectangle overlaps two of five step nodes
- **THEN** the set holds those two steps and no other
- **AND** the canvas has not panned

#### Scenario: A plain background drag still pans

- **WHEN** the developer drags on empty canvas with no shift held
- **THEN** the canvas pans, and no marquee draws

### Requirement: Dragging a node in the set moves every step in it

A drag on a step node the set holds SHALL move every step in the set. Each one
moves by the same pointer delta.

A drag on a step node the set does not hold SHALL first replace the set with
that one step. It then moves that step alone.

Each moved step SHALL land on the canvas lattice. That is the rounding a single
drag applies today. Each moved step's position SHALL persist as draft layout,
by the route a single drag's position already takes.

The drag preview SHALL draw every moving node at its rounded position. The
group under the pointer is then the group the developer gets on release.

A movement under the click threshold SHALL still count as a click. It SHALL
write no position for any step in the set.

#### Scenario: Dragging one node of a set moves them all

- **WHEN** the developer has selected three steps and drags one of the three
- **THEN** all three move by the same delta, and each lands on the lattice

#### Scenario: Dragging a node outside the set drops the rest

- **WHEN** the developer has selected three steps and drags a fourth one
- **THEN** the fourth step alone moves, and the set then holds it alone

#### Scenario: A click inside a group writes no position

- **WHEN** the developer has selected three steps
- **AND** presses and releases on one of them under the click threshold
- **THEN** no step's layout position changes

### Requirement: A set of several steps offers a count and a delete control

The third column SHALL show the set's count while the set holds more than one
step. It SHALL show a control that deletes every step in the set.

It SHALL NOT show the inspector in that state. The inspector edits one step,
and a set of several names no one step for it.

The delete control SHALL take each step in the set out of the draft's
`workflow.steps`. It SHALL leave a path that points at a deleted step as it is.
The inspector's own delete leaves such a path today, and the checks rail
reports it.

The draft SHALL take the first remaining step as its `workflow.initialStep`
when the deleted set held it. That is the rule a single delete applies today.

The third column SHALL dock the collapsed checks rail at the summary's bottom
edge. It docks one at the inspector's bottom edge already. The
`studio-checks-rail` capability carries that summary's own rules.

The set SHALL be empty after the delete. The third column then shows the full
checks rail again.

#### Scenario: Two selected steps show a count

- **WHEN** the developer selects two steps
- **THEN** the third column reports a count of two, and shows no step sections
- **AND** the collapsed checks rail docks at that summary's bottom edge

#### Scenario: The delete control deletes every step in the set

- **WHEN** the developer has selected three of five steps
- **AND** activates the delete control
- **THEN** the draft holds the other two steps alone
- **AND** the third column shows the checks rail

#### Scenario: Deleting the initial step moves the marker

- **WHEN** the set holds the draft's initial step and the developer deletes it
- **THEN** the draft's `workflow.initialStep` names the first remaining step

## MODIFIED Requirements

### Requirement: Selecting a node or edge shows its detail in a permanent, selection-driven inspector beside the canvas

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
developer selects exactly one step, or a path. It SHALL show the
selection's own count and delete control when the selection holds more
than one step. See the `studio-checks-rail` capability for the rail's own
collapsed presentation in the step-selected state.

The three columns SHALL fill the window's height that the screen's own
header rows leave, above a floor of 36rem. A window taller than that floor
therefore shows a taller canvas, and no empty band below the columns. A
window shorter than the floor holds the columns at the floor, and the page
scrolls. The columns keep their widths. The two side columns stay fixed,
and the canvas between them takes the rest.

#### Scenario: All three columns appear

- **WHEN** the canvas edit screen loads
- **THEN** the rail, the canvas, and the third column each appear as
  their own column

#### Scenario: The third column shows the checks rail with nothing selected

- **WHEN** the developer has selected no step and no path
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: The third column shows the inspector once the developer selects a step

- **WHEN** the developer selects one step, or a path
- **THEN** the third column shows the inspector, not the full checks
  rail

#### Scenario: The third column shows the count with several steps selected

- **WHEN** the developer selects more than one step
- **THEN** the third column shows the selection count and its delete
  control
- **AND** it shows neither the inspector nor the full checks rail

#### Scenario: A tall window grows the columns rather than leaving a band below them

- **WHEN** the canvas edit screen loads in a window whose remaining height
  is above the floor
- **THEN** the three columns end at the bottom of the window, and the
  canvas is taller than 36rem

#### Scenario: A short window holds the columns at the floor

- **WHEN** the canvas edit screen loads in a window whose remaining height
  is below the floor
- **THEN** the three columns keep the 36rem floor and the page scrolls to
  reach their bottom edge

<!-- Why: the header repeats the base spec's own wording character for
     character. A delta whose MODIFIED header differs adds a requirement
     rather than changing one. -->
<!-- antislop: allow passive-voice -->
### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Seven computations SHALL live in pure modules with `bun:test` coverage. Five
carry over unchanged: hit-testing, drag-delta computation, the auto-place
traversal, the connection-validity predicate and the fit-to-view computation.
Two are new. One is the rule that toggles a step in the selection set. The
other is the marquee's overlap test against node rectangles.
`packages/web/src/areas/app/screens/inboxLogic.ts` sets that convention. The
tests need not cover the SVG rendering or the pointer-event wiring.

#### Scenario: Connection validity holds without rendering

- **WHEN** a test gives the connection-validity predicate a step's existing
  paths and a candidate path
- **THEN** it returns accept or reject-with-reason, and the test needs no DOM
  or canvas rendering

#### Scenario: The fit computation holds without rendering

- **WHEN** a test gives the fit-to-view computation a content bounding box and
  a viewport size
- **THEN** it returns a zoom level and a pan offset, and the test needs no DOM
  or canvas rendering

#### Scenario: The selection toggle and the overlap test hold without rendering

- **WHEN** a test gives the toggle a list of ids and one more id
- **AND** gives the overlap test a rectangle and a list of node positions
- **THEN** each returns its own list of ids, and the test needs no DOM or
  canvas rendering
