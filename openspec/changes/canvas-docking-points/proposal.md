# Proposal

## Why

A path on the canvas picks its own side of a step. The canvas computes that
side from where the two steps stand. A path therefore jumps to another side
when an author moves a step. Several paths on one side share one point and draw over
each other. An author cannot say where a path leaves a step or where it
arrives. A tidy drawing does not survive the next drag.

## What Changes

- Every step node carries fixed docking points on its border. Each of the two
  upright sides holds three, and each of the two level sides holds seven. They
  stand one grid step apart, counted from the middle of the side.
- A docking point has no direction. A path can leave from any point and arrive
  at any point, and several paths can share one.
- The points show on a step the pointer rests on, and on a selected step. A
  connect drag or an end handle drag shows them too. A resting canvas shows
  none.
- Every docking point is a connect handle. The single handle at the right
  middle of a node goes.
- A connect drag starts at the point the author presses. Over a step it snaps
  to that step's nearest point, and the new path stores both points.
- A path end stays on its stored point whatever moves. The store is the draft
  layout, under a new reserved key. The definition does not change.
- A path end with no stored point keeps today's automatic rule. Moving a step
  first stores the current points of every path on it. No path an author has
  seen then changes its side.
- A selected path draws a handle at each end. Dragging one hangs that end on
  another point of the same step.
- Arrange removes every stored point, as it already removes every waypoint.
  Its confirmation says so.
- The router covers every pair of sides. Today it covers opposing sides only.

Three things stay out. A step keeps its fixed size. An end handle moves an end
along its own step and never to another step. No panel and no key edits a
docking point, which matches waypoints.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the anchor rule, the connect handle's place and the route
  between two anchors. Also the reserved layout keys, the insert gesture, and
  what Arrange clears and confirms.

## Impact

- `packages/web/src/areas/studio/canvas/geometry.ts`: the docking point
  lattice, the nearest-point rule, and a route between any two sides.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the points, the
  connect drag, the end handles and the pin on a step move.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: reading and writing
  `layout.dockingPoints`, and the Arrange and insert writes.
- `packages/web/src/areas/studio/canvas/arrange.ts`: the confirmation's
  trigger.
- `packages/web/src/i18n/catalogs/studio.ts`: the Arrange confirmation text
  and the end handle's tooltip.
- `.claude/rules/ui-glossary.md`, `DESIGN.md` and `docs/browser-checks.md`:
  the new term, its drawn form and its manual checks.
- No engine code, no HTTP route, no schema and no dependency changes. The
  server already stores `layout` as an opaque object.
- The branch `spike/ui-sdk-canvas` rewrites the same connect code in
  `CanvasView.tsx`. Whichever lands second rebases onto the other.
