## 1. The draft transform

- [ ] 1.1 Add `packages/web/src/areas/studio/draft/insertOnPath.ts`.
- [ ] 1.2 Take the step list, a source step id, a path id and the new step.
- [ ] 1.3 Retarget that path's `to`, keeping its `id`, `key`, guard and priority.
- [ ] 1.4 Create the new step's one path through `newPath`, with the same trigger.
- [ ] 1.5 Give the new path no guard and no priority.
- [ ] 1.6 Return a new list. Mutate no input.
- [ ] 1.7 Add `packages/web/test/studio-insertOnPath.test.ts`.
- [ ] 1.8 Cover the retarget, the trigger inheritance and the guard staying put.
- [ ] 1.9 Cover a manual source path and an automatic one carrying a priority.

## 2. The DOM handle on an edge

- [ ] 2.1 In `CanvasView.tsx`, give the edge group `data-path-id`.
- [ ] 2.2 Give it `data-step-id` for the source step.
- [ ] 2.3 Skip both when the path has no `id` yet.

## 3. The drop branch

- [ ] 3.1 In `EditScreen.onPaletteDrop`, read `closest("[data-path-id]")` first.
- [ ] 3.2 Fall through to today's free placement when it finds none.
- [ ] 3.3 Fall through as well when the dragged kind is `end`.
- [ ] 3.4 Otherwise create the step, then apply `insertOnPath` in one `mutate`.
- [ ] 3.5 Clear that path's waypoints in the same layout write.
- [ ] 3.6 Keep the existing snap, the `onMoveStep` call and the selection.

## 4. The drop-target state

- [ ] 4.1 Add `onDragMove(kind, clientX, clientY)` to `EditRail`, fired on move.
- [ ] 4.2 Hold `insertTargetPathId` in `EditScreen`, resolved the way 3.1 does.
- [ ] 4.3 Clear it on release and when no path sits under the pointer.
- [ ] 4.4 Resolve it to nothing while the drag carries an `end` step.
- [ ] 4.5 Pass it to `CanvasView` and add `.canvas-edge-insert-target` on match.
- [ ] 4.6 Style that class in `app.css`: heavier stroke, accent, no radius.

## 5. Verification

- [ ] 5.1 `bun run typecheck`. Report what it printed.
- [ ] 5.2 `bun run build`. Report what it printed.
- [ ] 5.3 Full `bun test` with `DATABASE_URL` set. Report passes and skips.
- [ ] 5.4 Run the antislop linter over every Markdown file this change touched.
- [ ] 5.5 `git diff --check`, then `git ls-files --eol` for the `w/` column.
- [ ] 5.6 Drive the drag with `playwright-cli`, since `click` holds no gesture.
- [ ] 5.7 Confirm the highlight draws, the insert lands, and `end` inserts nothing.
- [ ] 5.8 Confirm the drop still works over a path inside a collapsed group.

## 6. Documentation

- [ ] 6.1 Move stage 31 to the done table in `ROADMAP.md`.
- [ ] 6.2 Write the stage 31 entry in `docs/roadmap-history.md`.
- [ ] 6.3 State there why no delete affordance shipped.
- [ ] 6.4 Add the insert gesture to the canvas entry in `docs/current-state.md`.
- [ ] 6.5 Add the browser check to `docs/browser-checks.md`.
- [ ] 6.6 Sync `VERSION` in the same commit.
