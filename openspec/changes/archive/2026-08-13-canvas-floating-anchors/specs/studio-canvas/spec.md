## MODIFIED Requirements

### Requirement: A path renders as an orthogonal route, under one canvas-wide style

A path SHALL render as an orthogonal route rather than a straight line. Every
segment SHALL lie on one axis.

Each anchor SHALL sit at the midpoint of the side its own node turns toward
the other one. The larger of the two node-centre offsets SHALL pick the axis
for both anchors. A horizontal offset larger than the vertical one SHALL put
the anchors on a left and a right side. Otherwise they SHALL sit on a top and
a bottom side. The two anchors SHALL always sit on opposing sides, so both
leave on the same axis.

A zero offset on the chosen axis SHALL put the source anchor on the right
side. Two steps stacked on one position reach that case, and every path SHALL
draw.

An anchor SHALL NOT take a free angle on the node's border. A segment leaving
at an angle has no square turn, and every segment here stays on one axis.

The route SHALL leave each anchor along the axis that anchor sits on.

The segment count SHALL follow from the two anchors, on both axes.

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

<!-- Why: the header must match the base spec character for character, or the
     delta adds a requirement rather than modifying one. -->
<!-- antislop: allow passive-voice -->
### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Nine computations SHALL live in pure modules with `bun:test` coverage. Five
came first: hit-testing, drag-delta computation, the auto-place traversal, the
connection-validity predicate and the fit-to-view computation.

Two arrived with the selection set. One toggles a step in that set. The other
is the marquee's overlap test against node rectangles. The eighth is the edge
route between two anchors.

The ninth is the anchor rule. It takes two node positions. It returns the two
facing anchors and the axis they leave on.
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

- **WHEN** a test gives the anchor rule two node positions
- **THEN** it returns the two facing anchors and the axis they leave on
- **AND** the test needs no DOM or canvas rendering
