## 1. Shared connection-validity predicate

- [x] 1.1 In `src/schema/definition.ts`, extract the inline "all-manual or
      all-automatic, unique priority among automatic paths" check (currently
      inline in the step `superRefine`) into a standalone exported function,
      e.g. `checkPathTriggerConsistency(existingPaths, candidate): { ok: true } | { ok: false, reason: string }`.
- [x] 1.2 Update the existing `superRefine` to call the extracted function so
      there is exactly one implementation of the rule.
- [x] 1.3 Confirm the function is reachable from `packages/studio` through
      the existing `workflow-engine/schema` exports-map entry (add it to the
      export surface only if it isn't already covered).
- [x] 1.4 `bun:test` coverage for the extracted function directly (accept,
      reject-mixed-trigger, reject-duplicate-priority), independent of the
      full definition validation suite.

## 2. Canvas package setup

- [x] 2.1 Add `@panzoom/panzoom` to `packages/studio/package.json` (same
      version already used by `packages/editor`).
- [x] 2.2 Create `packages/studio/src/canvas/` module structure (rendering
      components separate from the pure logic modules below).

## 3. Pure logic modules (tested, no rendering)

- [x] 3.1 `canvas/layout.ts`: BFS-depth-from-`initialStep` auto-place
      function — takes the draft body and existing partial `layout`, returns
      computed positions for steps absent from `layout` without mutating it.
- [x] 3.2 `canvas/geometry.ts`: hit-testing (point-in-node-bounds) and
      drag-delta computation as pure functions over node positions.
- [x] 3.3 `canvas/connection.ts`: wraps the shared
      `checkPathTriggerConsistency` (task 1.1) for canvas-side inline
      rejection, returning the same accept/reject-with-reason shape. Does not
      itself append the path — that happens via `updateInDraftArray` at the
      call site (task 5.2), same as `PathsPanel`'s "add path" action.
- [x] 3.4 `bun:test` coverage for 3.1–3.3: auto-place produces distinct
      positions and never touches already-present layout entries;
      hit-testing and drag-delta on known fixtures; connection validity
      accept/reject cases (mirrors task 1.4's cases from the canvas side).

## 4. Canvas rendering

- [x] 4.1 SVG node rendering: step rectangle, label (`--font-body`), id/key
      (`--font-display`, muted), selected-state border in `--color-accent`.
- [x] 4.2 SVG edge rendering: solid (automatic) vs. dashed (manual) lines,
      arrowhead at target, guard-chip and priority-badge/"else" marker per
      the visual design doc (`docs/superpowers/specs/
      2026-07-28-studio-canvas-visual-design.md`).
- [x] 4.3 Terminal-step stamp marker (rotated seal glyph, bound outcome key)
      for terminal steps.
- [x] 4.4 Pan/zoom wiring via `@panzoom/panzoom` on the canvas root, plus a
      "fit to view" control.
- [x] 4.5 Canvas background (dot grid on `--color-surface-muted`) and a
      toolbar strip with the "fit to view" control (wheel-zoom and
      drag-to-pan need no button — `@panzoom/panzoom` handles both
      directly; "add step" stays `StepsPanel`'s own action per the 6.1/6.2
      correction, not duplicated on the canvas).

## 5. Interactions

- [x] 5.1 Node drag: pointer-events-based drag using `canvas/geometry.ts`,
      committing the new position on release (not on every pointer move) via
      a layout-update callback threaded down from `EditorArea`'s
      `setSaveState` — i.e. `setSaveState(s => ({ ...s, layout: { ...s.layout, [stepId]: {x,y} } }))` —
      not `useDraft()`/`mutate()`, since `layout` lives in `saveState`, not
      the Draft model.
- [x] 5.2 Connect-handle drag-to-connect: rubber-band line follow, hit-test
      candidate target on release, run `canvas/connection.ts`, on accept
      append the path via `updateInDraftArray(mutate, ...)` over
      `step.paths` (the same call `PathsPanel`'s "add path" action makes),
      show the inline reason and create nothing on reject.
- [x] 5.3 Selection: clicking a node or edge selects it; clicking empty
      canvas deselects.
- [x] 5.4 Wire auto-placed (task 3.1) positions into initial render without
      writing them into `saveState.layout`.

## 6. EditScreen integration

- [x] 6.1 Restructure `packages/studio/src/screens/EditScreen.tsx`: replace
      the stacked-panels-only column with a two-column layout — canvas
      (flex-grow) and a fixed-width inspector aside hosting `StepsPanel`
      unconditionally (list + "+ Add step" always reachable); the panels not
      tied to a canvas selection (`RegistryPanel`, `FieldCatalogPanel`,
      `DataSourcesPanel`, `ContractPanel`) stay outside the canvas, above or
      beside it.
- [x] 6.2 Lift `StepsPanel`'s internal `expanded` accordion state to an
      optional controlled prop (`selectedStepId`/`onSelectStep`, defaulting
      to today's internal `useState` when unset). Canvas step-selection sets
      it directly; an edge selection resolves to its source step id first,
      then sets the same prop — no standalone `PathsPanel` mount, it's
      already nested in `StepsPanel`'s row.
- [x] 6.3 Confirm save/conflict handling (`studio-app`'s existing
      revision/409 flow) is untouched — canvas path edits flow through the
      same `useDraft()` instance panel edits already use, and canvas layout
      edits flow through the same `saveState` `DraftToolbar` already reads.
- [x] 6.4 Add `packages/studio/src/app.css` rules for the canvas (tokens
      only, no new colors) per the visual design doc.

## 7. Verification

- [x] 7.1 `bun run typecheck` passes.
- [x] 7.2 Full `bun test` suite passes with `DATABASE_URL` set (not a
      single-file rerun — DB-backed suites share one database and contend
      when run back-to-back in isolation). 1098 pass, 0 fail, 0 skip.
- [x] 7.3 Manual check in the running dev server (real browser via
      playwright-cli): created a process, added two steps via the
      always-visible inspector, dragged a step (position persisted to
      `layout` on save, the untouched step's auto-placed position correctly
      NOT persisted), and drag-to-connected a path (correct
      `{id, to, key, trigger}` shape, verified via a direct `GET
      /drafts/:processId`). Found and fixed a real bug in the process:
      Panzoom's native down-handler intercepted every drag as a pan before
      React's synthetic events fired — fixed with Panzoom's `panzoom-exclude`
      class (see design.md Decisions/Risks). Rejection-path (invalid
      connection) verified via unit tests only, not re-driven through the
      browser — same code path as the accepted case, no separate rendering
      risk.
