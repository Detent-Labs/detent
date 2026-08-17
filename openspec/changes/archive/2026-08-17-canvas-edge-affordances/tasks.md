## 1. The draft transform

- [x] 1.1 Add `packages/web/src/areas/studio/draft/insertOnPath.ts`.
- [x] 1.2 Take the step list, a source step id, a path id and the new step.
- [x] 1.3 Retarget that path's `to`, keeping its `id`, `key`, guard and priority.
- [x] 1.4 Create the new step's one path through `newPath`, with the same trigger.
- [x] 1.5 Give the new path no guard and no priority.
- [x] 1.6 Return a new list. Mutate no input.
- [x] 1.7 Add `packages/web/test/studio-insertOnPath.test.ts`.
- [x] 1.8 Cover the retarget, the trigger inheritance and the guard staying put.
- [x] 1.9 Cover a manual source path and an automatic one carrying a priority.

## 2. The DOM handle on an edge

- [x] 2.1 In `CanvasView.tsx`, give the edge group `data-path-id`.
- [x] 2.2 Give it `data-step-id` for the source step.
- [x] 2.3 Skip both when the path has no `id` yet.
- [x] 2.4 Give the guard label's wrapping `foreignObject` (around
      `.canvas-edge-guard-label`) the same `data-path-id` and `data-step-id`,
      skipped under the same no-`id`-yet condition as 2.3. The label renders as
      a sibling `foreignObject`, not a descendant of the edge group, so a drop
      landing on it would otherwise fall through the hit test.

## 3. The drop branch

- [x] 3.1 In `EditScreen.onPaletteDrop`, read `closest("[data-path-id]")` first.
- [x] 3.2 Fall through to today's free placement when it finds none.
- [x] 3.3 Fall through as well when the dragged kind is `end`.
- [x] 3.4 Otherwise create the step, then apply `insertOnPath` in one `mutate`.
- [x] 3.5 Clear that path's waypoints in the same layout write.
- [x] 3.6 Keep the existing snap, the `onMoveStep` call and the selection.

## 4. The drop-target state

- [x] 4.1 Add `onDragMove(kind, clientX, clientY)` to `EditRail`, fired on move.
- [x] 4.2 Hold `insertTargetPathId` in `EditScreen`, resolved the way 3.1 does.
- [x] 4.3 Clear it on release and when no path sits under the pointer.
- [x] 4.4 Resolve it to nothing while the drag carries an `end` step.
- [x] 4.5 Pass it to `CanvasView` and add `.canvas-edge-insert-target` on match.
- [x] 4.6 Style that class in `app.css`: heavier stroke, accent, no radius.

## 5. Documentation

- [x] 5.1 Move stage 31 to the done table in `ROADMAP.md`.
- [x] 5.2 Write the stage 31 entry in `docs/roadmap-history.md`.
- [x] 5.3 State there why no delete affordance shipped.
- [x] 5.4 Add the insert gesture to the canvas entry in `docs/current-state.md`.
- [x] 5.5 Add the browser check to `docs/browser-checks.md`.
- [x] 5.6 Sync `VERSION` in the same commit.

## 6. Verification

- [x] 6.1 `bun run typecheck`. Report what it printed.
- [x] 6.2 `bun run build`. Report what it printed.
- [x] 6.3 Full `bun test` with `DATABASE_URL` set. Report passes and skips.
- [x] 6.4 Run the antislop linter over every Markdown file this change touched.
- [x] 6.5 `git diff --check`, then `git ls-files --eol` for the `w/` column.
- [x] 6.6 Drive the drag with `playwright-cli`, since `click` holds no gesture.
- [x] 6.7 Confirm the highlight draws, the insert lands, and `end` inserts nothing.
- [x] 6.8 Confirm the drop still works over a path inside a collapsed group.
