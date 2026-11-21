# Spec Delta

## MODIFIED Requirements

### Requirement: A path renders as an orthogonal route, under one canvas-wide style

A path SHALL render as an orthogonal route rather than a straight line. Every
segment SHALL lie on one axis.

A path end that stores a docking point SHALL anchor on that point. The
paragraphs below that choose a side govern an end that stores none.

Each such anchor SHALL sit at the midpoint of one side of its own box. That
side is the one the box turns toward the next point on the route. For the
source anchor that point is the first waypoint. Without waypoints it is the
target box's centre. For the target anchor it is the last waypoint, or the
source box's centre.

A box is a step node at the canvas node size. It is also a collapsed group, at
the group box's own size. The anchor rule SHALL read that size rather than
assume a node's. Nothing else about the rule changes.

The larger of the two offsets SHALL pick the axis. A horizontal offset larger
than the vertical one SHALL put the anchor on a left or a right side.
Otherwise it SHALL sit on a top or a bottom side.

A path with no waypoints and no stored docking point SHALL therefore draw
exactly as it drew before waypoints existed. Its two anchors read offsets that
negate each other exactly. They land on opposing sides, and both leave on one
axis.

A zero offset on the chosen axis SHALL put the anchor on the right
side. Two steps stacked on one position reach that case, and every path SHALL
draw.

An anchor SHALL NOT take a free angle on the node's border. A segment leaving
at an angle has no square turn, and every segment here stays on one axis.

The route SHALL leave each anchor along the axis that anchor sits on.

A path whose source or target sits inside a collapsed group SHALL anchor on
that group's box. It SHALL NOT anchor on the hidden member. A path between two
members of one collapsed group SHALL NOT render at all.

A path MAY carry an ordered list of waypoints. The route SHALL run from the
source anchor to the first waypoint. It SHALL run from each waypoint to the
next, and from the last waypoint to the target anchor. Every waypoint SHALL
lie on the drawn route.

<!-- antislop: allow negation-habit -->
<!-- Why: the line repeats the live spec's wording verbatim; this change edits another sentence of the block. -->
A leg between two points SHALL draw as one straight segment, or as two when
the points share no axis. It SHALL carry no gutter. The gutter clears the node
an anchor sits on, and a waypoint has no box to clear. A leg at a stored
docking point can face away from its waypoint. That leg is the one exception,
and the docking point requirements state it.

The route SHALL NOT double back on itself at any point. Two consecutive
segments on one axis SHALL NOT travel in opposite directions.

The first leg SHALL travel first along its anchor's own axis. The last leg
SHALL arrive along the target anchor's axis. A leg between two waypoints SHALL
travel first along the larger offset between them.

The canvas-wide style SHALL govern every segment of a waypointed route. A path
SHALL NOT carry a style of its own. Switching the toolbar control SHALL
re-route the path between the same waypoints.

The segment count SHALL follow from the two anchors, on both axes. It governs
a path with no waypoints whose anchors sit on opposing sides. A waypointed
route takes its count from its legs instead. A path whose anchors sit on any
other pair of sides takes the route the docking point requirements state.

A target is ahead when its entry anchor sits beyond the source's exit anchor.
That reading runs along the leaving axis, in the leaving direction. An anchor
pair that is ahead and level on the other axis SHALL take one segment. That is
the common case: the auto-layout places a linear chain of steps on one row. An
anchor pair that is ahead and not level SHALL take three segments.

An anchor pair that is not ahead SHALL take five segments. The route has to
reach the target's entry edge from outside it.

Each turn SHALL sit a whole grid step clear of the node it leaves or enters.
That clearance runs along the axis the anchor leaves on. The turn's
other coordinate follows the anchor.

Two styles SHALL ship, and no third. `step` draws square corners.
`smoothstep` draws the same route with rounded ones. There SHALL be no
straight style, and no style that reproduces the pre-change rendering.

The corner radius SHALL clamp to half the shorter of the two segments a corner
joins. A short segment therefore cannot carry an arc that overshoots its own
corner.

The route SHALL carry the pointer over its whole length. The area a developer
clicks SHALL follow the route. It SHALL NOT follow a straight line between the
anchors.

A way out's sentence SHALL sit on its own route, by the placement rule this
capability states for it.

A connect handle SHALL stay on its own docking point, whatever anchor a path
on that node takes. The handle is a control an author presses. A handle that
moved under the pointer would be harder to press.

The drag-to-connect preview SHALL stay a straight line from the pressed
handle. It follows the pointer. Over a step it SHALL end on that step's
nearest docking point. It has no route to draw.

A selected path SHALL draw one handle at each of its waypoints, and one at the
route's midpoint. An unselected path SHALL draw none. The canvas holds at most
one selected path, so at most one path shows handles.

A handle SHALL draw after the way out's sentence, which reads the same
midpoint. A handle stays grabbable that way. It may cover part of a
label, and an author reading a guard deselects the path to clear the handles.

A waypoint handle SHALL draw after the midpoint handle and take the pointer
where the two coincide. A symmetric bend puts the route midpoint on the
waypoint itself, and only the waypoint handle answers a double-click.

Dragging the midpoint handle SHALL add a waypoint at the release point.
Dragging a waypoint handle SHALL move that waypoint. Each SHALL land on the
canvas lattice, the way a dragged step already does.

A new waypoint SHALL take the position in the list that keeps the route's
order. The midpoint handle sits on one leg of the route, and the new waypoint
goes at that leg's own index.

A route segment's index SHALL NOT stand in for a waypoint's index. One leg
draws as one to four segments, so the route carries more segments than the list
carries points.

Double-clicking a waypoint handle SHALL delete that waypoint. A path whose
last waypoint goes SHALL draw the direct route again. That is the whole of
reset, and nothing stores what the route was before.

#### Scenario: A path along one row draws straight

- **WHEN** a step has a path to a step placed to its right on the same row
- **AND** neither end stores a docking point
- **THEN** the path renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step ahead of it on another row turns two corners

- **WHEN** a step has a path to a step placed to its right and one row down
- **AND** neither end stores a docking point
- **AND** the horizontal gap is the larger of the two
- **THEN** the path renders as three axis-aligned segments, leaving the source
  horizontally and entering the target horizontally

#### Scenario: A path to a step below it leaves the bottom side

- **WHEN** a step has a path to a step placed below it
- **AND** neither end stores a docking point
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's bottom-middle and enters the target's
  top-middle
- **AND** every segment lies on one axis

#### Scenario: A path to a step above it leaves the top side

- **WHEN** a step has a path to a step placed above it
- **AND** neither end stores a docking point
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's top-middle and enters the target's
  bottom-middle

#### Scenario: A path to a step behind it on the same row draws straight

- **WHEN** a step has a path to a step placed to its left on the same row
- **AND** neither end stores a docking point
- **AND** the two nodes do not overlap on the horizontal
- **THEN** the path leaves the source's left-middle and enters the target's
  right-middle
- **AND** it renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step behind it reaches the entry edge from outside

- **WHEN** a step has a path to a step placed to its left and one row down
- **AND** neither end stores a docking point
- **AND** the two nodes overlap on the horizontal
- **THEN** the path renders as five axis-aligned segments
- **AND** it enters the target from outside the target's entry edge

<!-- antislop: allow negation-habit -->
<!-- Why: the scenario name repeats the live spec's, so the delta can match it. -->
#### Scenario: A straight route carries no arc under either style

- **WHEN** a same-row path renders under `smoothstep`
- **THEN** it draws as one straight segment, with no arc at either end

#### Scenario: The smooth style rounds the same route

- **WHEN** the developer switches the style to `smoothstep`
- **THEN** every path keeps its corner points and draws each corner as an arc

#### Scenario: A short segment does not overshoot its corner

- **WHEN** two steps sit close enough that a route segment is shorter than
  twice the corner radius
- **THEN** the arc clamps to half that segment, and the route stays within its
  own corner points

<!-- The scenario name repeats the live spec's; a MODIFIED block cannot rename a scenario. -->
#### Scenario: A guard label follows the route

- **WHEN** a way out with a sentence renders under either style, over open
  canvas
- **THEN** its sentence centres on the midpoint of the route
- **AND** it does not sit at the midpoint of a straight line between the
  anchors

#### Scenario: Clicking the route selects the path

- **WHEN** the developer clicks a route where it turns a corner, away from the
  straight line between its anchors
- **THEN** the canvas draws that path as selected

#### Scenario: The connect handle stays put while the anchor moves

- **WHEN** a step's only path leaves its bottom side
- **THEN** each of that step's connect handles still sits on its own docking
  point
- **AND** a drag from one of them still previews as a straight line to the
  pointer

#### Scenario: Dragging a step moves its anchors

- **WHEN** the developer drags a target step from the right of its source to
  below it
- **THEN** both anchors move with their own steps, with no reload
- **AND** each stays on the docking point it held before the drag

#### Scenario: A waypointed route passes through its waypoint

- **WHEN** a path carries one waypoint
- **THEN** the drawn route passes through that point
- **AND** every segment lies on one axis

#### Scenario: A waypointed route never doubles back

- **WHEN** a path carries a waypoint the route reaches head-on
- **THEN** no segment of the route travels back along the one before it
- **AND** no spike stands out of the route at that waypoint

#### Scenario: A waypoint above the two steps turns the route above them

- **WHEN** a path between two steps on one row carries a waypoint above both
- **THEN** the route leaves the source, rises to that waypoint, and comes back
  down into the target

#### Scenario: The source anchor faces the first waypoint

- **WHEN** a path to a step on its right carries a first waypoint above the
  source
- **AND** its source end stores no docking point
- **THEN** the route leaves the source's top side rather than its right side

#### Scenario: The style still governs a waypointed route

- **WHEN** a path carrying waypoints renders under `smoothstep`
- **THEN** every corner of every leg draws as an arc
- **AND** the waypoints do not move

#### Scenario: Only a selected path shows handles

- **WHEN** the developer selects a path
- **THEN** that path draws a handle at each waypoint and one at its midpoint
- **AND** no other path draws a handle

#### Scenario: Dragging the midpoint handle adds a waypoint

- **WHEN** the developer drags a selected path's midpoint handle and releases
- **THEN** the path carries one more waypoint, at the released point rounded
  to the lattice
- **AND** the route passes through it

#### Scenario: Dragging a waypoint handle moves that waypoint

- **WHEN** the developer drags an existing waypoint handle and releases
- **THEN** that waypoint sits at the released point rounded to the lattice
- **AND** the list holds the same number of waypoints as before

#### Scenario: Double-clicking a waypoint handle deletes it

- **WHEN** the developer double-clicks a waypoint handle
- **THEN** the path carries one fewer waypoint

#### Scenario: Deleting the last waypoint restores the direct route

- **WHEN** the developer deletes a path's only waypoint
- **THEN** the path draws the route it drew before any waypoint existed


### Requirement: Arrange confirms before discarding a hand-placed layout

Arrange SHALL ask the author to confirm before it runs, in the studio's
dialog form. This holds
whenever the draft carries at least one step with an explicit stored
position, or at least one waypoint. One stored docking point SHALL ask for it
too. A draft with none of the three SHALL arrange with no confirmation, since
nothing hand-placed is at risk. The confirmation text SHALL say that each
path loses the bends placed on it, the author's word for a waypoint. It SHALL
also say that each path goes back to the middle of a side.

#### Scenario: A brand-new canvas arranges without a confirmation

- **WHEN** every step in the draft is still at its computed default,
  with no explicit stored position
- **AND** no path in the draft carries a waypoint or a stored docking point
- **AND** an author activates Arrange
- **THEN** the layout updates with no confirmation step

#### Scenario: A hand-placed draft confirms before arranging

- **WHEN** at least one step in the draft carries an explicit stored
  position
- **AND** an author activates Arrange
- **THEN** Arrange asks the author to confirm before the layout updates

#### Scenario: A waypoint-only draft confirms before arranging

- **WHEN** no step in the draft carries an explicit stored position,
  but at least one path carries a waypoint
- **AND** an author activates Arrange
- **THEN** Arrange asks the author to confirm before the layout updates

#### Scenario: Declining the confirmation leaves the layout untouched

- **WHEN** the confirmation appears and the author declines it
- **THEN** the draft's stored layout keeps its prior positions

#### Scenario: The confirmation names the waypoints an arrange will clear

- **WHEN** the draft carries at least one waypoint and an author
  activates Arrange
- **THEN** the confirmation text says each path loses the bends placed on it

#### Scenario: A draft with stored docking points alone confirms before arranging

- **WHEN** no step carries an explicit stored position and no path carries a
  waypoint
- **AND** one path stores a docking point
- **AND** an author activates Arrange
- **THEN** Arrange asks the author to confirm before the layout updates
- **AND** the confirmation text says each path goes back to the middle of a
  side

### Requirement: The connect handle explains its gesture

The connect handle SHALL carry a hover tooltip that says what a drag from it
does. It reads: "Drag to a step to add a way out, or to empty space to add a
new step." An end step's handle SHALL read: "An end has no way out."

Each docking point's press target SHALL reach 12px outward from the node's
border and 6px inward. That holds at a canvas scale of 1. Neighbouring targets meet
halfway along a side, and the nearer point takes the press. A press deeper
inside the node SHALL move the step, as it does today. The cursor SHALL read
as a crosshair, and as not-allowed on an end step.

#### Scenario: Hovering the handle names the gesture

- **WHEN** the author rests the pointer on a task step's connect handle
- **THEN** the tooltip names both drags: to a step, and to empty space
- **AND** the cursor is a crosshair

#### Scenario: An end step's handle says why it does nothing

- **WHEN** the author rests the pointer on an end step's connect handle
- **THEN** a tooltip reads "An end has no way out."
- **AND** the cursor reads not-allowed

#### Scenario: The handle is easy to hit

- **WHEN** the author presses 10px outward from a docking point on a node's
  right side, at a canvas scale of 1
- **THEN** the press starts a connect drag

#### Scenario: A press inside the node moves the step

- **WHEN** the author presses 10px inside a node's border and drags
- **THEN** the step moves, and no connect drag starts

## ADDED Requirements

### Requirement: A step node carries fixed docking points

Every step node SHALL carry docking points on its border. The left and the
right side SHALL hold three each. The top and the bottom side SHALL hold seven
each. Neighbours SHALL stand one grid step apart, and the middle point of a
side SHALL sit at that side's midpoint.

A docking point has no direction. A path SHALL be free to leave from any
point and to arrive at any point. Several path ends SHALL be free to share
one.

#### Scenario: A node carries twenty points

- **WHEN** the canvas draws the docking points of one step node
- **THEN** it draws three on the left side and three on the right side
- **AND** it draws seven on the top side and seven on the bottom side

#### Scenario: The middle point sits at the side's midpoint

- **WHEN** the canvas draws a node's docking points
- **THEN** the second point on its right side sits at that side's midpoint
- **AND** the fourth point on its top side sits at that side's midpoint

#### Scenario: One point takes a path in and a path out

- **WHEN** a path arrives at the top-middle point of step "Review"
- **AND** the author drags a new way out from that same point to another step
- **THEN** both paths end on that one point

### Requirement: Docking points draw on a pointed-at or selected step, and during a drag

The canvas SHALL draw a step's docking points while the pointer rests on that
step. A point's press target counts as the step. It SHALL draw them on a
selected step. It SHALL draw them on a step under a connect drag or an end
handle drag. In
every other case the canvas SHALL draw none.

A point that holds a path end SHALL draw filled, and a free point SHALL draw
as an outline. An end step's points SHALL draw dashed. A collapsed group's box
SHALL draw none.

#### Scenario: A resting canvas draws no points

- **WHEN** the selection is empty and the pointer rests on empty canvas
- **THEN** the canvas draws no docking point

#### Scenario: Pointing at a step draws its points

- **WHEN** the author rests the pointer on the node of step "Review"
- **THEN** the canvas draws the twenty docking points of "Review"
- **AND** it draws none on any other step

#### Scenario: A selected step keeps its points

- **WHEN** the author selects step "Review" and moves the pointer away
- **THEN** the canvas still draws the docking points of "Review"

#### Scenario: A held point draws filled

- **WHEN** a path leaves the right-middle point of a selected step
- **THEN** that point draws filled, and a point no path end sits on draws as
  an outline

### Requirement: Every docking point is a connect handle

A press on a drawn docking point SHALL start a connect drag from that point.
A step node SHALL have no other connect handle, so the handle at a node's
right middle goes. Where the press targets of two points overlap, the point
nearer to the press SHALL take it. Every rule this capability states for the
connect handle SHALL hold for each docking point, an end step's refusal
included.

#### Scenario: A drag starts at the pressed point

- **WHEN** the author presses the first point on the top side of "Review" and
  drags
- **THEN** the connect preview starts at that point

#### Scenario: A press between two points takes the nearer one

- **WHEN** the author presses 4px left of the middle point on a node's top
  side, at a canvas scale of 1
- **THEN** the connect drag starts at the middle point

#### Scenario: A resting node draws no handle

- **WHEN** the canvas draws a step the pointer is away from, with no selection
- **THEN** the node draws no connect handle at its right middle

#### Scenario: An end step's points refuse a drag

- **WHEN** the author presses a docking point of an end step and drags to
  another step
- **THEN** no new path exists in the Draft model
- **AND** the inline rejection appears, as it does today

### Requirement: A connect drag stores the points it joins

A connect drag released over a step SHALL end on that step's docking point
nearest to the release. A release on a press target of that step counts as a
release over it. The new path SHALL store the pressed point as its
source point and that nearest point as its target point. A drag released over
empty canvas SHALL store the source point alone. A way out added by any route
other than a drag SHALL store no point.

#### Scenario: A drag between two steps stores both points

- **WHEN** the author drags from the bottom-middle point of "Review"
- **AND** releases nearest to the first point on the left side of "Approve"
- **THEN** the new path leaves "Review" at its bottom-middle point
- **AND** it arrives at the first point on the left side of "Approve"
- **AND** the draft layout stores both points for that path

#### Scenario: A drag to empty canvas stores the source point

- **WHEN** the author drags from the top-middle point of "Review" to empty
  canvas
- **THEN** the new path leaves "Review" at its top-middle point
- **AND** the draft layout stores no target point for that path

#### Scenario: A way out added from the menu stores no point

- **WHEN** a keyboard author adds a way out through the way-out menu
- **THEN** the draft layout stores no docking point for that path
- **AND** each end takes the midpoint of the side the automatic rule picks

### Requirement: A path end stays on its stored docking point

A path end that stores a docking point SHALL anchor on that point. It SHALL
stay there when its own step moves, and when the step at the path's other end
moves. A waypoint change SHALL leave it there too. The route between the two
anchors SHALL redraw, and neither anchor SHALL change its point.

#### Scenario: Moving a step leaves the path on its points

- **WHEN** a path stores the right-middle point of "Review" and the left-middle
  point of "Approve"
- **AND** the author drags "Approve" from the right of "Review" to below it
- **THEN** the path still leaves "Review" at its right-middle point
- **AND** it still arrives at the left-middle point of "Approve"

#### Scenario: Bending a path leaves its ends on their points

- **WHEN** a path stores both of its points
- **AND** the author drags its midpoint handle above both steps
- **THEN** each end still sits on the point it stored

### Requirement: A step move stores the points of the paths on it

A drag that moves steps SHALL first read every path that starts or ends on a
moved step. An end of such a path may store no docking point. The drag SHALL
store the point that end held before it. That store
SHALL travel in the same layout write as the new positions. A press that moves
no step SHALL store nothing. Opening a draft SHALL store nothing.

#### Scenario: A first move keeps the side an author saw

- **WHEN** a path stores no docking point and leaves "Review" at its
  right-middle point for "Approve" on its right
- **AND** the author drags "Approve" to below "Review"
- **THEN** the path still leaves "Review" at its right-middle point
- **AND** the draft layout now stores both points of that path

#### Scenario: A drag of several steps stores each of their paths

- **WHEN** the selection holds two steps and the author drags one of them
- **THEN** each path on either step stores every end that sits on a step node

#### Scenario: A click on a step stores nothing

- **WHEN** the author presses and releases on a node with no pointer movement
- **THEN** the draft layout stores no new docking point

#### Scenario: Opening an older draft writes nothing

- **WHEN** a draft whose layout has no `dockingPoints` key opens on the Map tab
- **THEN** the state line does not read Unsaved changes
- **AND** every path draws the route it drew before this change

### Requirement: A selected path's end hangs on another point of its step

A selected path SHALL draw one end handle at each of its two ends. Dragging
an end handle SHALL draw the docking points of that end's own step. A release
on that step or on one of its press targets SHALL store the nearest point for
that end. A release anywhere else SHALL change nothing. The drag
SHALL leave the Draft model as it was. The handle's tooltip SHALL read: "Drag
to another point on this step."

#### Scenario: An end moves to another point

- **WHEN** the author selects a path that arrives at the left-middle point of
  "Approve"
- **AND** drags its target end handle to the top-middle point of "Approve"
- **THEN** the path arrives at the top-middle point of "Approve"
- **AND** its source end keeps the point it had

#### Scenario: A release away from the step changes nothing

- **WHEN** the author drags an end handle and releases over empty canvas
- **THEN** the end sits on the point it had before the drag

#### Scenario: A release over another step changes nothing

- **WHEN** the author drags the target end handle of a path into "Approve"
- **AND** releases over the node of "Reject"
- **THEN** the path still names "Approve" as its target
- **AND** the end sits on the point it had before the drag

#### Scenario: The end handle takes the press over its docking point

- **WHEN** a selected path's end handle sits on a drawn docking point
- **AND** the author presses there and drags
- **THEN** the drag moves that end, and no connect drag starts

### Requirement: A route joins any two sides

A path may have no waypoints and at least one stored docking point. It SHALL
then draw an orthogonal route between its two anchors, on any pair of sides. The
route SHALL leave each anchor outward, along that side's own axis. It SHALL
hold at most five segments and SHALL NOT double back. Each turn SHALL sit a
whole grid step clear of the node it leaves or enters. Two anchors on opposing
sides that face each other SHALL take the route this capability already
states for that pair.

#### Scenario: Stored opposing midpoints draw the automatic route

- **WHEN** a path stores the right-middle point of its source and the
  left-middle point of a target on its right
- **THEN** it draws the route it would draw with no stored point

#### Scenario: A turn onto a neighbouring side takes two segments

- **WHEN** a path leaves the right-middle point of its source
- **AND** arrives at the top-middle point of a target
- **AND** that point lies a grid step or more right of the source's right side
- **AND** it lies a grid step or more below the source anchor
- **THEN** the route holds two segments, one level and one upright

#### Scenario: Two anchors on one side draw around

- **WHEN** a path leaves the top-middle point of its source
- **AND** arrives at the top-middle point of a target on the same row
- **THEN** the route holds three segments and passes above both nodes

#### Scenario: An anchor facing away reaches the target from outside

- **WHEN** a path leaves the left-middle point of its source
- **AND** arrives at the right-middle point of a target on the source's right
- **THEN** the route holds five segments
- **AND** every segment lies on one axis

### Requirement: A route stays out of its own two boxes

A route between two anchors SHALL NOT cross the inside of its source box or
of its target box. It SHALL NOT run along a border of either. Both SHALL hold where the two boxes stand two grid steps
apart or more on one axis. Closer than that, the route SHALL still draw.

#### Scenario: A route around its own source

- **WHEN** a path leaves the left-middle point of its source
- **AND** its target stands on the source's right, two grid steps away or more
- **THEN** no segment of the route crosses the inside of either node

#### Scenario: Two touching nodes still draw a path

- **WHEN** a path with stored points joins two nodes that stand closer than
  two grid steps
- **THEN** the canvas draws a route for it

### Requirement: A waypointed route keeps its stored docking points

A path with waypoints SHALL run from its stored source point to the first
waypoint. It SHALL run from the last waypoint to its stored target point. A leg at a
stored point SHALL leave along that point's own side. Where the waypoint lies
behind that side, the leg SHALL first run one grid step outward. It SHALL then
pass the node one grid step clear, in at most four segments. That leg carries
a gutter, and no other leg does.

#### Scenario: A waypoint ahead of a stored point draws the plain leg

- **WHEN** a path stores the right-middle point of its source
- **AND** its first waypoint lies to the right of that point
- **THEN** the first leg draws as one segment, or as two

#### Scenario: A waypoint behind a stored point draws around the node

- **WHEN** a path stores the right-middle point of its source
- **AND** its first waypoint lies to the left of the source node, on the
  node's own row
- **THEN** the route leaves the right side by one grid step before it turns
- **AND** it passes above or below the node, one grid step clear
- **AND** no segment crosses the inside of the source node

### Requirement: A step move stores nothing for an end on a collapsed group's box

A step move SHALL store nothing for a path end that sits on a collapsed
group's box. The other end of that path SHALL store the point it held, read
against the box. A path between two members of one collapsed group SHALL store
nothing, since it draws no point.

#### Scenario: A hidden end stores nothing

- **WHEN** a path runs from "Review" to a step inside a collapsed group
- **AND** neither end stores a docking point
- **AND** the author drags "Review"
- **THEN** the draft layout stores a source point for that path
- **AND** it stores no target point for it

#### Scenario: A path inside a collapsed group stores nothing

- **WHEN** the author drags a collapsed group that holds both ends of a path
- **THEN** the draft layout stores no docking point for that path

### Requirement: A connect drag released on its own step joins two points

A connect drag that ends on its source step SHALL take a target point other
than the pressed one. That point SHALL be the nearest one to the release. The
path SHALL draw around the node and SHALL NOT cross its inside.

#### Scenario: A self path leaves and arrives at two points

- **WHEN** the author drags from the top-middle point of "Review"
- **AND** releases on "Review" beside that same point
- **THEN** the new path leaves at the top-middle point
- **AND** it arrives at a neighbouring point, outside the node

### Requirement: A docking point has no panel route and no key

A docking point is a drawing aid in the draft layout, as a waypoint is. It
SHALL reach no definition. The canvas SHALL offer it through the pointer
alone, with no panel route and no key.

#### Scenario: Hanging an end leaves the definition alone

- **WHEN** the author hangs a path end on another docking point
- **THEN** the Draft model equals the one before the drag
- **AND** the draft layout alone differs

### Requirement: Docking points persist in the draft layout

A path's stored points SHALL persist as `layout.dockingPoints[pathId]`, the
fourth reserved key of that blob. An entry holds a source end, a target end or
both. Each end names a side and a whole-number position counted from that
side's middle point. There SHALL be no schema change and no API change. An
absent entry or end SHALL read as no stored point. So SHALL an end naming no
side, or a position the side does not hold.

#### Scenario: Stored points survive a save and a reload

- **WHEN** the author connects two steps by a drag and the draft saves
- **AND** the author opens that draft's canvas again
- **THEN** the path leaves and arrives at the same two points

#### Scenario: A malformed entry falls back

- **WHEN** a draft's `layout.dockingPoints` entry is not an object of ends
- **THEN** both ends of that path take the automatic side
- **AND** the render does not fail

#### Scenario: A position the side does not hold falls back

- **WHEN** a stored source end names the left side and a position five from
  its middle
- **THEN** that end takes the automatic side
- **AND** the target end keeps its own stored point

#### Scenario: A deleted path may leave its entry behind

- **WHEN** the author deletes a path that stores docking points
- **THEN** the canvas draws the remaining paths as before
- **AND** the published body has no docking point

### Requirement: Arrange clears the draft's stored docking points

Activating Arrange SHALL clear every entry from the draft's stored docking
points. An author chose each point for the places the two steps held, and an
arrange moves both. Every path SHALL then take the automatic side again.

#### Scenario: Arrange clears a stored point

- **WHEN** a path stores both of its points and an author confirms Arrange
- **THEN** the saved layout has no docking point for that path afterward
- **AND** each of its ends sits at the midpoint of a side

### Requirement: The insert keeps the split path's source point

A step dropped on a path SHALL leave the retargeted path's stored source
point in place. It SHALL clear that path's stored target point, since the path
now ends on another step. The new path SHALL store no point.

#### Scenario: The retargeted path keeps where it leaves

- **WHEN** a path stores the bottom-middle point of "Submit" and a point on
  "Approve"
- **AND** the developer drops a new Step on that path
- **THEN** the path still leaves "Submit" at its bottom-middle point
- **AND** the layout stores no target point for it
- **AND** the layout stores no point for the new path

### Requirement: A path on a collapsed group's box takes the automatic side

A path end that sits on a collapsed group's box SHALL take the automatic
side on that box. A point stored for the hidden member SHALL stay stored.
Expanding the group SHALL put the end back on that point.

#### Scenario: Collapsing and expanding keeps a stored point

- **WHEN** a path stores the top-middle point of a step inside a group
- **AND** the developer collapses that group and expands it again
- **THEN** the path ends on the top-middle point of that step

#### Scenario: A collapsed box draws the automatic anchor

- **WHEN** a path stores a point on a step inside a collapsed group
- **THEN** the path ends at the midpoint of one side of the group's box

### Requirement: Docking point logic lives in pure, tested functions

Six more computations SHALL live in pure modules with `bun:test` coverage.
The first returns the docking points of a box. The second returns the point
nearest to a position. The third turns a stored end into an anchor. The
fourth reads an anchor back as a side and a position.

The fifth returns the route between two anchors and their sides. The sixth
returns the points a step move stores. None of the six SHALL read the DOM.

#### Scenario: The docking point computations hold without rendering

- **WHEN** a test gives the nearest-point computation a box and a position
- **AND** gives the route computation two anchors and their two sides
- **THEN** each returns its result
- **AND** each test runs without a DOM or a rendered canvas
