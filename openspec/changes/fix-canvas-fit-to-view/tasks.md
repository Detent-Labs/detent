## 1. The failing test

The test lands before the module it covers. The first run fails on the missing
import, and that red is the point.

- [ ] 1.1 Add `packages/web/test/studio-canvas-fit.test.ts`, importing
  `computeFit` from `../src/areas/studio/canvas/fit.js`. Run it. Record the
  failure.
- [ ] 1.2 Cover a canvas wider than the graph, where the scale lands at 1.
  Assert the returned pan by its numbers, not against any earlier formula.
- [ ] 1.3 Cover a canvas narrower than the graph. Assert both content edges
  land inside the inset area. This is the case the shipped code gets wrong.
- [ ] 1.4 Assert idempotence. The same element size twice returns the same
  result. The scale the canvas already holds changes nothing.
- [ ] 1.5 Cover the asymmetric top inset. Assert the content's top edge clears
  the toolbar height.
- [ ] 1.6 Cover the clamp at `MIN_SCALE`, for a graph wider than the floor
  allows. Cover the cap at 1, for a graph smaller than the canvas.
- [ ] 1.7 Cover the empty content box. Assert the scale is 1 and the pan is
  zero.

## 2. The pure module

- [ ] 2.1 Add `packages/web/src/areas/studio/canvas/fit.ts`. Export
  `computeFit(content, element, insets)` returning `{ scale, x, y }`, plus the
  `MIN_SCALE` and `MAX_SCALE` constants the `Panzoom` call needs.
- [ ] 2.2 Implement the scale: `min(usableWidth / content.width, usableHeight
  / content.height, 1)`, clamped to `[MIN_SCALE, MAX_SCALE]`. Usable width and
  height subtract the insets.
- [ ] 2.3 Implement the pan: `t = (T - C) / scale + C - m`. `C` is the element
  center, `T` the inset area's center, `m` the content center.
- [ ] 2.4 Return a zero pan and a scale of 1 for an empty content box, so the
  caller needs no second guard.
- [ ] 2.5 Export the gutter as a named constant of 16px, with a comment naming
  it as `--space-4` on the 4-point scale `design-language.md` sets.
- [ ] 2.6 Run the group 1 tests. Every case passes.

## 3. The component

- [ ] 3.1 Give `.canvas-toolbar` a ref in `CanvasView.tsx`, and read its
  height inside `fitToView`.
- [ ] 3.2 Rewrite `fitToView` to read `svg.getBBox()` for the content box and
  `svg.clientWidth` / `svg.clientHeight` for the element size.
- [ ] 3.3 Call `computeFit`, then `panzoom.zoom(scale)` and `panzoom.pan(x,
  y)`, both with `animate: false`, as today.
- [ ] 3.4 Take `MIN_SCALE` and `MAX_SCALE` from `fit.ts` in the `Panzoom`
  call, so the clamp and the library agree.
- [ ] 3.5 Delete the four `Math.min`/`Math.max` lines inside `fitToView` that
  derive the bounding box. Keep `nodePositions` itself: `resolveDropGesture`
  reads it at `CanvasView.tsx:198`.
- [ ] 3.6 Check the inset values against `design-language.md`. Every gap sits
  on the 4-point scale, and no new component or color role appears.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`, then `bun run build`, then the full
  `bun test` with `DATABASE_URL` set. Report the skip count as well as the
  pass count. One test database serves every worktree, so run the suite when
  no other session runs it.
- [ ] 4.2 Run the antislop linter over every Markdown file this change
  touches.
- [ ] 4.3 Run `git diff --check`, and `git ls-files --eol` for the `w/`
  column.
- [ ] 4.4 Check the canvas in a real browser at the reported widths. Frame the
  `request -> decision -> approved/rejected` draft with the inspector open and
  closed. Confirm no step, start arrow or terminal stamp sits under the
  toolbar or off an edge.
- [ ] 4.5 Click "Fit to view" twice in a row, and once after a wheel zoom.
  Confirm the framing does not drift.
- [ ] 4.6 Record the browser steps in `docs/browser-checks.md` if the
  `development-toolchain` split rule keeps them manual.
