## Why

The field matrix's column-header bulk-toggle badges do not align with the
checkboxes in the cells beneath that column. Both rows carry the same
three flags: visible, required, readonly.

The header badge row and the cell checkbox row are two independent flex
layouts. They use different gaps and differently sized items, so nothing
ties a badge's horizontal position to its checkbox's position. A column
whose header shows fewer than three badges drifts further. The remaining
badges collapse left instead of holding their slot. The result reads as
broken alignment on a grid built for column-by-column scanning.

## What Changes

- The column header's bulk-toggle badges (`BulkBadges` in
  `FieldMatrixGrid.tsx`) and the cell's flag checkboxes render into a shared
  fixed-width, three-column grid. One column holds each flag key: `visible`,
  `required`, `readonly`. Column widths match in the header row and the cell
  row, and each item centers in its own column.
- `BulkBadges` keeps all three grid slots even when a key is ineligible
  for that column or row. It renders an empty slot in place of the badge
  instead of dropping it from the layout. Badge position never shifts
  based on which flags are eligible.
- Applies to both mounts of `FieldMatrixGrid`: the panels-screen field
  matrix and the canvas dock's Field matrix tab.
- Row headers reuse the same `BulkBadges` component and pick up the same
  fixed-width grid for styling consistency. A row header has no column
  beneath it to align with. The grid there is a consistency choice, not a
  correctness one.
- CSS and render-structure only. No change to what a bulk badge does, which
  cells are eligible, or any definition-contract behavior.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the field matrix's "Column and row headers offer bulk flag
  toggles on the panels screen" requirement gains a layout constraint. A
  column header's flag badges SHALL occupy the same fixed per-flag column
  positions as the flag checkboxes below them. An ineligible flag's slot
  SHALL stay empty rather than collapse.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx`: `BulkBadges`
  render logic (keep all 3 slots) and cell flag rendering (grid slot
  markup).
- `packages/web/src/areas/studio/app.css`: `.studio-matrix-flags` and
  `.studio-matrix-cell-flags`, plus related rules, move from independent
  flex rows to a shared fixed-column grid.
- No API, schema, or engine changes.
