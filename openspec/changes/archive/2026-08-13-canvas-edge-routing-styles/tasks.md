## 1. The routing computation

- [x] 1.1 Add the `EdgeStyle` type to `canvas/geometry.ts`, reusing `GRID_STEP`
- [x] 1.2 Add `routeEdge(source, target): Point[]`, one segment on a shared row
- [x] 1.3 Extend it to three segments for a target ahead on another row
- [x] 1.4 Extend it to five segments for a target that is not ahead
- [x] 1.5 Add `midpointOfRoute(points)`, returning the point and its segment
- [x] 1.6 Add `routePath(points, style, radius): string`, the SVG `d` attribute
- [x] 1.7 Clamp each arc to half the shorter of the two segments it joins
- [x] 1.8 Emit no arc for a route that carries no corner

## 2. Tests for the routing

- [x] 2.1 Cover a target ahead on the same row: one segment
- [x] 2.2 Cover a target ahead on another row: three segments, axis-aligned
- [x] 2.3 Cover a target behind: five segments, all axis-aligned
- [x] 2.4 Cover a target whose entry anchor sits level with the exit anchor
- [x] 2.5 Cover the gutter landing every corner on the lattice
- [x] 2.6 Cover the route midpoint and its segment against hand-computed values
- [x] 2.7 Cover the arc clamp on a segment shorter than twice the radius
- [x] 2.8 Cover `step` and `smoothstep` returning the same corner points
- [x] 2.9 Cover a one-segment route carrying no arc under `smoothstep`

## 3. The canvas renders the route

- [x] 3.1 Render each edge as a `<path>` rather than a `<line>`
- [x] 3.2 Give the hit area the same `d` at its current stroke width
- [x] 3.3 Add `fill: none` to `.canvas-edge-hitarea`, which a line never needed
- [x] 3.4 Keep the solid and dashed classes that encode the trigger
- [x] 3.5 Place the guard label and the priority badge at the route midpoint
- [x] 3.6 Bound the label's width by the segment its midpoint falls on
- [x] 3.7 Leave the drag-to-connect preview a straight line
- [x] 3.8 Leave the initial-step arrow as it is

## 4. The canvas-wide style

- [x] 4.1 Read `layout.canvasEdgeStyle` in `EditScreen`, defaulting to `step`
- [x] 4.2 Treat an unknown value as `step` rather than failing the render
- [x] 4.3 Write the choice back into `saveState.layout`
- [x] 4.4 Pass the style into `CanvasView` as a prop
- [x] 4.5 Add the toolbar control beside "Fit to view"
- [x] 4.6 Add its strings to `i18n/catalogs/studio.ts`
- [x] 4.7 Run `/frontend-design:frontend-design` for the control
- [x] 4.8 Style the control in `areas/studio/app.css`

## 5. Documentation

- [x] 5.1 Add the routing walk to `docs/browser-checks.md`
- [x] 5.2 Record stage 30 in `ROADMAP.md`
- [x] 5.3 Write the settled stage 31, 32 and 33 decisions into `ROADMAP.md`
- [x] 5.4 Change `docs/current-state.md` for the studio canvas
- [x] 5.5 Move item 7 forward in `tmp/open-work-priority.md`

## 6. Verification

- [x] 6.1 Run `bun run typecheck` in the devcontainer
- [x] 6.2 Run `bun run build`
- [x] 6.3 Run the FULL `bun test` with `DATABASE_URL` set
- [x] 6.4 Read the skip count of that run, not only the pass count
- [x] 6.5 Run the antislop linter over every Markdown file this change touches
- [x] 6.6 Run `git diff --check` over the changed files
- [x] 6.7 Read the `w/` column of `git ls-files --eol` for a CR byte
- [x] 6.8 Drive the browser check: both styles, a backward path, a save
- [x] 6.9 Check that clicking a corner of a route selects that path
- [x] 6.10 Check that a five-segment route paints no filled area
