## Why

The field matrix's live cells stack a text-labeled checkbox per flag
("VISIBLE", "REQUIRED", "READONLY"), one above the next. That reads
well spelled out. The grid exists for a fast overview across many
fields and steps, though. That layout costs three lines of cell
height for every one.

A single row of three checkboxes reads just as well. It also fits far
more of the grid on screen at once. That row keeps the same order the
column and row headers already use for their bulk badges.

## What Changes

- Each live cell's three flag controls move from a stacked list to
  one horizontal row. The old list put a label above each checkbox,
  one flag per line. Each flag now gets a plain checkbox, with no
  visible label.
- **BREAKING**: a screen reader that announced a label like "Visible"
  now hears nothing from visible text. The checkbox instead carries an
  `aria-label` naming its flag. The announcement stays the same in
  substance.
- The bulk-toggle badges on column and row headers change their text
  from a single letter (`V`/`R`/`O`) to three letters (`VIS`/`REQ`/
  `RO`). Pure text change; the badges keep flipping the same cells the
  same way.
- A flag that already carries a CEL expression keeps rendering as the
  existing `CelStamp` badge (mono "CEL" mark, source text, tooltip).
  It now sits in the same horizontal row as its cell's other two
  controls instead of its own stacked row.
- Dead CSS rules go away. They only supported the stacked, labeled
  layout: the per-flag hairline divider, and the label's uppercase
  text styling.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the field matrix's "A live cell edits its own view
  entry inline" requirement changes. Each flag's checkbox drops its
  visible label for an `aria-label`, and the three controls sit in one
  row instead of stacked.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx`:
  live-cell flag rendering drops the `<fieldset><label>` wrapper for a
  bare `<input aria-label=... />`. `FLAG_LETTER` widens to three
  letters per flag.
- `packages/web/src/areas/studio/app.css`: `.studio-matrix-cell`
  switches to a flex row. The change deletes
  `.studio-matrix-cell-flag` and `.studio-matrix-cell-flag label`. A
  new `:disabled` rule targets the checkbox input directly.
- No schema, data model, or other screen changes. The gating logic and
  the keyboard model stay as they are. So do the bulk-toggle write
  path, the toolbar, and the flagged-cell marker. Two screens mount
  `FieldMatrixGrid`: the panels screen and the canvas dock's Field
  matrix tab. Both share the one component, so both pick up the new
  layout together.
