## 1. The lattice

- [x] 1.1 Add `GRID_STEP = 20` and `snapToGrid(point)` to
  `canvas/geometry.ts`. It rounds to the nearest point, on both axes.
- [x] 1.2 Move `NODE_HEIGHT` from 64 to 60 in `canvas/geometry.ts`.
- [x] 1.3 Move `ROW_HEIGHT` from 110 to 120 in `canvas/layout.ts`.
- [x] 1.4 Test: `snapToGrid` rounds to the nearer point on each axis. It
  handles a negative coordinate, and leaves a point already on the lattice
  alone.
- [x] 1.5 Test: the row pitch, the column pitch, the node width and the node
  height each divide by `GRID_STEP` with no remainder.
- [x] 1.6 Correct `packages/web/test/studio-canvas-fit.test.ts`. `GRAPH.height`
  goes 174 to 180, the shifted box at line 128 with it, and the comment above
  them re-derives from the new constants. The box is an input to `computeFit`,
  so the suite stays green either way. A stale fixture claiming to describe
  auto layout is the hazard.
- [x] 1.7 Re-derive that file's one hand-worked expectation. Usable area
  1168x722, scale min(1168/660, 722/180, 1) = 1, content centre (330, 90), so
  `y` becomes 333. The width does not move, so the scale assertion stands.

## 2. The three write sites

- [x] 2.1 Round in `onNodePointerUp` (`canvas/CanvasView.tsx`), after the
  click threshold decides this was a drag.
- [x] 2.2 Round the drawn position of the dragged node, so the preview and the
  release compute the same point.
- [x] 2.3 Round in `onPaletteDrop` (`screens/EditScreen.tsx`), on the point
  `svgPointFromClient` returns. `resolveDropGesture` runs before the rounding,
  and decides what the drop creates. Its own fixtures need no lattice.
- [x] 2.4 Test: a drag under the click threshold still selects and writes no
  position.

## 3. The painted grid

- [x] 3.1 Subscribe to `panzoomchange` on the canvas element in
  `CanvasView.tsx`. Read the scale and the pan from the event's own `detail`,
  never by parsing the DOM transform back. Write `--canvas-grid-size` and
  `--canvas-grid-offset` onto `.canvas-wrap`. Drop the listener on unmount.
- [x] 3.2 Seed both properties from `getScale()` and `getPan()` after the
  initial fit, so the grid is right before the first pan or zoom.
- [x] 3.3 Read both properties in `.canvas-wrap`'s `background-size` and
  `background-position` (`areas/studio/app.css`). The gradient and the color
  role stay where they are.
- [x] 3.4 Keep the existing comment's reasoning, and widen it. The grid stays
  on the wrap, and now tracks the transform.

## 4. Documentation

- [x] 4.1 Record the work in `ROADMAP.md` as stage 37, and in
  `docs/current-state.md`.
- [x] 4.2 Add the browser walk to `docs/browser-checks.md`. Drag a step at
  three zoom levels. Drop one from the creation palette. Read a node against
  the dots after a pan.
- [x] 4.3 Move item 11 to `ARCHIVED` in `tmp/open-work-priority.md`.

## 5. Verification

- [x] 5.1 `bun run typecheck`, then `bun run build`.
- [x] 5.2 Full `bun test` with `DATABASE_URL` set, reading the skip count as
  well as the pass count.
- [x] 5.3 The antislop linter over every Markdown file this change touched.
- [x] 5.4 `git diff --check`, plus `git ls-files --eol` for a CR in the
  worktree.
- [x] 5.5 Walk the browser check from 4.2 against a real server. Most of this
  change's evidence lives there. A lattice meeting painted dots is a visual
  judgment, and no assertion sees it.
