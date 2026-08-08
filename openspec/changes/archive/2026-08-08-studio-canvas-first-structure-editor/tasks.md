## 1. Design direction

- [x] 1.1 Run `/frontend-design:frontend-design` for visual direction on
      the four-column layout, the selection-driven inspector, and the
      checks rail. Also pull in the installed Vercel skills
      (`web-design-guidelines`, `vercel-react-best-practices`,
      `vercel-composition-patterns`), per `CLAUDE.md`'s UI-work
      convention, which asks that UI/UX work not default to plain
      React/CSS choices.
- [x] 1.2 Confirm the mockup's "Modernist" token values (colors, type)
      against `.claude/rules/design-language.md` and
      `packages/web/src/shell/tokens.css`. Radius already matches
      (both are zero everywhere); reconcile anything else before
      building components against it.

## 2. Four-column layout and palette

- [x] 2.1 Add the palette column to `EditScreen.tsx`, listing Step,
      Subprocess, and End.
- [x] 2.2 Parameterize `StepsPanel`'s `addStep` (or extract a shared
      `createStep(kind: 'task' | 'subprocess' | 'end')` helper both
      `StepsPanel`'s button and the palette call), so it sets
      `type`/`terminal` per kind instead of hardcoding `type: 'task'`.
- [x] 2.3 Wire palette drag-to-place to that same parameterized "add
      step" Draft mutation.
- [x] 2.4 Confirm the palette's drag gesture uses Pointer Events
      (`onPointerDown`/`onPointerMove`/`onPointerUp`), consistent with
      `CanvasView.tsx`'s existing node and handle drags. Do not use
      native HTML5 Drag-and-Drop. `StepPalette.tsx` needs no
      `panzoom-exclude` class: it renders outside the canvas SVG
      entirely, so Panzoom's pointer handling never reaches it.
- [x] 2.5 Reflow `EditScreen.tsx` to four columns: palette, canvas,
      inspector, checks rail. Keep the reflow, palette included, nested
      inside the existing `surface === "structure"` conditional, in the
      same place `.canvas-layout` renders today. `studio-json-view`
      forbids a reachable draft-body-mutating control while the JSON
      surface is active, and the palette mutates the draft.
- [x] 2.6 `bun:test` coverage for the palette's drag-to-place handler as
      a pure function, per `studio-canvas`'s existing
      "interaction logic is tested as pure functions" convention.

## 3. Selection-driven inspector

- [x] 3.1 Add a no-selection state to the inspector column.
- [x] 3.2 Restyle `StepsPanel` to show only the selected step's sections
      (identity, assignment, paths, timers, actions, subprocess spec,
      view), instead of an accordion over every step.
- [x] 3.3 Restyle `PathsPanel` to show as the inspector's content when a
      path edge is selected, resolving to the path's source step per the
      existing rule. A selected path shows within its source step's
      paths section, not as a standalone single-path screen.
- [x] 3.4 Confirm every existing anchor survives the restyle: the
      assignment section's no-assignment warning, the identity section's
      missing-translation warnings, and the subprocess-spec section's
      cross-process check fieldset.
- [x] 3.5 Confirm the view entry still opens `FormEditorDialog` and holds
      no inline section, and that section disclosures keep their
      `aria-expanded`/`aria-controls` pattern.
- [x] 3.6 Extend or add `bun:test` coverage for the restyled panels'
      selection logic.
- [x] 3.7 Relocate the `workflow.initialStep` selector, currently an
      always-visible `<select>` above `StepsPanel`'s step list, into the
      selected step's identity section. The no-selection state removes
      the always-visible list it lived in.
- [x] 3.8 Add an inline rename control to the canvas step node: a
      double-click on a node's label opens a text field on the node
      itself, writing `step.label` through the same Draft mutation the
      identity section's label input already calls.
- [x] 3.9 `bun:test` coverage for the inline-rename commit logic as a
      pure function, per `studio-canvas`'s existing "interaction logic
      is tested as pure functions" convention.
- [x] 3.10 Restyle the identity section's existing `type`/`terminal`
      controls as a "performed by" segmented control: participant
      (type `task`), subprocess (type `subprocess`), or
      nothing/terminal. No new field; the control sets the same fields
      the existing type control sets today.
- [x] 3.11 Add status copy to the view entry ("N of M fields
      configured", or equivalent) and relabel it "Build the form". The
      entry keeps opening `FormEditorDialog` unchanged; only its copy
      changes.
- [x] 3.12 Add a collapsible "Developer view" disclosure to the step
      inspector, showing the selected step's raw JSON. This is an
      eighth disclosure beside the seven content sections, distinct
      from the path-guard's CEL "Developer view" toggle (section 6).
- [x] 3.13 Give `PathsPanel` a `selectedPathId` prop, and widen
      `CanvasView`'s edge-click callback to also pass the clicked
      path's id, so a selected path highlights its own row within the
      source step's paths section, not only the section itself.
- [x] 3.14 Relocate `StepsPanel`'s existing "+ Add step" button into
      the inspector's no-selection state, since the no-selection state
      replaces the always-visible step list the button sat below. This
      keeps the existing affordance reachable alongside the new
      palette drag-to-place.

## 4. Checks rail

- [x] 4.0 Add `structurallyValid` and `structuralChecked` to
      `ValidationResult` in `draft/validation.ts`. `structurallyValid` is
      `true` iff `compileProcessBody` succeeds (`compiled !==
      undefined`). `structuralChecked` is `true` iff the six structural
      checks ran at all: `false` when `runValidation`'s catch block sees
      `DurationValidationError` (structural checks never ran, since
      `compileProcessBody` raises on the duration issue before it calls
      `structuralIssues`), `true` when it sees `CompileValidationError`
      or when no exception reaches the catch block. Add `bun:test`
      coverage for three cases: zodValid-true/compiled-undefined
      (`structurallyValid` false), a duration-only failure
      (`structuralChecked` false), and a structural-only failure
      (`structuralChecked` true, `structurallyValid` false).
- [x] 4.1 Add a checks-rail component that reads `validation.issues[]`
      and groups entries by `source` (zod, structural, CEL, registry,
      duration).
- [x] 4.2 Show the held-back state for the structural group when
      `validation.structuralChecked` is false (not `validation.zodValid`
      alone — see design.md's "structural group needs its own 'did it
      run' flag" decision), for the CEL and registry groups when
      `validation.structurallyValid` is false, and for the duration
      group when `validation.zodValid` is false.
- [x] 4.3 Show an all-clear state when every group has no open issue.
- [x] 4.4 Mount the checks rail as the edit screen's fourth column,
      alongside the existing per-entity `IssueList` placements (unchanged).
- [x] 4.5 `bun:test` coverage for the grouping and held-back-state logic
      as pure functions, including the duration-only-failure case where
      the structural group holds back despite `zodValid` being true.

## 5. Canvas interaction: drop-on-empty-canvas creates a step

- [x] 5.1 Extend `CanvasView.tsx`'s `onHandlePointerUp` handler (via
      `geometry.ts`'s `hitTestNode`) so a release over empty canvas
      creates a step at the drop point through the same method
      `StepsPanel`'s "add step" button already calls.
- [x] 5.2 Chain that new step's creation to the existing "add path"
      method, so the same gesture also creates a path from the source
      step to it.
- [x] 5.3 Reuse the existing `CLICK_THRESHOLD`/`HANDLE_RADIUS` constants
      and `hitTestNode` in `CanvasView.tsx`/`geometry.ts`; do not add a
      new threshold. `connection.ts`'s `checkConnection` stays the
      trigger-consistency check for the newly created path.
- [x] 5.4 Run `checkConnection` against the candidate path's trigger
      before creating anything. On rejection, create neither the step
      nor the path, and surface the same inline rejection the
      step-to-step drop already shows. Only on acceptance does the
      gesture create the step, then the path, in that order, so a
      rejected candidate never leaves an orphan step behind.
- [x] 5.5 `bun:test` coverage for the new drop-on-empty-canvas branch,
      alongside the existing drop-on-a-step coverage, including the
      trigger-consistency rejection case (no step and no path created).

## 6. Condition builder: canvas-edge label and "Developer view"

- [x] 6.0 Add `summarizeCondition(condition: Condition, operands:
      Operand[]): string` to `conditionLogic.ts`, beside `toCel`. It
      walks the same `Condition`/`Row` model `ConditionBuilder` already
      holds, joining each row's operand label, comparison symbol, and
      value label with "and"/"or" per the condition's `joiner`, falling
      back to a `raw` row's own CEL text. `bun:test` coverage for this
      pure function, per this change's existing convention for new
      pure functions (2.6, 4.5, 5.5).
- [x] 6.1 Show a plain-English summary label on an automatic path's
      canvas edge, built by `summarizeCondition` from the same row data
      `ConditionBuilder` already computes.
- [x] 6.2 Fall back to raw CEL text on the edge label for a guard the
      builder keeps as a raw row.
- [x] 6.3 Restyle the path-guard site's CEL toggle as a collapsible
      disclosure labeled "Developer view", without changing the
      view-override sites' existing toggle presentation.
- [x] 6.4 Confirm the toggle's mode still does not persist to the draft
      or the published body.
- [x] 6.5 Add a "triggered by" segmented control to the path
      inspector: a participant's choice, or a condition. No new field;
      the control restyles the existing `trigger: "manual" |
      "automatic"` field.
- [x] 6.6 Show the existing `ConditionBuilder` row UI under an "Only
      when" heading when "a condition" is selected; hide it for "a
      participant's choice", since a manual path carries no guard.

## 7. Process-identity header bar

- [x] 7.0 Lift `DraftToolbar`'s private `savedBody`/`isDirty` and
      `publishResult` state into `EditorArea`, passed down as controlled
      props, mirroring the existing `saveState`/`onSaveState` pattern.
      Also add a distinct `onSaved` callback, fired only from `doSave()`'s
      success branch — not from `reload()`'s conflict-recovery branch,
      which keeps calling `dispatchSavedBody` directly and must not
      advance `lastSavedAt` (see design.md's "header bar reads lifted
      `DraftToolbar` state" decision). Extend `bun:test` coverage for
      `isDirty`/`savedBodyReducer` and for `onSaved` firing on save but
      not on reload, at the new call site.
- [x] 7.1 Add a header bar above the four-column layout, nested inside
      the existing `surface === "structure"` conditional (see task 2.5)
      so it renders on the Structure surface only. Show the process
      name, the draft's revision badge, and the dirty/saved state
      `DraftToolbar` computes and now passes up via `EditorArea`.
      `DraftToolbar` itself keeps its current placement above the
      `surface`/`json` tab row, rendering on both surfaces, unchanged.
- [x] 7.2 Show the published version and hash in the header bar after a
      publish, reading `publishResult` from `EditorArea`.
- [x] 7.3 Confirm `DraftToolbar`'s Save, Discard, and Publish buttons and
      their click handlers are unchanged; the header bar only reads their
      state.
- [x] 7.4 Track a client-only `lastSavedAt` timestamp in `EditorArea`,
      set from the `onSaved` callback task 7.0 adds (fired on every
      successful save, never on a reload), and show it in the header
      bar.

## 8. Browser verification

- [x] 8.1 Walk through the mockup's five states (blank draft, first step
      placed, dragging a path to empty canvas, the guarded fork, all
      checks clear) in a real browser, per `docs/browser-checks.md`'s
      convention for UI changes.
- [x] 8.2 Confirm keyboard operation of the inspector's section
      disclosures (Tab, Enter, Space) still works.
- [x] 8.3 Confirm the restyled screen renders correctly under
      `prefers-color-scheme: dark`, without a dedicated dark-scheme QA
      pass (that is a separate change; this is a sanity check only).

## 9. Verification

- [x] 9.1 Run `bun run typecheck`.
- [x] 9.2 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm the reported skip count, not just the pass count. A
      single-file rerun is not a valid signal.
