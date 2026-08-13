## 1. The geometry

- [x] 1.1 Invoke `/frontend-design:frontend-design` for the handle's visual
  direction; record what it decides in `design.md`
- [x] 1.2 Split `anchorsForEdge` into `anchorSideToward(node, point)` plus a
  pair function that calls it twice, KEEPING the name `anchorsForEdge`
- [x] 1.3 Confirm the existing anchor tests stay green unchanged, since the
  split is behaviour-preserving
- [x] 1.4 Add `routeThroughWaypoints(source, target, waypoints)`: anchors from
  the first and last waypoint, one `routeEdge` call per consecutive pair
- [x] 1.5 Read each leg's leaving direction from that pair's own larger
  offset; concatenate and de-duplicate the legs
- [x] 1.6 Return `legStarts` beside the points, so an insert can name a leg
  rather than a route segment
- [x] 1.7 Cover it in `packages/web/test/studio-canvas-geometry.test.ts`: no
  waypoint, one, two, every point on the route, and the leg starts

## 2. The layout blob

- [x] 2.1 Read `layout.waypoints[pathId]` in `EditScreen.tsx`, beside
  `layout.canvasEdgeStyle`; a malformed entry reads as none
- [x] 2.2 Add an `onWaypointsChange(pathId, points)` writer that sets
  `saveState.layout.waypoints`, the way `onMoveStep` writes a position
- [x] 2.3 Pass the map and the writer into `CanvasView`

## 3. The handles

- [x] 3.1 Call `routeThroughWaypoints` in the edge pass, and use its points
  for the drawn path, the hit area and the midpoint
- [x] 3.2 Draw a handle per waypoint on the selected path, plus one at the
  midpoint, after the label
- [x] 3.3 Add `.canvas-waypoint-handle` to `areas/studio/app.css`
- [x] 3.4 Drag a waypoint handle to move it, snapping the release; stop its
  events so the group does not re-select
- [x] 3.5 Drag the midpoint handle to insert a waypoint at the leg its segment
  falls in, read off `legStarts`
- [x] 3.6 Double-click a waypoint handle to delete it; an empty list leaves no
  key behind

## 4. The browser check

- [x] 4.1 Add a "Canvas edge waypoints" section to `docs/browser-checks.md`
- [x] 4.2 Bend a path with the midpoint handle; confirm the route passes
  through the new point
- [x] 4.3 Confirm the source anchor moves to the side facing that waypoint
- [x] 4.4 Switch the style to rounded; confirm the waypoints hold and every
  corner rounds
- [x] 4.5 Save and reopen the draft; confirm the bend survives
- [x] 4.6 Double-click the waypoint handle; confirm the direct route returns
- [x] 4.7 Confirm an unselected path draws no handle
- [x] 4.8 Bend a path twice; confirm the second waypoint lands in route
  order, not at an end
- [x] 4.9 Confirm a guard label stays readable behind the midpoint handle

## 5. Verification

- [x] 5.1 `bun run typecheck`, then `bun run build`, in the devcontainer
- [x] 5.2 Full `bun test` with `DATABASE_URL` set; report pass, skip and fail
- [x] 5.3 Run the antislop linter over every Markdown file this change touches
- [x] 5.4 `git diff --check`, then `git ls-files --eol` for the `w/` column
