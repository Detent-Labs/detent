## MODIFIED Requirements

### Requirement: A path renders as an orthogonal route, under one canvas-wide style

A path SHALL render as an orthogonal route rather than a straight line. Every
segment SHALL lie on one axis.

Each anchor SHALL sit at the midpoint of one side of its own node. That side
is the one the node turns toward the next point on the route. For the source
anchor that point is the first waypoint. Without waypoints it is the target
node's centre. For the target anchor it is the last waypoint, or the source
node's centre.

The larger of the two offsets SHALL pick the axis. A horizontal offset larger
than the vertical one SHALL put the anchor on a left or a right side.
Otherwise it SHALL sit on a top or a bottom side.

A path with no waypoints SHALL therefore draw exactly as it drew before
waypoints existed. Its two anchors read offsets that negate each other
exactly. They land on opposing sides, and both leave on one axis.

A zero offset on the chosen axis SHALL put the anchor on the right
side. Two steps stacked on one position reach that case, and every path SHALL
draw.

An anchor SHALL NOT take a free angle on the node's border. A segment leaving
at an angle has no square turn, and every segment here stays on one axis.

The route SHALL leave each anchor along the axis that anchor sits on.

A path MAY carry an ordered list of waypoints. The route SHALL run from the
source anchor to the first waypoint. It SHALL run from each waypoint to the
next, and from the last waypoint to the target anchor. Every waypoint SHALL
lie on the drawn route.

A leg between two points SHALL draw as one straight segment, or as two when
the points share no axis. It SHALL carry no gutter. The gutter clears the node
an anchor sits on, and a waypoint has no box to clear.

The route SHALL NOT double back on itself at any point. Two consecutive
segments on one axis SHALL NOT travel in opposite directions.

The first leg SHALL travel first along its anchor's own axis. The last leg
SHALL arrive along the target anchor's axis. A leg between two waypoints SHALL
travel first along the larger offset between them.

The canvas-wide style SHALL govern every segment of a waypointed route. A path
SHALL NOT carry a style of its own. Switching the toolbar control SHALL
re-route the path between the same waypoints.

The segment count SHALL follow from the two anchors, on both axes. It governs
a path with no waypoints. A waypointed route takes its count from its legs
instead.

A target is ahead when its entry anchor sits beyond the source's exit anchor.
That reading runs along the leaving axis, in the leaving direction. An anchor
pair that is ahead and level on the other axis SHALL take one segment. That is
the common case: the auto-layout places a linear chain of steps on one row. An
anchor pair that is ahead and not level SHALL take three segments.

An anchor pair that is not ahead SHALL take five segments. The route has to
reach the target's entry edge from outside it.

Each turn SHALL sit a whole grid step clear of the node it leaves or enters.
That clearance runs along the axis the anchor leaves on. The turn's
other coordinate follows the anchor, which sits at the node's own middle.

Two styles SHALL ship, and no third. `step` draws square corners.
`smoothstep` draws the same route with rounded ones. There SHALL be no
straight style, and no style that reproduces the pre-change rendering.

The corner radius SHALL clamp to half the shorter of the two segments a corner
joins. A short segment therefore cannot carry an arc that overshoots its own
corner.

The route SHALL carry the pointer over its whole length. The area a developer
clicks SHALL follow the route. It SHALL NOT follow a straight line between the
anchors.

A guard label and a priority badge SHALL sit at the route's own midpoint.

The connect handle SHALL stay at the source node's right-middle, whatever
anchor a path leaving that node takes. The handle is a control an author
presses. A handle that moved under the pointer would be harder to press.

The drag-to-connect preview SHALL stay a straight line from that handle. It
follows the pointer and reaches no target. It has neither a route to draw nor
a side to face.

A selected path SHALL draw one handle at each of its waypoints, and one at the
route's midpoint. An unselected path SHALL draw none. The canvas holds at most
one selected path, so at most one path shows handles.

A handle SHALL draw after the guard label and the priority badge, which read
the same midpoint. A handle stays grabbable that way. It may cover part of a
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
draws as one or two segments, so the route carries more segments than the list
carries points.

Double-clicking a waypoint handle SHALL delete that waypoint. A path whose
last waypoint goes SHALL draw the direct route again. That is the whole of
reset, and nothing stores what the route was before.

#### Scenario: A path along one row draws straight

- **WHEN** a step has a path to a step placed to its right on the same row
- **THEN** the path renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step ahead of it on another row turns two corners

- **WHEN** a step has a path to a step placed to its right and one row down
- **AND** the horizontal gap is the larger of the two
- **THEN** the path renders as three axis-aligned segments, leaving the source
  horizontally and entering the target horizontally

#### Scenario: A path to a step below it leaves the bottom side

- **WHEN** a step has a path to a step placed below it
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's bottom-middle and enters the target's
  top-middle
- **AND** every segment lies on one axis

#### Scenario: A path to a step above it leaves the top side

- **WHEN** a step has a path to a step placed above it
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's top-middle and enters the target's
  bottom-middle

#### Scenario: A path to a step behind it on the same row draws straight

- **WHEN** a step has a path to a step placed to its left on the same row
- **AND** the two nodes do not overlap on the horizontal
- **THEN** the path leaves the source's left-middle and enters the target's
  right-middle
- **AND** it renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step behind it reaches the entry edge from outside

- **WHEN** a step has a path to a step placed to its left and one row down
- **AND** the two nodes overlap on the horizontal
- **THEN** the path renders as five axis-aligned segments
- **AND** it enters the target from outside the target's entry edge

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

#### Scenario: A guard label follows the route

- **WHEN** a guarded automatic path renders under either style
- **THEN** its guard label sits at the midpoint of the route
- **AND** it does not sit at the midpoint of a straight line between the
  anchors

#### Scenario: Clicking the route selects the path

- **WHEN** the developer clicks a route where it turns a corner, away from the
  straight line between its anchors
- **THEN** the canvas draws that path as selected

#### Scenario: The connect handle stays put while the anchor moves

- **WHEN** a step's only path leaves its bottom side
- **THEN** that step's connect handle still sits at its right-middle
- **AND** a drag from that handle still previews as a straight line to the
  pointer

#### Scenario: Dragging a step moves its anchors

- **WHEN** the developer drags a target step from the right of its source to
  below it
- **THEN** the path's anchors move to the facing sides, with no reload

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

<!-- Why: the header must match the base spec character for character, or the
     delta adds a requirement rather than modifying one. -->
<!-- antislop: allow passive-voice -->

### Requirement: The canvas edge style persists in the draft layout

One control on the canvas toolbar SHALL switch the style for the whole canvas.
No path SHALL carry a style of its own.

The choice SHALL persist as `layout.canvasEdgeStyle`. That key sits inside the
same opaque `layout` blob the draft round-trips for node positions. There SHALL
be no schema change and no API change.

An absent value SHALL read as `step`. A value this version does not know SHALL
also read as `step`, rather than failing the render.

A path's waypoints SHALL persist as `layout.waypoints[pathId]`, an ordered
list of points. That key sits in the same blob, and it is the second reserved
one.

An absent list SHALL read as no waypoints. So SHALL a value that is not a list
of points, rather than failing the render.

A path the author deletes MAY leave its list behind in `layout`. A step the
author deletes already leaves its position behind, and neither one reaches the
published body.

The reserved keys SHALL NOT collide with a node position. Every step id carries
a `step_` prefix, and the position reader admits only a point.

#### Scenario: The style survives a save and a reload

- **WHEN** the developer switches the style to `smoothstep` and saves the draft
- **AND** opens that draft's canvas again
- **THEN** the canvas draws the smooth style, and the control reports it

#### Scenario: A draft saved before this change renders as step

- **WHEN** a draft whose layout carries no `canvasEdgeStyle` opens
- **THEN** the canvas draws the square style, and the render does not fail

#### Scenario: An unknown style falls back rather than failing

- **WHEN** a draft's layout carries a `canvasEdgeStyle` this version does not
  know
- **THEN** the canvas draws the square style

#### Scenario: The style leaves node positions alone

- **WHEN** the developer switches the style and saves
- **THEN** every step keeps the position it had, and the layout still carries
  one entry per placed step

#### Scenario: Waypoints survive a save and a reload

- **WHEN** the developer bends a path and saves the draft
- **AND** opens that draft's canvas again
- **THEN** the path draws through the same waypoints

#### Scenario: A draft saved before waypoints renders without them

- **WHEN** a draft whose layout carries no `waypoints` opens
- **THEN** every path draws its direct route, and the render does not fail

#### Scenario: A malformed waypoint list falls back rather than failing

- **WHEN** a draft's `layout.waypoints` entry is not a list of points
- **THEN** that path draws its direct route

#### Scenario: Waypoints leave node positions and the style alone

- **WHEN** the developer bends a path and saves
- **THEN** every step keeps its position and the canvas keeps its style

<!-- Why: the header must match the base spec character for character, or the
     delta adds a requirement rather than modifying one. -->
<!-- antislop: allow passive-voice -->
### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Ten computations SHALL live in pure modules with `bun:test` coverage. Five
came first: hit-testing, drag-delta computation, the auto-place traversal, the
connection-validity predicate and the fit-to-view computation.

Two arrived with the selection set. One toggles a step in that set. The other
is the marquee's overlap test against node rectangles. The eighth is the edge
route between two anchors.

The ninth is the anchor rule. It takes a node position and the point that node
faces. It returns that node's anchor and the side it leaves on.

The tenth is the route through a waypoint list. It takes two node positions
and the list. It returns one polyline and the index at which each leg of that
polyline begins.
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

#### Scenario: The edge route holds without rendering

- **WHEN** a test gives the routing computation a source anchor, a target
  anchor and a style
- **THEN** it returns the route's corner points, and the test needs no DOM or
  canvas rendering

#### Scenario: The anchor rule holds without rendering

- **WHEN** a test gives the anchor rule a node position and a facing point
- **THEN** it returns that node's anchor and the side it leaves on
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The waypoint route holds without rendering

- **WHEN** a test gives the waypoint route two node positions and a list of
  points
- **THEN** it returns one polyline through every point in that list
- **AND** it returns the index at which each leg of that polyline begins
- **AND** the test needs no DOM or canvas rendering
