## Why

The studio's process-structure editor (`/processes/:id/edit`) already has
what a canvas-first editor needs. It has a hand-rolled SVG canvas with
drag-to-move and drag-to-connect. It has a structured condition builder at
every guard site. It has a per-entity validation-issues model.

But the visual design predates that capability. It still reads as a dense,
form-heavy editor. An all-steps accordion sits beside the canvas. Guard
conditions stay tucked behind a collapsed panel. Validation issues scatter
per-entity, with no single place to see what blocks a publish.

A design pass (`Studio UI mockups project`, states B1 to B5) reworks the
same screen's visual and interaction language. The inspector follows
selection. A guard condition reads as a sentence on the canvas itself. A
checks rail consolidates open issues. None of that adds new authoring
capability. This change carries that redesign into `packages/web`.

Note: `CLAUDE.md`'s prose currently calls no-code and low-code process
authoring (`ROADMAP.md` stage 27) "NOT STARTED." `ROADMAP.md` itself marks
stage 27 **DONE (a-e)** as of 2026-08-03. The structural half this change
touches (canvas, steps, paths, checks) is working capability. This change
redesigns its presentation, not its plumbing. `CLAUDE.md`'s prose is stale;
fixing it is not part of this change.

## What Changes

- Replace `EditScreen`'s two-pane layout (canvas plus an all-steps
  accordion) with four columns. The four columns are a place-on-canvas
  palette, the canvas, a selection-driven inspector, and a new checks
  rail. The inspector shows the selected step or path only, not an
  accordion of every step.
- Add a consolidated checks rail: a persistent panel next to the inspector.
  It lists every open `validation.issues[]` entry, grouped by source
  (structural, CEL, registry, duration). It replaces the current
  distributed `IssueList`-per-entity as the primary way an author sees what
  blocks a publish. Per-entity `IssueList` placements stay where an issue
  needs to sit next to the control that fixes it. The rail adds a
  consolidated view. Existing inline placements stay.
- Restyle the step inspector into a selection-driven form. It gains an
  inline rename on the canvas node itself; the identity section already
  carries the key field. Its existing `type`/`terminal` controls restyle
  as a "performed by" segmented control: participant, subprocess, or
  nothing-terminal. Its view entry gains form-status copy and a "Build
  the form" label. It gains a collapsible "Developer view" for the raw
  underlying data too, an eighth disclosure beside the existing seven.
- `FormEditorDialog` itself stays out of scope for this change; a separate
  change covers it.
- Restyle the path inspector the same way. Its existing `trigger` field
  restyles as a "triggered by" segmented control: a participant's
  choice, or a condition. Choosing "a condition" shows the existing
  `ConditionBuilder` row UI under an "Only when" heading. Add a
  collapsible "Developer view" for the raw CEL. `ConditionBuilder`'s
  own row-editing logic does not change; this reuses it under new
  placement and typography.
- For an automatic path, put the guard's plain-English summary on the
  path's canvas edge too. A new pure function computes that summary
  from `ConditionBuilder`'s own row data.
- Extend the canvas's existing drag-to-connect gesture. Today it only
  targets an existing step. For a release over empty canvas, this
  gesture now also runs the same trigger-consistency check the
  step-to-step gesture already runs. Rejection creates neither a step
  nor a path. Acceptance creates a new step at the drop point and a
  path to it, in one gesture.
- Add drag-to-place from the palette for Step, Subprocess, and End.
  This is one more way to add a step, beside the existing "add step"
  affordance. The no-selection inspector state keeps that affordance.
- Give `EditScreen` a process-identity header bar: process name, draft
  revision badge, save and publish status. It shows dirty state,
  last-saved time, and, after a publish, the version and hash. Today
  `DraftToolbar` computes dirty state and publish status; last-saved
  time is new, client-only state. This change lifts dirty state and
  publish status into `EditorArea` as controlled props, the same way
  `saveState` lifts already. Save, discard, and publish logic on
  `DraftToolbar` does not change.

## Capabilities

### New Capabilities

- `studio-checks-rail`: a persistent, source-grouped panel on
  `EditScreen` that lists every open validation issue for the loaded
  draft. It gives an author one place to see everything holding a publish
  back.

### Modified Capabilities

- `studio-canvas`: four-column layout (palette, canvas, inspector,
  checks). A selection-driven inspector replaces the all-steps
  accordion as the canvas screen's default panel. It gains an inline
  canvas-node rename, a "performed by" control, form-status copy, and
  a step-level "Developer view". A trigger-consistency check now gates
  dragging a path handle onto empty canvas. Passing it creates a step
  and a path in one gesture. The palette adds drag-to-place for Step,
  Subprocess, and End.
- `studio-condition-builder`: the existing row builder gains a
  canvas-edge plain-English summary for an automatic path's guard. It
  also gains a "triggered by" control and "Only when" heading on the
  path inspector. A collapsible "Developer view" placement covers its
  raw-CEL affordance too. The builder's row semantics (operand,
  operator, value, CEL readout, parse-back) do not change.

## Impact

- `packages/web/src/areas/studio/screens/EditScreen.tsx`: layout change to
  four columns. The reflow, palette included, stays nested inside the
  existing `surface === "structure"` conditional, alongside
  `.canvas-layout` today. Nesting matters: `studio-json-view` requires
  every draft-body-mutating component to stay unreachable while the
  JSON surface is active. The new palette mutates the draft too. The
  new header bar nests there as well. `DraftToolbar` itself keeps
  rendering on both surfaces, unchanged.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx` and
  `panels/PathsPanel.tsx`: restyled so the inspector shows one selected
  step's sections at a time. A selected path resolves to, and
  highlights within, its source step's paths section, per the existing
  rule. This restyle adds a `selectedPathId` prop to `PathsPanel`. It
  also widens `CanvasView`'s edge-click callback to pass the clicked
  path's id, so the specific row can highlight. It is not a standalone
  single-path screen. This replaces the accordion-of-all-steps
  presentation.
- `packages/web/src/areas/studio/panels/shared/ConditionInput.tsx` and
  `ConditionBuilder.tsx`: reused as-is under new placement. The canvas-edge
  label is new rendering in `canvas/CanvasView.tsx`.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx` and
  `canvas/connection.ts`: the drag-onto-empty-canvas-creates-a-step gesture,
  and palette drag-to-place.
- `packages/web/src/areas/studio/panels/DraftToolbar.tsx`: read from for
  the new header bar. Its own logic does not change.
- New: a checks-rail component that reads `validation.issues[]`
  (`draft/validation.ts`, `draft/panel-rail.ts`), grouped by `source`.
- `.claude/rules/design-language.md`: no change expected. The mockup's own
  token set already respects the zero-radius and semantic-token rules.
  Confirm this in design.md rather than assume it.
<!-- antislop: allow synonym-rotation -->
<!-- "authoring surface" is a fixed domain term from ROADMAP.md stage 27. -->
- Out of scope: `FormEditorDialog.tsx` and `EditPanelsModal.tsx` (a
  separate change covers these). Dark-scheme visual QA is also a separate
  change. `src/schema/definition.ts` and the CEL/validation engine stay
  untouched. Every authoring surface still produces the same JSON
  definition.
