## Why

`purchase-requisition.json` carries 22 fields over 13 steps and 54 view
entries. Four of the fields nest inside the `line_item` group.
`line_item.item_description` alone appears in six of those steps. Setting
`required`, `readonly` and `visible` on one field across several steps
means opening the form editor once per step today. That one field costs
six visits.

Stage 41's first half, `studio-view-flags-module`, shipped the shared
primitives this needs: `effectiveFlag`, `setFlag`, `gatedKeys` and
`checkViewFlags` in `draft/view-flags.ts`. The grid itself does not exist.
This is stage 41's second half.

## What Changes

- A fourth panels-screen view, `matrix`, at
  `/processes/:id/edit/panels/matrix`. It joins `fields`, `dataSources` and
  `contract` in `PanelView`/`PANEL_VIEWS` (`routing.ts`). It inherits the
  deep link, Back behaviour, the `ROUTE_ROLE.edit` role gate, and the panels
  screen's checks-rail column for free.
- A grid component. Rows are the 22 catalog fields, in catalog order, with
  `line_item` heading its four children as a group header. Columns are the
  13 workflow steps, in `workflow.steps` order.
- Three cell states exist. A step with no view at all hatches its whole
  column. An absent field on a view-bearing step draws blank. Every other
  referenced field draws live.
- A cell editor: selecting a live cell opens one editor below the grid,
  driven by 17a's `BooleanOrExpressionInput` for each of `visible`,
  `required` and `readonly`. Not inline checkboxes, not a popover.
- `role="grid"` semantics apply, with a roving tabindex. The whole grid is
  one tab stop, and arrow keys move focus inside it. `<th scope="col">` per
  step and `scope="row"` per field. A sticky header row and first column.
  An accessible name and `tabindex="0"` on the scroll region.
- Two places name the process-wide views as three. One is the comment in
  `routing.ts`. The other is the panels-screen count in
  `.claude/rules/ui-glossary.md`, `studio-app`'s spec, and
  `studio-canvas`'s spec. All of them become four. The glossary gains a new
  term too: "field matrix".
<!-- antislop: allow synonym-rotation -->
<!-- Why: "edit rail" is `canvas/EditRail.tsx`'s fixed name
     (`.claude/rules/ui-glossary.md`). The rule reads it as a synonym for
     the "change" this document describes, which is a different thing. -->
- The canvas edit rail's Process section (`EditRail.tsx`) gains a fourth
  row, since `PROCESS_ROWS` derives from `PANEL_VIEWS`.

## Capabilities

### New Capabilities

None. The field matrix is a new view on the existing panels screen. It adds
no new area and no new persisted concept. It writes the same
`view.fields[]` entries the form editor already writes, through the same
`draft/view-flags.ts` module 17a shipped.

### Modified Capabilities

- `studio-app`: the panels screen's routed views go from three to four.
  The Process-section rail links go from three to four. The panels screen
  gains a fourth mounted view, plus the matrix's own layout, keyboard and
  cell-editor requirements.
- `studio-canvas`: the edit rail's Process-section description names four
  links instead of three.
- `spa-accessibility`: the grid's roving-tabindex and labelling
  requirements join the cross-package accessibility rules. A data grid is
  a pattern this spec does not cover yet.

## Impact

Affected files, inside `packages/web`:

- `src/areas/studio/routing.ts` (`PanelView`, `PANEL_VIEWS`, the "three
  views" comment)
- `src/areas/studio/screens/PanelsScreen.tsx` (`VIEW_LABEL`,
  `VIEW_ENTITY_TYPE`, a fourth mounted view)
- `src/areas/studio/panels/FieldMatrixPanel.tsx` (new) plus a small logic
  module for row/column/cell-state derivation
- `src/areas/studio/app.css` (`.studio-matrix-*` rules for the grid, its
  cell states and marks, and the below-grid editor)
- `src/areas/studio/canvas/EditRail.tsx` (`PROCESS_ROWS`'s label ternary)
- `src/areas/studio/draft/panel-rail.ts`. A new helper,
  `issueCountForSource`, filters by `source: "view"` for the matrix's rail
  badge. `checkViewFlags` issues carry `entityType: "step"`, the type
  every other per-step issue carries too. The existing
  `issueCountForEntityType` cannot isolate them on that alone.
  `panelEntityCounts` also gains a `matrix` key, the live-cell total.
- `src/i18n/catalogs/studio.ts` (new keys for the view label, rail link,
  column/row headers, cell-editor labels, cell-state hints)
- `.claude/rules/ui-glossary.md` ("field matrix" as the surface's one term;
  the panels-screen row goes from three views to four)

Tests, inside `packages/web`:

- `test/studio-fieldMatrix.test.ts` (new)
- `test/studio-edit-panel-rail.test.ts` (`issueCountForSource` and
  `panelEntityCounts.matrix`, beside their sibling functions' own tests)

Documents:

- `ROADMAP.md` (stage 41's headline and body, moving to `docs/roadmap-
  history.md` once the stage closes), `docs/current-state.md`,
  `docs/browser-checks.md`, `tmp/open-work-priority.md`

No schema change, no engine change, no API change, no `definitionHash`
movement. Every write goes through `setFlag` on the step's own
`view.fields[]`, the same array the form editor already mutates.
