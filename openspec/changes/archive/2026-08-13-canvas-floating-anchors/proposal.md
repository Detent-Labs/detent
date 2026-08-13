## Why

Every path on the canvas leaves its source step's right edge and enters its
target's left edge. That holds even when the target sits above the source,
below it, or to its left. A backward path therefore leaves rightwards, runs
back the whole width of both nodes, and turns in from outside. The route is
correct and the author reads it as a detour.

Roadmap stage 31 answers this. The anchor moves to the side that faces the
other node.

## What Changes

- A path's two anchors follow the two node centres. The larger of the two
  centre offsets picks the axis. A gap wider than it is tall picks the
  horizontal pair. A taller gap picks the vertical pair.
- Each anchor sits at the midpoint of the side its own node turns toward the
  other one.
- Every segment stays on one axis. The route leaves and enters on the axis its
  anchor sits on, rather than always on the horizontal.
- The connect handle stays at the source node's right-middle. It is a control,
  not an anchor.
- The drag-to-connect preview stays a straight line from that handle. A drag in
  flight has no target, so it has no side to face.

The routing rules themselves do not change. A route still takes one segment,
three, or five. Every turn still sits one grid step clear of the node it
leaves.

**Deferred, on the design of record:** stage 31's second half, the affordances
drawn on the edge. The inspector deletes a path already, and a control on the
edge is a second way to do one thing.

No schema change and no API change. The canvas computes both anchors per
render, and nothing stores one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the orthogonal-route requirement states that a route leaves
  and enters horizontally, and that the ahead test reads the x axis. Both
  become axis-dependent. The pure-function requirement enumerates eight
  computations, and the anchor side choice is a ninth.

## Impact

- `packages/web/src/areas/studio/canvas/geometry.ts`: the anchor rule, and
  `routeEdge` reading the axis its anchors sit on.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the two anchor
  expressions in the edge pass.
- `packages/web/test/studio-canvas-geometry.test.ts`: the anchor rule's own
  cases, and the route cases the axis change reaches.
- `docs/browser-checks.md`: the walk for what a test cannot read, which is
  whether an author reads the result as a detour.
