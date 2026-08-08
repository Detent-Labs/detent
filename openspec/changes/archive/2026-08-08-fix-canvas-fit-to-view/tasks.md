## 1. The failing test

The test lands before the module it covers. The first run fails on the missing
import, and that red is the point.

- [x] 1.1 Add `packages/web/test/studio-canvas-fit.test.ts`, importing
  `computeFit` from `../src/areas/studio/canvas/fit.js`. Run it. Record the
  failure.
- [x] 1.2 Cover a canvas wider than the graph, where the scale lands at 1.
  Assert the returned pan by its numbers, not against any earlier formula.
- [x] 1.3 Cover a canvas narrower than the graph. Assert both content edges
  land inside the inset area. This is the case the shipped code gets wrong.
- [x] 1.4 Assert idempotence. The same element size twice returns the same
  result. The scale the canvas already holds changes nothing.
- [x] 1.5 Cover the asymmetric top inset. Assert the content's top edge clears
  the toolbar height.
- [x] 1.6 Cover the clamp at `MIN_SCALE`, for a graph wider than the floor
  allows. Cover the cap at 1, for a graph smaller than the canvas.
- [x] 1.7 Cover the empty content box. Assert the scale is 1 and the pan is
  zero.

## 2. The pure module

- [x] 2.1 Add `packages/web/src/areas/studio/canvas/fit.ts`. Export
  `computeFit(content, element, insets)` returning `{ scale, x, y }`, plus the
  `MIN_SCALE` and `MAX_SCALE` constants the `Panzoom` call needs.
- [x] 2.2 Implement the scale: `min(usableWidth / content.width, usableHeight
  / content.height, 1)`, floored at `MIN_SCALE`. Usable width and height
  subtract the insets. The cap at 1 already sits under `MAX_SCALE`, so
  clamping against it would be dead code.
- [x] 2.3 Implement the pan: `t = (T - C) / scale + C - m`. `C` is the element
  center, `T` the inset area's center, `m` the content center.
- [x] 2.4 Return a zero pan and a scale of 1 for an empty content box. The
  caller then needs no second guard.
- [x] 2.5 Export the gutter as a named constant of 16px. Name it as
  `--space-4` on the 4-point scale `design-language.md` sets.
- [x] 2.6 Run the group 1 tests. Every case passes.

## 3. The component

- [x] 3.1 Give `.canvas-toolbar` a ref in `CanvasView.tsx`, and read its
  height inside `fitToView`.
- [x] 3.2 Rewrite `fitToView` to read `svg.getBBox()` for the content box and
  `svg.clientWidth` / `svg.clientHeight` for the element size.
- [x] 3.3 Call `computeFit`, then `panzoom.zoom(scale)` and `panzoom.pan(x,
  y)`, both with `animate: false`, as today.
- [x] 3.4 Take `MIN_SCALE` and `MAX_SCALE` from `fit.ts` in the `Panzoom`
  call, so the clamp and the library agree.
- [x] 3.5 Delete the four `Math.min`/`Math.max` lines inside `fitToView` that
  derive the bounding box. Keep `nodePositions` itself: `resolveDropGesture`
  reads it at `CanvasView.tsx:198`.
- [x] 3.6 Check the inset values against `design-language.md`. Every gap sits
  on the 4-point scale, and no new component or color role appears.

## 4. The clipping surface

A browser check found this after group 3 read as complete. The arithmetic
cannot frame what the drawing surface refuses to draw.

- [x] 4.1 Give `.canvas-svg` `overflow: visible` in `app.css`. Record beside
  it that `.canvas-wrap` is the clipping edge.
- [x] 4.2 Move the dot grid from `.canvas-svg` to `.canvas-wrap`, so it holds
  still under the zoom.
- [x] 4.3 Confirm in a browser that a six-step draft renders all six steps
  after the fit. Use a canvas column 240px wide.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`, then `bun run build`, then the full
  `bun test` with `DATABASE_URL` set. Report the skip count as well as the
  pass count. One test database serves every worktree, so run the suite when
  no other session runs it.
- [x] 5.2 Run the antislop linter over every Markdown file this change
  touches.
- [x] 5.3 Run `git diff --check`, and `git ls-files --eol` for the `w/`
  column.
- [x] 5.4 Check the canvas in a real browser. Frame a multi-step draft in a
  narrow canvas column. Confirm no step, start arrow or terminal stamp sits
  under the toolbar or off an edge.
- [x] 5.5 Click "Fit to view" twice in a row. The second click starts from the
  zoom level the first one set. That covers the fit from a zoomed state.
  Confirm the framing does not drift.
- [x] 5.6 Record the browser steps in `docs/browser-checks.md` if the
  `development-toolchain` split rule keeps them manual.

## 6. What the verification pass found

- [x] 6.1 Correct `design.md`. The top inset clears the toolbar's bottom
  edge, not its height. The two differ by the `--space-2` the toolbar sits
  below the canvas top.
- [x] 6.2 Say in `CanvasView.tsx` and `design.md` that a second overlay
  control belongs in the `.canvas-toolbar` flex row. Measuring the container
  then covers it.
- [x] 6.3 Guard the clipping CSS with `bun:test`. Assert `overflow: visible`
  on `.canvas-svg`, `overflow: hidden` on `.canvas-wrap`, and the grid on the
  wrap alone. Confirm each fails under a mutation.
- [x] 6.4 Resolve the palette drop through `.canvas-wrap` in
  `EditScreen.tsx`. A zoomed-out canvas leaves most of the wrap outside the
  SVG's box. The grid now makes that area read as canvas.
