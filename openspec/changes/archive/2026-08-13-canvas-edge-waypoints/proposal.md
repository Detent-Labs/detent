## Why

A route goes where the canvas puts it. An author may want an edge to pass above
a step, or to leave a gap where two routes overlap. Today there is no way to
say so.
Stage 30 decided against obstacle avoidance, and named the control point as the
answer.

Roadmap stage 33 is that answer, and it is the last open stage of the canvas
edge work.

## What Changes

- A path may carry a list of waypoints. The route runs from the source anchor
  through each waypoint in turn to the target anchor.
- The canvas-wide style still governs every segment of that route. A bent edge
  is still a `step` edge, and switching the toolbar control re-routes it
  between the same waypoints.
- A selected path draws a handle at each of its waypoints, and one at the
  route's midpoint. Dragging the midpoint handle adds a waypoint. Dragging a
  waypoint handle moves it. Each lands on the canvas lattice.
- Double-clicking a waypoint handle deletes that waypoint. An edge whose last
  waypoint goes is back to the direct route, which is the whole of reset.
- The list persists at `layout.waypoints[pathId]`, inside the same opaque
  `layout` blob that already round-trips node positions and
  `layout.canvasEdgeStyle`.
- The anchor rule generalizes. It read the side facing the other node. It now
  reads the side facing the next point on the route. With no waypoints that
  next point IS the other node's centre. Every edge without waypoints therefore
  draws exactly as it draws today.

No path carries a style of its own, so stage 30's decision stands. No schema
change and no API change.

## Capabilities

### Modified Capabilities

- `studio-canvas`: the orthogonal-route requirement gains waypoints and the
  generalized anchor rule. The layout-persistence requirement gains the
  `waypoints` key. The pure-function requirement gains a tenth computation.

## Impact

- `packages/web/src/areas/studio/canvas/geometry.ts`: the anchor rule against a
  point, and the route through a waypoint list.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the handles, their
  drag, and the double-click.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: reading and writing
  `layout.waypoints`, beside `layout.canvasEdgeStyle`.
- `packages/web/src/areas/studio/app.css`: one class for the handle.
- `packages/web/test/studio-canvas-geometry.test.ts`: the route through
  waypoints, and the anchor rule against a point.
- `docs/browser-checks.md`: the drag, which no test in this repository reads.
