## Why

The canvas draws every path as a straight SVG `<line>` between two fixed
anchors. A path whose target sits left of its source crosses whatever nodes lie
between the two. It reads as a diagonal over the graph, not as a route through
it.

This is ROADMAP stage 30. It is the first of the four canvas items that item 7
in `tmp/open-work-priority.md` groups. The design pass those four asked for
runs in this change's `design.md`. It settles the geometry question the other
three waited on.

## What Changes

- A path renders as an orthogonal route rather than a straight line. The route
  leaves the source horizontally, turns, and enters the target horizontally.
- Two styles ship: `step` draws square corners, `smoothstep` draws the same
  route with rounded ones. There is no straight style, and `step` is the
  default.
- One toolbar control switches the style for the whole canvas. No path carries
  a style of its own.
- The choice persists as `layout.canvasEdgeStyle`. That sits inside the
  `layout` blob the draft already round-trips for node positions. No schema
  change and no API change.
- A guard label and a priority badge sit at the route's own midpoint. Today
  they sit at the midpoint of a straight line between the anchors.
- The drag-to-connect preview stays a straight line. It follows the pointer
  and ends nowhere, so it has no route to draw.

Anchors stay where they are. Every route still leaves a step's right-middle and
enters the target's left-middle. Stage 31 moves them, and `design.md` states
how the two fit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: a path renders as a route rather than a line, under a
  canvas-wide style that persists in the `layout` blob. The pure-function
  requirement gains the routing computation.

## Impact

- `packages/web/src/areas/studio/canvas/geometry.ts`: `routeEdge`,
  `midpointOfRoute` and the `EdgeStyle` type.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the edge pass renders
  a `<path>`, the hit area follows it, and the toolbar gains the control.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: reads and writes
  `layout.canvasEdgeStyle`.
- `packages/web/src/areas/studio/app.css`: the style control, and the edge
  stroke's own rules where a line becomes a path.
- `packages/web/src/i18n/catalogs/studio.ts`: the control's strings.
- `packages/web/test/studio-canvas-geometry.test.ts`: the routing cases.
- `docs/browser-checks.md`, `ROADMAP.md`, `docs/current-state.md`.
- `tmp/open-work-priority.md`, the work queue. Git ignores `tmp/`, so that file
  is not a repository file and no gate reads it.
- No engine change, no API change, no schema change.
