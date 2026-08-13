## Context

See `proposal.md` for motivation. The design of record for roadmap stages 30
to 33 is the `design.md` of
`openspec/changes/archive/2026-08-13-canvas-edge-routing-styles`. Its "Stage
33" section settles the tension the roadmap flagged. A waypoint feeds the route
rather than escaping it. `routeEdge` therefore runs once per consecutive pair.
The canvas-wide style governs every one of those segments.

That design predates one thing. `canvas-floating-anchors` shipped earlier the
same day. Its `anchorsForEdge(source, target)` takes two NODE positions. It
returns both facing anchors and the direction they leave on. A waypoint is a
bare point, not a node, so this design settles what the anchors face.

What the code holds today, in `canvas/geometry.ts`:

- `anchorsForEdge(source, target)` reads `|dx| >= |dy|` between two node
  positions and returns `{ source, target, leaving }`.
- `routeEdge(source, target, leaving)` maps both points into a canonical space,
  runs `routeRightward`, and maps every point back.
- `snapToGrid` rounds to `GRID_STEP`, and `midpointOfRoute` returns the
  half-way point and the segment index it falls on.

`EditScreen.tsx` reads `layout.canvasEdgeStyle` and writes it through
`setSaveState`. `onMoveStep` writes a step's position the same way.

## Goals / Non-Goals

**Goals:**

- An author bends an edge, and the bend survives a save.
- The bent route obeys the canvas style, the lattice, and the anchor rule.
- A path with no waypoints renders byte for byte as it renders today.

**Non-Goals:**

- Obstacle avoidance. Stage 30 decided against it, and a waypoint is the
  author's own answer to an obstacle.
- A per-path style. Stage 30 rejected it, and this change keeps it rejected.
- A memory of the route before a reset. Deleting a waypoint is the reset, and
  it stores nothing.
- Waypoints in the published body. They are presentation, so they live in the
  `layout` blob. They never reach `ProcessBody`, and so never reach
  `definitionHash`. A bent edge is invisible to the engine.
- A delete affordance drawn on the edge for the PATH itself. Stage 31 deferred
  that, and the inspector deletes a path already.

## Decisions

### The anchor rule takes a point, not a node

`anchorsForEdge` splits. `anchorSideToward(node, point)` returns one node's
anchor and the side it leaves on. The pair function calls it twice.

For a path with no waypoints, each node faces the other node's centre. Both
nodes are the same size, so those two offsets negate each other exactly. The
sides come out opposing and the axis comes out shared, which is what the pair
function computes today. The split is therefore behaviour-preserving, and the
existing anchor tests prove it rather than needing rewriting.

With waypoints, the source faces the first waypoint and the target faces the
last. An edge that must climb over a step now leaves the top side. That is the
whole point of dragging the waypoint up there.

The alternative was to keep the anchors facing the other NODE and let the
waypoints bend only the middle. That draws an edge leaving rightward and
immediately turning back up, which reads as a mistake rather than a route.

### One leg is one L, and it carries no gutter

`routeThroughWaypoints(source, target, waypoints)` walks the point list
`[sourceAnchor, ...waypoints, targetAnchor]`. Each consecutive pair draws as
one straight segment, or as two when the pair shares no axis.

A path with no waypoints skips all of that and calls `routeEdge`, so it draws
exactly as it drew before. The canvas-wide style still governs a waypointed
route: `routePath` rounds corner points and never asks where they came from.

The first draft of this decision ran `routeEdge` per leg. That is the design
of record's own sentence made literal, and the browser check refuted it.

`routeEdge` puts a gutter one grid step out from the point it leaves. The
gutter exists to clear the node an anchor sits on. A waypoint has no box to
clear. The route reached the apex, turned back 20 units along its own line,
and drew a spike out of the bend.

A leg therefore carries no gutter. The first leg travels first along its
anchor's own axis. The last leg arrives along the target anchor's axis. A leg
between two waypoints leads with its own larger offset.

A test now pins it. No two consecutive segments on one axis may travel in
opposite directions.

### Handles belong to the selected path alone

The canvas already holds at most one `selectedPathId`. Handles on every path
would put a control every twenty pixels on a busy graph.

A selected path draws one handle per waypoint. It draws one more at the
route's midpoint. `midpointOfRoute` returns that point already. It returns the
index of the route segment the point falls on.

That index names a segment of the drawn polyline. It does NOT name a position
in the waypoint list. One leg expands into two to six points, so segment 4 of
the polyline names nothing in a two-item list.

`routeThroughWaypoints` therefore returns `legStarts` beside its points. Each
entry is the index at which one leg begins. The insert goes at the leg whose
range holds the midpoint's segment.

Three controls read the route midpoint, and two of them are text. The priority
badge sits 6 above it and a guard label 4 below. The handle draws after both,
so it stays grabbable. It covers part of a label at that point. An author
reading a guard deselects the path to clear the handles.

The handles therefore render in the late pass the guard labels already use.
That pass runs after every node. `.canvas-node-rect` is opaque, so the edge
group's own children sit behind a nearby node's fill.

The design pass settled the shape. The canvas has one control shape today: the
connect handle, a filled accent circle. A waypoint handle takes a SQUARE
instead, in the accent, at radius 0. The two controls then read apart at a
glance, and radius 0 is the design language's own rule. The midpoint handle
draws the same square outlined rather than filled: a waypoint that does not
exist yet.

A single symmetric bend puts the route midpoint on the waypoint itself. The
waypoint handle draws after the midpoint handle and takes the pointer. The
existing waypoint wins, and it has to: the midpoint handle has no answer for
the double-click that deletes.

Each handle stops its own pointer events. `.canvas-edge-group` carries an
`onPointerUp` that selects the path. A drag ending in a re-selection would
fight the gesture it just finished.

### The gestures reuse what the canvas already does

A handle drag reuses the node drag's shape. A pointer down records the start,
a move previews, and a release snaps and writes. Stage 37's rule says every
site that writes a position rounds, and this is the fourth such site.

A double-click deletes one waypoint. That is the whole of reset: an author
deletes the last one and the direct route is back. A separate "reset route"
control would be a second way to reach one outcome.

### `layout.waypoints` is the second reserved key

`layout` holds `{ [stepId]: Point }` plus `canvasEdgeStyle`. It gains
`waypoints: { [pathId]: Point[] }`. Stage 30 made the collision argument
already. Every step id carries a `step_` prefix, and the position reader
admits only a point.

A malformed entry reads as no waypoints. A draft saved by a later version must
render, not throw, which is the rule `canvasEdgeStyle` already follows.

A deleted path leaves its list behind. A deleted step leaves its position
behind today. Neither one reaches the published body, so neither needs a
sweep.

## Risks / Trade-offs

- **A waypoint can sit inside a node.** → It can, and an author who drags it
  there sees it there. Rejecting the drop would need a hit test per pointer
  move, and the author can drag it out again.
- **Two routing shapes now exist: `routeEdge` and the leg.** → They divide by
  what they touch. A node anchor needs clearance from its own box, and a bare
  point does not. The no-waypoint path still takes `routeEdge` untouched.
- **Stage 34's grouping moves several steps at once.** → Waypoints are
  absolute points. A moved step re-routes to them rather than carrying them,
  which is what a single dragged step already does.
- **The midpoint handle moves as the route changes.** → It does, because it
  reads `midpointOfRoute` of the current route. That is what keeps it on the
  route after every change.

## Migration Plan

None. A draft with no `layout.waypoints` renders every path as it renders
today. The key is additive inside a blob the draft already round-trips
opaquely, so no stored draft needs rewriting.

Rollback is the revert of one commit. A draft saved with waypoints then reads
as a draft with an unknown `layout` key. The store already round-trips that
without inspecting it.

## Open Questions

None.
