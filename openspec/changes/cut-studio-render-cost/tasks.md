# Tasks

## 1. The written accessor cache

- [ ] 1.1 In `draft/view-flags.ts`, cache `writtenFieldCounts`'s accessor per field id and step index. Verify with a new test: repeated calls return equal numbers and walk the steps once.
- [ ] 1.2 Add a test that two accessors from two drafts share nothing. Verify it fails when the cache is module-level.

## 2. Hidden bodies draw their last visible draft

- [ ] 2.1 Add `holdWhileHidden` and the `useHeldWhileHidden(value, visible)` hook beside the draft store. Verify with a unit test of the function: visible returns the live value, hidden returns the last visible one.
- [ ] 2.2 Add `HeldDraft` and wrap the field matrix tab in `screens/EditScreen.tsx`. Make `FieldMatrixPanel` and `FieldMatrixGrid` `memo` components. Verify with the render-count test from design decision 1, or the browser probe if no DOM test library exists.
- [ ] 2.3 Pass `{ rows, heading, onOpenRow }` through the hook in `ChangesView`, with visibility from `EditScreen`. Make `ChangeList` a `memo` component. Call the hook above the early returns. Verify that `onCount` still receives the live count while hidden.
- [ ] 2.4 Verify that a selected matrix cell survives a round trip through another tab after a draft change. Verify that the reveal commit prints the live draft.

## 3. Lazy seams

- [ ] 3.1 Make `arrangeSteps` import `@dagrejs/dagre` inside the call. Await it in `onArrange` and in `test/studio-canvas-arrange.test.ts`. Verify that the arrange suite passes and a failed import leaves the layout untouched.
- [ ] 3.2 Load `FormEditorScreen` through `React.lazy` in `screens/EditScreen.tsx`, and `PlayerScreen` in `root.tsx`. Wrap each in a local `Suspense`. Add one studio catalog key for the loading line. Verify that `test/studio-leave-guard.test.ts` still passes.
- [ ] 3.3 Run `bun run build` in the container. Verify the chunk table. No studio chunk exceeds 500 kB. The form editor, player and dagre each sit in their own file.

## 4. Specs, docs and the measured result

- [ ] 4.1 Fill in "Measured after" in `design.md`: three keystroke rounds, the chunk table and a drag frame log. Verify that the Fields-tab commit median is at most 4 ms.
- [ ] 4.2 In `.claude/rules/ui-glossary.md`, extend the line on mounted bodies. A hidden field matrix and change list draw their last visible draft. Verify with a read-through against the delta spec.
- [ ] 4.3 Strike the `cut-studio-render-cost` entry in the audit index in `docs/decisions.md`. Verify with a search for the change name in that file.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, `bun run build`, then the full gated `bun test` with `DATABASE_URL` set. Verify that all three print green with the skip count in range.
- [ ] 5.2 Run the prose and whitespace gates over the push range from the host. Verify that both print zero rising findings and zero whitespace faults.
- [ ] 5.3 Run the browser check on the production build with `playwright-cli`. Run `/impeccable critique` and `/impeccable audit` on the Fields, Field matrix and Changes tabs. Verify that the form editor and the player open, and Arrange still lays out the canvas.
