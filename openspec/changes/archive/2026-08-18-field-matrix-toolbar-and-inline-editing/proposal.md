## Why

The field matrix ships today as the reduced build the archived change
`2026-08-15-studio-field-matrix` chose. It is a bare grid with a below-grid
editor. It has no bulk or filtering controls. A richer design already
exists: the vetted mockup at
`tmp/field_matrix_ui_starter/Field Matrix.dc.html`, built for that same
archived change.

That design.md deliberately dropped three of the mockup's pieces. Row
banding used a fixture-only group, not catalog order. Cells used inline
checkboxes, not a below-grid editor. The grid used a keyboard-inoperable
`role="grid"`. It also deferred two pieces outright as Non-Goals: an
inert-column filter, and bulk row/column toggles.

On a catalog the size of `examples/purchase-requisition.json` (22 fields,
13 steps, 54 live entries), an author edits one (step, field) pair at a
time. The below-grid editor gives no way to see or set a flag across a
whole row or column at once. It gives no way to collapse the steps that
declare no view at all.

## What Changes

- Add a toolbar above the grid. A "Hide inert columns" toggle removes
  steps with no `view` from the grid entirely. A live count line reports
  declared entries against the full field-by-step space.
- Add a static legend row. It explains the per-flag marks, the CEL stamp,
  the "not on this step" dash, and the flagged-cell marker.
- Column headers gain the step's `key` beside its label. Steps with no
  view gain an explicit "no view, inert" note. Columns gain bulk
  `visible`/`required`/`readonly` toggle badges. Each badge flips every
  live, non-CEL, non-gated cell in that column at once.
- Row headers gain the field's `type` beside its `key`. Rows gain the same
  bulk toggle badges, scoped to that field across every step.
- Live cells switch from a three-letter compact summary to individually
  interactive `visible`/`required`/`readonly` controls. `required` and
  `readonly` disable when `visible` resolves to `false` ("gated"). That
  matches the below-grid editor's own gating rule today.
- **BREAKING (UI behavior)**: this change removes the below-grid
  single-cell flag editor. An author edits a cell directly in the grid,
  through its own controls or the new bulk badges. No separate editor
  region remains.
- The grid stays one stop in the page's tab order, per
  `spa-accessibility`'s existing rule for this exact grid. Arrow keys
  still move a single roving stop between cells; that alone adds no new
  tab stop. Enter or Space, the grid's existing activation gesture,
  makes the focused cell's three controls reachable by Tab. Escape or
  moving focus away hands the one stop back to the grid. This change
  does not reproduce the mockup's raw per-checkbox tab stops. The
  reference catalog draws up to 162 of those in the mockup.
- The toolbar, legend and bulk row/column badges apply to the panels
  screen's field matrix only. The same grid component also mounts in
  the canvas dock's Field matrix tab. There, `studio-canvas` already
  requires no filter. It also requires a dock that never grows to fit
  its content.

  This change splits the grid itself (headers, cells, inline controls)
  from a panels-screen wrapper. The wrapper alone adds the toolbar,
  legend and badges. The dock keeps mounting the bare grid, gaining
  only the new inline per-cell controls.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the field matrix's live-cell rendering changes. So does
  its per-cell editing model, its toolbar, its column and row headers,
  and its bulk row/column flag toggles. This change replaces one
  requirement: "Selecting a live cell opens one flag editor for that
  (step, field) pair." Inline, per-cell editing takes its place.

  The requirement "The field matrix lists every catalog field against
  every workflow step" keeps its grid shape. Its live-cell description
  changes from a compact summary to individual controls. It also gains
  the toolbar, header and bulk-toggle behavior.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixPanel.tsx`: splits
  into a bare grid and a panels-screen wrapper. The bare grid carries
  column and row header content, cell rendering, and the new keyboard
  activation model. The wrapper carries the toolbar, legend and bulk
  toggles. This change removes the below-grid editor.
- `packages/web/src/areas/studio/dock/EditorDock.tsx`: mounts the split
  bare grid instead of the old single component. No behavior change to
  the dock itself. It still shows no toolbar, and it still never grows
  to fit its content.
- `packages/web/src/areas/studio/panels/fieldMatrixLogic.ts`: inert-column
  filtering, bulk-toggle math, count-line math. Existing pure test
  coverage extends to cover them, with new synthetic fixtures rather
  than a dependency on `examples/purchase-requisition.json`.
- `packages/web/src/i18n/catalogs/studio.ts`: new strings for the
  toggle, the legend, and the column note. This catalog is English-only
  by design (`.claude/rules/design-language.md`); no other locale
  catalog file changes.
- `packages/web/src/areas/studio/app.css`: new toolbar, legend, badge and
  checkbox styles. These replace the removed below-grid editor's styles
  where they no longer apply.
- This change touches no definition contract, no engine code, and no
  persisted shape. The grid still reads and writes `workflow.steps[].view`
  through the same `setFlag` primitive `studio-form-editor` already uses.
