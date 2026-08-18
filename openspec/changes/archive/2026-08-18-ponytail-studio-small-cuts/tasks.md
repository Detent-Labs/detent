## 1. `draftToolbarState.ts` reducer to `useState` (finding 53)

- [x] 1.1 In `packages/web/src/areas/studio/screens/EditScreen.tsx`, replace
  `useReducer(savedBodyReducer, draft, initialSavedBody)` with
  `useState<Draft>(() => structuredClone(draft))`. Change the
  `onSavedBodyChange` prop passed into `useDraftToolbarActions`
  (`packages/web/src/areas/studio/panels/DraftToolbar.tsx`). It moves from
  the bare `dispatchSavedBody` to
  `(body: Draft) => setSavedBody(structuredClone(body))`.

  `DraftToolbar.tsx`'s own two call sites need no change. `doSave`'s
  success branch calls `onSavedBodyChange(draft)`. `reload`'s
  conflict-recovery branch calls `onSavedBodyChange(body)`. Each already
  passes the value to store, and the new wrapper is where the clone
  happens.

  `noUnusedLocals` then flags two now-dead imports in this file. Drop
  `useReducer` from the named `react` import on line 1 (`useState` stays,
  already imported alongside it). Drop `savedBodyReducer` and
  `initialSavedBody` from the `draftToolbarState.js` import on line 16;
  `isDirty` stays, since the dirty check still reads it.
- [x] 1.2 Delete `savedBodyReducer` and `initialSavedBody` from
  `packages/web/src/areas/studio/screens/draftToolbarState.ts`. Keep
  `isDirty` and its doc comment.

  With both functions gone, this file's `import type { Draft }` on line 1
  goes unused too: `isDirty` takes `unknown`, not `Draft`. Delete that
  import.
- [x] 1.3 Change `packages/web/test/studio-draftToolbarState.test.ts`.
  Replace every `savedBodyReducer(state, body)` and
  `initialSavedBody(draft)` call with a direct `structuredClone(...)` call,
  or a small local helper if that reads better. Keep every existing
  assertion unchanged, including the mutation-vs-clone regression case.

  Trim the `draftToolbarState.js` import on line 2 to match: drop
  `savedBodyReducer` and `initialSavedBody`, keep `isDirty`. The
  `import type { Draft }` on line 3 stays; the test's own local variables
  (`original: Draft`, and its later peers) still need the type.

  Reword the file's header doc comment (lines 5-23) to match the new
  shape. Today it says the comment extracts the savedBody transition into
  `savedBodyReducer` and drives it through DraftToolbar's wiring. Name the
  `useState` call and its wrapped setter in `EditScreen.tsx` instead. This
  test still drives the same sequence. Keep the rest of the comment
  unchanged, except one further correction below.

  The comment covers the no-interactive-DOM-test-environment rationale
  and the `render-frontend-error-states` design.md citation. It also
  carries a paragraph distinguishing this bug from `isDirty`. That
  paragraph names `publishGateLogic.ts` and `publishGateLogic.test.ts`.
  Both are gone: an earlier change folded them into
  `draftToolbarState.ts`. Reword the paragraph to name the current
  location instead. For example: "not in `isDirty` itself, in the
  `describe(\"isDirty\", ...)` block below."

## 2. Inline three one-caller modules, keep `processHeaderLogic.ts` (finding 54)

- [x] 2.1 Inline `openSectionForSelection`'s ternary
  (`selectedPathId ? "paths" : undefined`) at its call site in
  `packages/web/src/areas/studio/panels/StepsPanel.tsx`. Move
  `stepInspectorLogic.ts`'s doc comment to sit beside the inlined ternary
  at that call site. The comment cites the studio-canvas scenario about a
  selected path's row highlighting within the expanded paths section.
  Delete `stepInspectorLogic.ts` and
  `packages/web/test/studio-stepInspectorLogic.test.ts`.
- [x] 2.2 Inline `assignmentWarning`'s guard and its hard-coded string at
  its call site in `StepsPanel.tsx`. Keep them unchanged: same string,
  same guard.

  `StepsPanel.tsx` currently calls `assignmentWarning(step.terminal,
  step.assignment)` twice. It calls once in the `&&` conditional and once
  again in the rendered paragraph body. Compute the inlined guard once, as
  a local value. For example, a `const` inside the render can hold the
  warning string or `undefined`. Read that same local at both the
  conditional check and the paragraph body. The guard and its string then
  appear once each in the new code, not twice.

  Move `assignmentWarningLogic.ts`'s doc comment to sit beside that
  local's declaration. The comment explains why a missing assignment is a
  warning, never an `EditorIssue`. Nothing there reaches the publish path.

  Delete `assignmentWarningLogic.ts` and
  `packages/web/test/studio-assignmentWarningLogic.test.ts`. Change the
  comment at `packages/web/test/studio-draftValidationLogic.test.ts` line
  124, which names `assignmentWarningLogic.ts` by filename as the reason
  `runValidation` ignores the assignment-less-step warning. Point it at
  the inlined logic in `StepsPanel.tsx` instead of the deleted file.
- [x] 2.3 Inline `extractFields`'s defensive read at its call site in
  `packages/web/src/areas/studio/screens/ToolsScreen.tsx`. Move
  `toolsScratchpadLogic.ts`'s doc comment to sit beside the inlined read
  at that call site. The comment explains the defensive unknown-JSON read
  convention it shares with `JsonView`/`migrationPlanLogic`. Delete
  `toolsScratchpadLogic.ts` and
  `packages/web/test/studio-toolsScratchpadLogic.test.ts`.
- [x] 2.4 Leave `packages/web/src/areas/studio/screens/processHeaderLogic.ts`
  unchanged. Leave `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`'s
  import of it unchanged, and leave
  `packages/web/test/studio-processHeaderLogic.test.ts` unchanged. No code
  change applies to this file, per design.md's decision to keep it
  separate.

## 3. Consolidate `CanvasView.tsx`'s drag-move handlers (finding 55)

- [x] 3.1 Add one pointer-tracking helper, for example
  `trackPointer(drag, setDrag, patch)`, in
  `packages/web/src/areas/studio/canvas/CanvasView.tsx`. It guards on a
  non-null drag state. It merges the given partial patch into that state.
  Each caller computes the patch itself.

  Node, group, waypoint, and connect drag pass
  `{ current: toSvgPoint(e) }`. The marquee passes
  `{ currentClient: { x: e.clientX, y: e.clientY } }`. The helper does not
  compute `toSvgPoint(e)` itself: the marquee needs the raw client point,
  not the SVG-space one.
- [x] 3.2 Replace the five duplicated bodies with calls to the helper:
  `onNodePointerMove`, `onGroupPointerMove`, `onWaypointPointerMove`,
  `onMarqueePointerMove`, `onHandlePointerMove`. Do not change any
  handler's name, its `e.stopPropagation()` where it already appears, or
  any drag state's shape.
- [x] 3.3 Re-read each `on*PointerUp` handler against its pre-change body.
  Confirm no drag gesture's threshold, drop resolution, or selection
  behavior changed. None of them should need a change.

## 4. Spec and docs currency

- [x] 4.1 Confirm the `studio-app` spec delta at
  `openspec/changes/ponytail-studio-small-cuts/specs/studio-app/spec.md`
  matches the implemented behavior of task group 2 before archiving.
  Extraction earns its keep on complexity or a documented regression
  class, not on caller count.
- [x] 4.2 Change `docs/current-state.md` at its two spots this change makes
  stale. Drop the "tools and Player" entry's reference to
  `toolsScratchpadLogic.ts` (around line 1909), since task 2.3 deletes that
  file. Reword the "The reducer writes it" sentence about `savedBody`
  (around line 3287). Describe the `useState` wrapper task 1.1 puts in its
  place, not a reducer.

## 5. Real-browser verification

- [x] 5.1 Using `playwright-cli`, not the Playwright MCP tools, open a
  draft in `EditScreen.tsx`, the studio canvas screen. Type into the
  base-locale control. Confirm the content locale moves on a well-formed
  value, and stays put on a part-typed one. This exercises the kept
  `processHeaderLogic.ts` path together with task 1's `EditScreen.tsx`
  state change.
- [x] 5.2 Save the draft.
  <!-- antislop: allow synonym-rotation -->
  Then either discard it, the button's literal label, or trigger a
  reload. Confirm the unsaved-changes gate reads correctly before and
  after. This exercises task 1's `useState` conversion, mirroring
  `studio-draftToolbarState.test.ts`'s conflict-reload-publish sequence in
  a real browser.
- [x] 5.3 On the canvas, select a step, then select one of its paths.
  Confirm the inspector's paths section opens, and the selected path's row
  highlights. This exercises task 2.1's inlined `openSectionForSelection`.
- [x] 5.4 Select a non-terminal step with no assignment. Confirm the
  no-assignment warning still renders beside the assignment editor.
  Confirm it does not render on a terminal step. This exercises task 2.2's
  inlined `assignmentWarning`.
- [x] 5.5 Open the Tools screen's registry scratchpad against a process
  body with fields. Confirm the field list still populates. This exercises
  task 2.3's inlined `extractFields`.
- [x] 5.6 On the canvas, drag a step node, a group box, and a waypoint
  handle. Drag a connect-drag handle between two steps. Drag a shift-held
  marquee over several nodes. Confirm all five gestures move, connect, or
  select exactly as before. This exercises task 3's consolidated
  drag-move handler.
- [x] 5.7 Add each of 5.1-5.6 as its own entry in `docs/browser-checks.md`,
  naming this change. `development-toolchain`'s "A browser check lands as
  an assertion or as a checklist entry" requirement governs this choice.
  None of the six qualifies as a `bun:test` assertion under it.

  This repo's only component-test style renders through
  `renderToStaticMarkup`. It fires no event. None of the six checks a
  defect this repository already produced. None names a recording file
  and line either. `docs/browser-checks.md` sits outside `openspec/`.
  Archiving this change does not carry the entries away.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and report its output.
- [x] 6.2 Run the FULL `bun test` suite with `DATABASE_URL` set. Never rely
  on a single-file rerun. Report the pass, fail, and skip counts. Confirm
  the skip count matches the pre-change baseline, so no suite silently
  skipped for lack of the database.
