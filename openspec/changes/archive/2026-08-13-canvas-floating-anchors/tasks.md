## 1. The anchor rule

- [x] 1.1 Invoke `/frontend-design:frontend-design` for the anchor's visual
  direction; record what it decides in `design.md`
- [x] 1.2 Add `anchorsForEdge(source, target)` to `canvas/geometry.ts`: the
  larger centre offset picks the axis, and a tie takes the horizontal
- [x] 1.3 Return both anchors at their side midpoints, plus the axis and the
  direction the pair leaves on
- [x] 1.4 Add its cases to `packages/web/test/studio-canvas-geometry.test.ts`:
  each of the four sides, and the tie

## 2. The route reads the axis

- [x] 2.1 Give `routeEdge` a leaving-direction parameter that defaults to
  rightward, so its eight two-argument test calls stay green
- [x] 2.2 Inside `routeEdge`, map both anchors into the canonical space, run
  today's arithmetic, and map every returned point back
- [x] 2.3 Use the four self-inverse transforms: identity, negate x, swap, and
  swap-then-negate-both; assert self-inverse in the test
- [x] 2.4 Cover a vertical pair, an overlapping backward pair and a
  non-overlapping backward pair in the geometry test

## 3. The canvas draws it

- [x] 3.1 Replace the two fixed anchor expressions in `CanvasView.tsx` with
  one `anchorsForEdge` call per path
- [x] 3.2 Leave the connect handle at the right-middle, and leave the
  drag-to-connect preview a straight line from it

## 4. The browser check

- [x] 4.1 Add a "Canvas floating anchors" section to `docs/browser-checks.md`
- [x] 4.2 Confirm a path to a step below leaves the bottom side and enters the
  top side
- [x] 4.3 Drag a target step around its source; confirm the anchors follow the
  facing side, with no reload
- [x] 4.4 Confirm the arrowhead turns with the entering segment on all four
  sides
- [x] 4.5 Confirm a guard label and a priority badge stay legible on a
  vertical run
- [x] 4.6 Confirm the route stays clickable along its whole length, and that
  the handle still starts a straight preview

## 5. Verification

- [x] 5.1 `bun run typecheck`, then `bun run build`, in the devcontainer
- [x] 5.2 Full `bun test` with `DATABASE_URL` set; report pass, skip and fail
- [x] 5.3 Run the antislop linter over every Markdown file this change touches
- [x] 5.4 `git diff --check`, then `git ls-files --eol` for the `w/` column
