## ADDED Requirements

### Requirement: A path renders as an orthogonal route, under one canvas-wide style

A path SHALL render as an orthogonal route rather than a straight line. The
route SHALL leave the source anchor horizontally and enter the target anchor
horizontally. Every segment SHALL lie on one axis.

The segment count SHALL follow from the two anchors, on both axes.

A target whose entry anchor sits strictly right of the source's exit anchor is
ahead. An anchor pair that is ahead and on the same row SHALL take one segment.
That is the common case: the auto-layout places a linear chain of steps on one
row. An anchor pair that is ahead and on different rows SHALL take three
segments.

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

The drag-to-connect preview SHALL stay a straight line. It follows the pointer
and reaches no target, so it has no route to draw.

#### Scenario: A path along one row draws straight

- **WHEN** a step has a path to a step placed to its right on the same row
- **THEN** the path renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step ahead of it on another row turns two corners

- **WHEN** a step has a path to a step placed to its right and one row down
- **THEN** the path renders as three axis-aligned segments, leaving the source
  horizontally and entering the target horizontally

#### Scenario: A path to a step behind it reaches the entry edge from outside

- **WHEN** a step has a path to a step placed to its left
- **THEN** the path renders as five axis-aligned segments, and it enters the
  target from outside the target's entry edge

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

### Requirement: The canvas edge style persists in the draft layout

One control on the canvas toolbar SHALL switch the style for the whole canvas.
No path SHALL carry a style of its own.

The choice SHALL persist as `layout.canvasEdgeStyle`. That key sits inside the
same opaque `layout` blob the draft round-trips for node positions. There SHALL
be no schema change and no API change.

An absent value SHALL read as `step`. A value this version does not know SHALL
also read as `step`, rather than failing the render.

The reserved key SHALL NOT collide with a node position. Every step id carries
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

## MODIFIED Requirements

<!-- Why: the header repeats the base spec's own wording character for
     character. A delta whose MODIFIED header differs adds a requirement
     rather than changing one. -->
<!-- antislop: allow passive-voice -->
### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Eight computations SHALL live in pure modules with `bun:test` coverage. Five
came first: hit-testing, drag-delta computation, the auto-place traversal, the
connection-validity predicate and the fit-to-view computation.

Two arrived with the selection set. One toggles a step in that set. The other
is the marquee's overlap test against node rectangles. The eighth is the edge
route between two anchors.
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
