# Tasks

Each task names the test that proves it. A test task writes the failing test
first. Exact values live in `design.md` and in the delta spec.

## 1. Docking point geometry

- [ ] 1.1 Add the docking point type to `canvas/geometry.ts`, and the function that lists a box's points. Verify in `studio-canvas-geometry.test.ts` with cases for the counts per side and for the middle point.
- [ ] 1.2 Add the nearest-point function over one box. Verify with cases for a position on a point, between two points, and at a corner.
- [ ] 1.3 Add the function that turns a stored end into an anchor. It returns nothing for an unknown side, or for a position the side lacks. Verify with one case per rejection.
- [ ] 1.4 Add the function that reads an automatic anchor back as a side and a position. Verify that each of the four midpoints reads as position 0.

## 2. Routes between any two sides

- [ ] 2.1 Add the candidate-search router from `design.md`, and keep `routeEdge` for opposing sides. Verify with the four ADDED scenarios of "A route joins any two sides".
- [ ] 2.2 Add one test that walks sixteen side pairs over eight placements. It asserts one axis per segment, the outward stub and no doubling back. It also asserts at most five segments and no crossing of either box.
- [ ] 2.3 Verify that two boxes closer than two grid steps still return a route, with a test for touching nodes.
- [ ] 2.4 Extend `routeThroughWaypoints` to take a stored point per end, with the stub for a waypoint behind the side. Verify with both scenarios of "A waypointed route keeps its stored docking points".
- [ ] 2.5 Verify that every existing case in `studio-canvas-geometry.test.ts` still passes unchanged.

## 3. The layout store

- [ ] 3.1 In `EditScreen.tsx`, read `layout.dockingPoints` defensively, beside the waypoint reader. Verify with tests for an absent key, a malformed entry and a position the side lacks.
- [ ] 3.2 Add the write for one path's points, which drops an empty entry. Verify that a save and a reload return the same points.
- [ ] 3.3 Clear `dockingPoints` in the Arrange write. Verify with a test beside the waypoint one.
- [ ] 3.4 Make `hasHandPlacedLayout` in `arrange.ts` read the new key. Verify in `studio-canvas-arrange.test.ts` that a draft with stored points alone confirms.
- [ ] 3.5 Extend the Arrange confirmation text in `studio.ts` with the docking point sentence. Verify with the dialog test.
- [ ] 3.6 In the insert write, keep the split path's source end and drop its target end. Verify with a test beside the waypoint-clearing one.

## 4. Stored points on the canvas

- [ ] 4.1 Pass the stored points into `CanvasView` and route each path with them. Verify that a path with no entry renders the same `d` attribute as before.
- [ ] 4.2 Anchor a path on a collapsed group's box by the automatic rule, whatever its member stores. Verify with both scenarios of that requirement.
- [ ] 4.3 Add the pure function that returns the points a step move stores. Verify with cases for one step, for two steps and for an end that already stores a point. Add one for a path inside a collapsed group.
- [ ] 4.4 Record those points when a node drag or a group drag starts, and route the preview with them. Verify with a component test that the path keeps its side during the drag.
- [ ] 4.5 Replace the per-step move loop with one callback that writes positions and points together. Verify that one drag produces one layout write.
- [ ] 4.6 Verify that a press under the click threshold writes no point, and that opening a draft writes none.

## 5. Docking points as connect handles

- [ ] 5.1 Track the pointed-at step in its own state, outside the route `useMemo`. Verify that a pointer move over a node recomputes no route.
- [ ] 5.2 Draw the points of a pointed-at or selected step, with the free and the held form from `design.md`. Verify with a component test for each of the four scenarios.
- [ ] 5.3 Start a connect drag from the pressed point, in place of the right-middle connect handle. Resolve overlapping press targets to the nearest point. Verify with the three scenarios of "Every docking point is a connect handle".
- [ ] 5.4 Keep the end step's refusal, tooltip and cursor on every point. Verify with the existing terminal-handle tests, moved to a docking point.
- [ ] 5.5 During a connect drag, draw the points of the step under the pointer and ring the nearest. End the straight preview on that point.
- [ ] 5.6 Store the pressed point and the snapped point on release. Store the source alone for a drop on empty canvas. Verify with the three scenarios of "A connect drag stores the points it joins".
- [ ] 5.7 Draw the points above the stamps and the way-out sentences. Verify that a press on a point under the end stamp starts a drag.
- [ ] 5.8 Correct every existing test that reads the right-middle handle. List each in the commit message.

## 6. End handles

- [ ] 6.1 Draw one end handle at each end of the selected path, above the docking points, with its tooltip from `studio.ts`. Verify that an unselected path draws none.
- [ ] 6.2 Drag an end handle to the nearest point of its own step and store that end alone. Verify with the scenario "An end moves to another point".
- [ ] 6.3 Change nothing on a release away from the step or over another step. Verify with both scenarios, and assert the Draft model stays equal.
- [ ] 6.4 Mark the end handle `panzoom-exclude`, as a waypoint handle is. Verify that a drag on it does not pan.

## 7. Words and records

- [ ] 7.1 Add *docking point* and *end handle* to `.claude/rules/ui-glossary.md`, and retire the single connect handle there. Verify with the antislop linter.
- [ ] 7.2 Rewrite the Canvas section and the shapes paragraph of `DESIGN.md` with the drawn values. Verify with `/impeccable doctor`.
- [ ] 7.3 Add a "Canvas docking points" entry to `docs/browser-checks.md`, and correct the waypoint entry's anchor lines. Verify with the antislop linter.
- [ ] 7.4 Correct the canvas entry in `docs/current-state.md` if it names the connect handle. Verify with `git grep -n "connect handle" -- docs`.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck` and paste its output.
- [ ] 8.2 Run `bun run build` and paste its output.
- [ ] 8.3 Run the full `bun test` with `DATABASE_URL` set, and paste the pass, skip and fail counts.
- [ ] 8.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host, and the same with `whitespace.sh`.
- [ ] 8.5 Walk the new `docs/browser-checks.md` entry in a real browser on the production build. Cover a resting canvas, a pointed-at step, a connect drag and a step move. Cover an end handle drag, Arrange and an older draft too.
- [ ] 8.6 Run `/impeccable critique` and `/impeccable audit` on the Map tab route, and resolve what each reports.

## Workflow follow-up

- Run `openspec-review-change` before apply, and resolve every finding.
- Verify, sync the delta into `openspec/specs/studio-canvas/spec.md`, then archive.
- Place the ADDED requirements by hand after the route requirement. The archive appends them at the end.
