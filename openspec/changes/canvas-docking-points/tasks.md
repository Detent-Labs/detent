# Tasks

Each task names the test that proves it. A test task writes the failing test
first. Exact values live in `design.md` and in the delta spec.

`packages/web` has no DOM harness. A gesture is proven by a pure function, by
static markup, or by the e2e flow of group 7.

## 1. Docking point geometry

- [x] 1.1 Add the docking point type to `canvas/geometry.ts`, and the function that lists a box's points. Verify in `studio-canvas-geometry.test.ts` with cases for the counts per side and for the middle point.
- [x] 1.2 Add the nearest-point function over one box, with an option that excludes one point. Verify with cases for a position on a point, between two points, and at a corner.
- [x] 1.3 Add the function that turns a stored end into an anchor. It returns nothing for an unknown side, or for a position the side lacks. Verify with one case per rejection.
- [x] 1.4 Add the function that reads an automatic anchor back as a side and a position. Verify that each of the four midpoints reads as position 0.
- [x] 1.5 Add the press-target test for one point: 12 units outward and 6 inward. Verify with a press 10 units outside the border and one 10 units inside it.

## 2. Routes between any two sides

- [x] 2.1 Add the candidate-search router from `design.md`. Verify with the four scenarios of "A route joins any two sides".
- [x] 2.2 Add the rule that picks `routeEdge` or the new router. Verify that a facing opposing pair returns today's route, and that a pair facing away takes the new one.
- [x] 2.3 Add one test that walks sixteen side pairs over eight placements. Add offsets of 20 and 40 on the other axis, and one off-middle point per side.
- [x] 2.4 In that test, assert one axis per segment, the outward stub and no doubling back. Assert also at most five segments, no crossing of either box and no run along a border.
- [x] 2.5 Verify that two boxes closer than two grid steps still return a route, with a test for touching nodes.
- [x] 2.6 Verify a self path on one side and on two neighbouring sides. Neither crosses the inside of its node.
- [x] 2.7 Extend `routeThroughWaypoints` to take a stored point per end. Verify with both scenarios of "A waypointed route keeps its stored docking points". Add a case with a waypoint on the node's own row.
- [x] 2.8 Verify that every existing case in `studio-canvas-geometry.test.ts` still passes unchanged.

## 3. The layout store

- [x] 3.1 Add `readDockingPoints(layout)` to `canvas/layout.ts`. Verify in `studio-canvas-layout.test.ts` with an absent key, a malformed entry and a position the side lacks.
- [x] 3.2 Add `withDockingPoints(layout, pathId, ends)` there. Verify that a write then a read returns the ends, and that an empty entry leaves no key.
- [x] 3.3 Add `layoutAfterArrange` there, and call it from `runArrange` in `EditScreen.tsx`. Verify that it empties `waypoints` and `dockingPoints`.
- [x] 3.4 Add `layoutAfterInsert` there, and call it from the insert write. Verify that it keeps the source end, and drops the target end and the waypoints.
- [x] 3.5 Add `layoutAfterMove(layout, positions, points)` there. Verify that it writes every position and every point in one result.
- [x] 3.6 Make `hasHandPlacedStep` in `arrange.ts` read the new key, and keep its name. Verify in `studio-canvas-arrange.test.ts` that a draft with stored points alone confirms.
- [x] 3.7 Add the key `arrangeDialog.points` to `studio.ts`, and a second `DialogNote` in `confirmations.tsx`. Correct the body array in `studio-confirmations.test.tsx`.
- [x] 3.8 Read the stored points in `EditScreen.tsx` through 3.1, and pass them to `CanvasView`. Verify with `bun run typecheck`.

## 4. Stored points on the canvas

- [x] 4.1 Route each path with its stored points. Verify in static markup that a path with no entry renders the same `d` attribute as before.
- [x] 4.2 Verify both scenarios of "A path end stays on its stored docking point". Render one stored entry at two positions.
- [x] 4.3 Anchor a path on a collapsed group's box by the automatic rule, whatever its member stores. Verify with both scenarios of that requirement.
- [x] 4.4 Add the pure function that returns the points a step move stores. Verify with cases for one step and for two steps. Add one for an end that already stores a point.
- [x] 4.5 Add cases to 4.4 for an end on a collapsed group's box, and for a path inside a collapsed group. Each matches its scenario in the delta spec.
- [x] 4.6 Replace both per-step move loops with one callback that calls 4.4 and then 3.5. Verify with `bun run typecheck`, and leave the drag to the e2e flow.
- [x] 4.7 Verify by reading that a release under the click threshold reaches no layout write. Cover the older-draft case in the e2e flow.

## 5. Docking points as connect handles

- [x] 5.1 Track the pointed-at step in its own state. Assert in `studio-processSurface.test.ts` that the route memo's dependency list does not name it.
- [x] 5.2 Draw the points of a selected step, with the free, held and end-step forms from `design.md`. Verify in static markup, and verify that a resting canvas and a collapsed box draw none.
- [x] 5.3 Give every point's group the `panzoom-exclude` class. Verify in the same static markup.
- [x] 5.4 Start a connect drag from the pressed point, in place of the right-middle connect handle. Resolve a press through 1.2 and 1.5.
- [x] 5.5 Keep the end step's refusal, tooltip and cursor on every point. Verify with the existing terminal-handle tests, moved to a docking point.
- [x] 5.6 Treat a press under the click threshold as a press on the node. It selects, Shift toggles, and a double-click opens the step.
- [x] 5.7 In `canvas/dropGesture.ts`, count a release on a press target as a release over that step. Verify in `studio-canvas-dropGesture.test.ts`, with a case where two grown boxes overlap.
- [x] 5.8 During a connect drag, draw the points of the step under the pointer and ring the nearest. End the straight preview on that point.
- [x] 5.9 Add a pure `resolveConnectDrop` that returns the points a release stores. Verify the three scenarios of "A connect drag stores the points it joins", and the self-path scenario.
- [x] 5.10 Verify with 5.9 that one point holds an incoming end and an outgoing end.
- [x] 5.11 Draw the points above the stamps and the way-out sentences, and before the group disclosure hosts. Correct the order assertion in `studio-processSurface.test.ts`.
- [x] 5.12 Remove `handleObstacle` and its call. Correct `studio-sentencePlacement.test.ts` and the `handleObstacle(at)` assertion in `studio-processSurface.test.ts`.
- [x] 5.13 Correct every test that reads the right-middle handle. Start with `studio-canvas-node-a11y.test.tsx` and `studio-canvas-node-label.test.tsx`, and list each file in the commit message.

## 6. End handles

- [x] 6.1 Draw one end handle at each end of the selected path, with its press target and its tooltip from `studio.ts`. Verify in static markup that an unselected path draws none.
- [x] 6.2 Give each end handle the `panzoom-exclude` class. Verify in the same markup that it draws above the docking points.
- [x] 6.3 Add a pure `resolveEndDrop` that returns the new end, or nothing. Verify the scenario "An end moves to another point".
- [x] 6.4 Verify with 6.3 that a release away from the step returns nothing. A release over another step returns nothing either.
- [x] 6.5 Wire the end handle drag to 6.3 and 3.2. Leave the gesture to the e2e flow.

## 7. The e2e flow

- [x] 7.1 Add `e2e/canvas-docking-points.e2e.ts` beside `canvas-keyboard.e2e.ts`. It opens a draft with an empty layout and asserts that no layout write follows.
- [x] 7.2 Add a connect drag between two chosen points, and assert the stored entry after a reload.
- [x] 7.3 Add a step move, and assert that the path keeps both sides.
- [x] 7.4 Add an end handle drag to another point, and assert that the Draft model stays equal.
- [x] 7.5 Add a press on a point under the end stamp, and a drag on an end handle. Assert a connect drag for the first and no pan for the second.
- [x] 7.6 Run `bun run e2e` in the devcontainer and paste its summary.

## 8. Words and records

- [x] 8.1 Add *docking point* and *end handle* rows to the Map tab table of `.claude/rules/ui-glossary.md`. Rewrite its **dock** line so *docking point* is the one use of the word.
- [x] 8.2 Rewrite the Canvas section and the shapes paragraph of `DESIGN.md` with the drawn values. Verify with `/impeccable doctor`.
- [x] 8.3 Add a "Canvas docking points" entry to `docs/browser-checks.md`. It covers the hover state, the 6-unit inward reach, and a draft with an empty layout.
- [x] 8.4 Rewrite the floating-anchors entry there for a path with no stored point. Correct every line `git grep -n 'connect handle\|right-middle' -- docs/browser-checks.md` prints.
- [x] 8.5 Add this change to the stage 31 row of `ROADMAP.md`.
- [x] 8.6 Run the antislop linter on every Markdown file this group touched.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck` and paste its output.
- [ ] 9.2 Run `bun run build` and paste its output.
- [ ] 9.3 Run the full `bun test` with `DATABASE_URL` set, and paste the pass, skip and fail counts.
- [ ] 9.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host, and the same with `whitespace.sh`.
- [ ] 9.5 Walk the new `docs/browser-checks.md` entry in a real browser on the production build. Cover a resting canvas, a pointed-at step, a connect drag and a step move.
- [ ] 9.6 In the same walk, cover an end handle drag, Arrange and an older draft. Cover a connect drag on an empty layout too.
- [ ] 9.7 Run `/impeccable critique` and `/impeccable audit` on the Map tab route, and resolve what each reports.

## Workflow follow-up

- Verify, sync the delta into `openspec/specs/studio-canvas/spec.md`, then archive.
- Place the ADDED requirements by hand after the route requirement. The archive appends them at the end.
- Re-point the `docs/decisions.md` citations after the sync. They name lines of `studio-canvas/spec.md` and of `CanvasView.tsx`.
