## Context

`FieldMatrixGrid.tsx` renders each live cell's `visible`/`required`/
`readonly` flag with `BooleanOrExpressionInput`. `studio-form-editor`'s
strip also uses that shared component. It owns a `<select>` between
"boolean" and "CEL" mode, plus either a checkbox or a `ConditionInput`.
When a flag already holds a CEL expression, the matrix already skips
`BooleanOrExpressionInput`. It renders a static `CelStamp` badge
instead (see the existing "field matrix lists every catalog field"
requirement). Only the boolean/undefined branch is in scope here.

`studio-form-editor`'s own strip already solves the "checkbox by
default, CEL as an escape hatch" shape. Its `OverrideField` shows a
plain checkbox plus a collapsed "Developer view" `<details>`. That
disclosure holds `BooleanOrExpressionInput` for the CEL path. See
proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Delete the boolean-or-CEL `<select>` from the matrix's live cells.
- Keep every other matrix behavior unchanged: gating, bulk badges, the
  CEL stamp, the keyboard model, the toolbar.

**Non-Goals:**
- No change to `BooleanOrExpressionInput` or `studio-form-editor`. Both
  keep offering CEL mode exactly as they do today.
- No jump-to-field-editor affordance in the matrix. Brainstorming
  already declined this.
- No schema or data-model change. `ViewField`'s `boolean | Expression`
  union stays as it is. The matrix only narrows which arm its own UI
  can write.

## Decisions

**Render a plain checkbox inline in `FieldMatrixGrid.tsx`, not a
trimmed variant of `BooleanOrExpressionInput`.** The matrix's
boolean-only cell needs a `checked` prop reading
`effectiveFlag(raw, key) === true`. It also needs an `onChange`
handler that calls the existing `writeFlag`. A `<label>` wraps both,
carrying the existing flag label text. That is a five-line JSX block,
not a shared abstraction. `BooleanOrExpressionInput` keeps its
`<select>` for the one caller that still needs it,
`studio-form-editor`. The matrix stops importing it. Adding a
`hideCelSwitch` prop to `BooleanOrExpressionInput` instead would carry
a mode this component never exercises again after this change, for one
caller.

**Delete the two now-dead CSS rules rather than leave them.**
`.studio-matrix-cell-flag .bool-or-expr` and `.studio-matrix-cell-flag
select` (`app.css`) style a wrapper span and a `<select>`. The matrix
will never render either again. Nothing else in the stylesheet reuses
that selector pair.

**Leave `CelStamp` and its gating untouched.** It already renders a
static, non-interactive badge with the CEL source and a tooltip. The
matrix's bulk-badge and flagged-cell logic already skip CEL-carrying
cells too. Those requirements already match what this proposal asks
for.

## Risks / Trade-offs

[An author relied on the matrix to start a quick CEL change] →
mitigated by `studio-form-editor`'s existing "Developer view"
disclosure. It reaches the same `ConditionInput` one click away from
the field's own strip. This is the trade-off the proposal accepts on
purpose.

[A stale screenshot of the old `bool-or-expr` layout, in some doc] →
`docs/authoring-guide.md` and `docs/current-state.md` carry no
per-cell layout at this level of detail. Neither doc needs a change.

[A stale manual check] → `docs/browser-checks.md`'s field matrix walk
names a tab-stop count for an activated cell. It reads "six elements,
a select and a checkbox each." That count drops to three checkboxes
under this change. The tasks fix that line here, not in a later
change.

## Migration Plan

This change needs no data migration. It changes client-side rendering
only, behind no feature flag. It leaves the JSON definition contract,
`ViewField`, and every persisted draft or published body exactly as
they are. Ship it as a normal `packages/web` release. Rollback is a
plain revert of the two changed files.

## Open Questions

None.
