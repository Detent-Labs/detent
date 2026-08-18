## Why

The field matrix's live cells currently show a boolean-or-CEL switcher
(`BooleanOrExpressionInput`) for every `visible`/`required`/`readonly` flag
that is not already CEL. CEL is a rare, specialized escape hatch. Authoring
it belongs on the field's own strip: `studio-form-editor`'s "Developer view"
disclosure. The matrix exists for a fast, boolean overview of every field
against every step, not for CEL authoring. Offering the switch in the matrix
invites an author to start a CEL edit there. That control was never built to
show or edit an expression usefully.

## What Changes

- The field matrix's live-cell controls for `visible`/`required`/`readonly`
  become plain boolean checkboxes. The boolean-or-CEL select disappears from
  the matrix.
- **BREAKING**: the matrix loses its CEL switch. An author now starts CEL
  authoring on the field's own strip instead.
- A flag that already carries a CEL expression keeps rendering as the
  existing non-editable CEL stamp. That stamp shows a mono "CEL" badge, the
  source text, and a tooltip. This proposal does not touch it.
- Two CSS rules go away as dead code. They only styled the now-removed
  select and its wrapper span inside a matrix cell.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the field matrix's "A live cell edits its own view entry
  inline" requirement changes. Each flag gets a plain boolean checkbox, not
  a boolean-or-CEL control. CEL authoring for these flags moves exclusively
  to `studio-form-editor`.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx`: live-cell flag
  rendering swaps `BooleanOrExpressionInput` for a plain checkbox.
- `packages/web/src/areas/studio/app.css`: removes the two dead rules
  `.studio-matrix-cell-flag .bool-or-expr` and `.studio-matrix-cell-flag
  select`.
- No schema, data model, or other screen changes. `studio-form-editor`'s own
  strip keeps its checkbox and its "Developer view" CEL disclosure as they
  are.
- `docs/browser-checks.md`: the field matrix's manual keyboard-activation
  check names the old six-element (select + checkbox) tab-stop count. It
  changes to name three checkboxes.
