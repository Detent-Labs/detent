## 1. Pure selection logic

- [x] 1.1 Add `canvas/selection.ts` with `toggleSelection(ids, id): string[]`
- [x] 1.2 Add `normalizeRect(a, b)` there, returning a corner-ordered rectangle
- [x] 1.3 Add `nodesInRect(rect, nodes): string[]`, overlap not containment
- [x] 1.4 Add `packages/web/test/studio-canvas-selection.test.ts`
- [x] 1.5 Cover a toggle that adds, and a toggle that drops
- [x] 1.6 Cover a marquee drawn in each of the four directions
- [x] 1.7 Cover a marquee that touches no node, and one that grazes an edge

## 2. The selection set in `EditScreen`

- [x] 2.1 Replace `selectedStepId` state with `selectedStepIds: string[]`
- [x] 2.2 Keep `onSelectStep(stepId, pathId)` writing a set of one or none
- [x] 2.3 Add `onSelectSteps(ids: string[])` for the toggle and the marquee
- [x] 2.4 Derive `inspectedStepId` from a set of exactly one
- [x] 2.5 Pass `inspectedStepId` to `StepsPanel`, whose own props do not change
- [x] 2.6 Render the inspector for one step or a path, as today

## 3. Canvas selection gestures

- [x] 3.1 Change `CanvasView`'s prop to `selectedStepIds: string[]`
- [x] 3.2 Draw every node in the set with `canvas-node-selected`
- [x] 3.3 Toggle through `onSelectSteps` when a node click carries shift
- [x] 3.4 Replace the set when a node click carries no shift
- [x] 3.5 Start a marquee on `onPointerDownCapture`, on a shift background press
- [x] 3.6 Ignore a capture-phase target that sits inside `.panzoom-exclude`
- [x] 3.7 Take pointer capture on the SVG at the marquee's start
- [x] 3.8 Set `disablePan` on the Panzoom instance while the marquee draws
- [x] 3.9 Restore `disablePan` in `onPointerUp` and in `onLostPointerCapture`
- [x] 3.10 Render the marquee rectangle in SVG user space
- [x] 3.11 Select the overlapped nodes on release through `nodesInRect`
- [x] 3.12 Return from the marquee branch before the background deselect runs

## 4. Group move

- [x] 4.1 Carry the moving ids on `nodeDrag`, computed at pointer-down
- [x] 4.2 Write no selection at pointer-down, under a shift or without one
- [x] 4.3 Replace the set at pointer-up when the dragged node sat outside it
- [x] 4.4 Preview every moving node at its own rounded position
- [x] 4.5 Call `onMoveStep` per member on release, past the click threshold
- [x] 4.6 Write no position when the movement stays under that threshold
- [x] 4.7 Toggle on a shift release under the threshold, replace without one

## 5. Group summary and delete

- [x] 5.0 Run `/frontend-design:frontend-design` for the summary and the marquee
- [x] 5.1 Add the count string and the delete label to `i18n/catalogs/studio.ts`
- [x] 5.2 Render the count in the third column for a set of several steps
- [x] 5.3 Delete every step in the set
- [x] 5.4 Reseat `workflow.initialStep` when the deleted set held it
- [x] 5.5 Empty the set after the delete, returning the full checks rail
- [x] 5.6 Dock `<ChecksRail collapsed />` at the summary's bottom edge
- [x] 5.7 Style the marquee and the summary in `areas/studio/app.css`
- [x] 5.8 Give `.canvas-marquee` `pointer-events: none`
- [x] 5.9 Keep the delete control outlined, never filled and never red

## 6. Documentation

- [x] 6.1 Add the shift-click and marquee walk to `docs/browser-checks.md`
- [x] 6.2 Record this delivery under `ROADMAP.md` stage 34, which keeps its number
- [x] 6.3 Change `docs/current-state.md` for the studio canvas

## 7. Verification

- [x] 7.1 Run `bun run typecheck` in the devcontainer
- [x] 7.2 Run `bun run build`
- [x] 7.3 Run the FULL `bun test` with `DATABASE_URL` set
- [x] 7.4 Read the skip count of that run, not only the pass count
- [x] 7.5 Run the antislop linter over every Markdown file this change touches
- [x] 7.6 Run `git diff --check` over the changed files
- [x] 7.7 Read the `w/` column of `git ls-files --eol` for a CR byte
- [x] 7.8 Drive the browser check: shift-click, marquee, group move, delete
- [x] 7.9 Check the marquee over a panned and zoomed canvas
