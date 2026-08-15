## 1. Dependency

- [x] 1.1 Add `"@dagrejs/dagre": "^3.1.1"` to `packages/web/package.json`'s
  `dependencies`.
- [x] 1.2 Run `bun install` inside the devcontainer so `bun.lock` picks up
  the new dependency and its one transitive dependency,
  `@dagrejs/graphlib`.

## 2. The pure arrange module

- [x] 2.1 Add `packages/web/src/areas/studio/canvas/arrange.ts`.
  Export `arrangeSteps(steps: LayoutStep[], groups: StepGroup[], initialStepId: string | undefined, existingLayout: Record<string, unknown>): Record<string, Point>`.
  Also export `hasHandPlacedStep(steps: LayoutStep[], layout: Record<string, unknown>): boolean`.
  Add a doc comment cross-referencing `layout.ts`'s `autoPlaceSteps`.
  State the opposite completeness contract (design.md, Decision 7).
- [x] 2.2 Add one line to `layout.ts`'s own doc comment on
  `autoPlaceSteps`. Point it forward to `arrangeSteps` in the new file
  (design.md, Decision 7; proposal.md's Impact section).
- [x] 2.3 Inside `arrangeSteps`, build a resolved position map.
  Run `autoPlaceSteps(steps, initialStepId, existingLayout)`, then apply `existingLayout`'s own valid `Point` entries on top.
  This mirrors `CanvasView.tsx`'s own `positionOf` fallback (design.md, Decision 3).
  A step with no entry in `existingLayout` still resolves to a real point, which is what group sizing needs.
- [x] 2.4 Build a `dagre.graphlib.Graph` (`rankdir: "LR"`) from `steps`
  and their `paths`. A step in no group becomes its own node, sized
  `NODE_SIZE`. A step in a group is not added as its own node. Its group
  becomes one synthetic node instead, sized by `drawnBox(group,
  resolvedPositions)`, using task 2.3's map (design.md, Decision 3).
- [x] 2.5 Build the graph's edges from every path. Drop an edge whose two
  endpoints share a group. Redirect an edge whose endpoint is a group
  member to the member's group id instead. Let `dagre.graphlib.Graph`'s
  own single-edge-per-pair behavior absorb a duplicate.
- [x] 2.6 Choose `nodesep`/`ranksep` as whole multiples of `GRID_STEP`
  (from `geometry.ts`) large enough to clear `NODE_SIZE`, and run
  `dagre.layout(g)`.
- [x] 2.7 Convert each returned node's `{x, y}` (a center point) to this
  codebase's top-left `Point` convention. Use `x - width / 2, y - height
  / 2`, with that node's own width and height (design.md, Context).
- [x] 2.8 For a group's synthetic node, compute the delta between its
  converted new top-left and its OLD top-left. Take that OLD corner from
  `drawnBox(group, resolvedPositions)`, task 2.3's map, converted the
  same way. Apply that one delta to every member's own position in
  `resolvedPositions` (design.md, Decision 3).
- [x] 2.9 For a step in no group, return its own converted position
  directly. Return a position for every step id in `steps`,
  unconditionally.
- [x] 2.10 Implement `hasHandPlacedStep`. It returns true when
  `steps.some((s) => s.id && layout[s.id] !== undefined)` is true, or
  when `layout.waypoints` holds at least one entry. It returns false
  only when neither holds (design.md, Decision 5).

## 3. i18n

- [x] 3.1 Add `canvas.arrange` (the button label) to
  `packages/web/src/i18n/catalogs/studio.ts`, EN only.
- [x] 3.2 Add `canvas.arrangeConfirm` (confirm copy, naming both saved
  positions and any waypoint an arrange clears), EN only.

## 4. Tests for the pure module

- [x] 4.1 Add `packages/web/test/studio-canvas-arrange.test.ts`,
  following `packages/web/test/studio-canvas-layout.test.ts`'s own
  structure.
- [x] 4.2 Test: every step in a draft receives an explicit position,
  including a step `existingLayout` already carried one for.
- [x] 4.3 Test: a group whose members carry no entry in `existingLayout`
  (only the auto-placed render default) still sizes and arranges. This
  exercises the resolved position map from task 2.3.
- [x] 4.4 Test: three steps in a chain (A → B → C) arrange with B's `x`
  greater than A's. C's `x` is greater than B's.
- [x] 4.5 Test: a two-step cycle (A → B → A) arranges with no thrown
  error, and both steps receive a lattice position. This matches the
  delta spec's "rework loop is exempt" scenario. It does not assert
  which step lands in the later column.
- [x] 4.6 Test: a collapsed group's members keep their position relative
  to each other, and to the group's own box. This holds after the box
  moves.
- [x] 4.7 Test: an expanded group's members keep their position relative
  to each other, and to the group's own box. This holds after the box
  moves.
- [x] 4.8 Test: a step with no path in or out (a disconnected step) still
  receives a position on the lattice.
- [x] 4.9 Test: every returned position is already a whole multiple of
  `GRID_STEP` on both axes.
- [x] 4.10 Test: the real cyclic graphs from `expense-approval.json` and
  `purchase-requisition.json` arrange with no thrown error, each
  returning one position per step.
- [x] 4.11 Test: `hasHandPlacedStep` reports true on a draft with one
  stored step position. It reports true on a draft with only a waypoint
  and no stored position too. It reports false only on a draft with
  neither.

## 5. Wiring: the write path and the confirm gate

- [x] 5.1 In `EditScreen.tsx`, add an `onArrange` handler. It reads
  `draft.workflow.steps`, `draft.workflow.initialStep`, the parsed
  `groups`, and `saveState.layout`. It computes `arrangeSteps(...)`, and
  runs every returned point through `snapToGrid`. It writes the result
  into every step id key of `layout`, and sets `layout.waypoints` to
  `{}` (design.md, Decisions 2, 3 and 4).
- [x] 5.2 Gate that write behind `hasHandPlacedStep(steps,
  saveState.layout)` (design.md, Decision 5; task 2.10). When it is
  true, call `confirm(t("canvas.arrangeConfirm"))`, and return early on
  a decline. When it is false, arrange with no confirm.
- [x] 5.3 Add an `onArrange: () => void` prop to `CanvasView`'s `Props`
  interface, and destructure it in the component.
- [x] 5.4 Add the "Arrange" button to `.canvas-toolbar` in
  `CanvasView.tsx`, beside "Fit to view" and the edge-style toggle. Use
  `<button type="button" className="btn btn-secondary"
  onClick={onArrange}>`.
- [x] 5.5 Pass `onArrange={onArrange}` from `EditScreen.tsx` to
  `CanvasView`.

## 6. Documentation

- [x] 6.1 `ROADMAP.md`: mark stage 38 DONE. Move its narrative into
  `docs/roadmap-history.md`, and leave one `## Done` row in its place.
- [x] 6.2 `docs/current-state.md`: the canvas toolbar's own bullet gains
  a mention of the Arrange control.
- [x] 6.3 `docs/browser-checks.md`: add a section for this change's manual
  walk (tasks 7.5 through 7.8 below).
- [x] 6.4 `tmp/open-work-priority.md`: move item 15 to `ARCHIVED`, and
  write its closing narrative, matching the convention item 17b's own
  entry set.

## 7. Verification

- [x] 7.1 `bun run typecheck` and `bun run build`, inside the
  devcontainer.
- [x] 7.2 The full `bun test` suite, with `DATABASE_URL` set, inside the
  devcontainer. Read what failed, not only the pass count.
- [x] 7.3 The antislop linter on every Markdown file this change touches,
  including the archived documentation files.
- [x] 7.4 `git diff --check` on the staged range, plus `git ls-files
  --eol` on every changed file, checking the `w/` column for `lf`.
- [x] 7.5 Browser check, against a draft built on
  `purchase-requisition.json` (real cycles). Add a group to it for this
  check, if it holds none already. Click Arrange. Confirm it completes
  with no thrown error and no console error. Confirm all 13 steps land
  at distinct, non-overlapping positions, in a legible left-to-right
  flow.
- [x] 7.6 Browser check: the confirm dialog appears only once a step
  carries a hand-placed position, and it declines cleanly.
- [x] 7.7 Browser check: a collapsed group, and an expanded group, each
  move as one rigid unit. An existing waypoint clears.
- [x] 7.8 Browser check: an arranged step does not shift on its first
  drag by an exact grid multiple. The button's German label does not
  overflow the toolbar at 1280px.
