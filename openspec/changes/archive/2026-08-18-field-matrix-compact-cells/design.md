## Context

`FieldMatrixGrid.tsx` renders each live cell's `visible`/`required`/
`readonly` flag as a `<fieldset>`. That fieldset carries
`className="studio-matrix-cell-flag"` and `disabled={disabled}`. It
wraps a `<label>{text}<input type="checkbox" .../></label>`. `app.css`
stacks these fieldsets vertically, one per flag, with a hairline
`border-top` between them. A CEL-carrying flag already renders
`CelStamp` instead, in the same stack.

This all landed in `field-matrix-boolean-only` (archived). That
change removed the boolean-or-CEL `<select>` but kept the stacked,
labeled layout.

`BulkBadges` already renders one badge per flag on every column and
row header. It reads `FLAG_LETTER[key]` for its text, `"V"`, `"R"`,
`"O"` today.

This change skips a `frontend-design` pass. `CLAUDE.md` asks for one
before reshaping a screen or component. That pass supplies visual
direction. Here, a user-supplied screenshot supplied it instead. It
pinned the row layout. It pinned the checkbox arrangement. It pinned
the badge text too. `frontend-design` exists to answer a question this
change already has answered.

## Goals / Non-Goals

**Goals:**
- Lay a live cell's flag controls out in one horizontal row instead
  of a stacked list.
- Keep every checkbox's flag identifiable to a screen reader without
  a visible label.
- Widen the bulk-badge letters to three characters, matching the
  order the cells now read left to right.

**Non-Goals:**
- No change to gating (`gatedKeys`), the keyboard/roving-tabindex
  model, the bulk-toggle write path (`applyBulkToggle`), the toolbar,
  the legend, or the flagged-cell marker.
- No change to `CelStamp`'s own content. It keeps its "CEL" badge,
  source text, and tooltip. Only its position in the cell moves.
- No schema or data-model change.

## Decisions

**Drop the `<fieldset>`/`<label>` wrapper for a bare `<input
aria-label={...} />`.**

The visible label text is what made the stacked layout wide. Removing
it needs no replacement wrapper. The `disabled` attribute now works
directly on the checkbox. The accessible name moves to `aria-label`.
That covers what the visible label text used to carry. It is the same
idiom `BulkBadges` (same file) already uses: a compact visible mark,
paired with `aria-label`/`title` carrying the flag's full name.

`BooleanOrExpressionInput` stays as it is. `studio-form-editor` still
uses it. This change touches only `FieldMatrixGrid`'s own inline
rendering. It leaves that shared component alone.

**Lay the row out with flexbox on a new `<span
className="studio-matrix-cell-flags">` wrapper, one level inside the
`<td>`.**

An earlier version of this decision put `display: flex` directly on
`.studio-matrix-cell`, the `<td>` itself, to avoid extra markup. The
browser check disproved that. A `<td>` with `display: flex` stops
being a table cell for layout purposes. The row's columns then lost
their alignment. Three checkboxes rendered stacked, ignoring the
table's own column widths entirely.

The `<td>` now keeps its default table-cell display. One `<span>`
inside it carries the flex row instead. That span wraps only the live
cell's controls. The blank cell's dash and the empty hatched cell stay
untouched, each still outside any flex context.

**Delete `.studio-matrix-cell-flag` and `.studio-matrix-cell-flag
label`. Add a `:disabled` rule on the input.**

The hairline divider and the uppercase label styling served the old
stacked layout only. Both go. A new rule targets the checkbox
directly instead of the removed fieldset. It carries the same 0.45
opacity the old rule gave the whole flag.

**Widen `FLAG_LETTER` to `VIS`/`REQ`/`RO`.** This is a pure text change
in one object literal. `BulkBadges` and its CSS need no other change.
The stamp already sizes to its content, not to a fixed width.

## Risks / Trade-offs

[A screen reader user loses information the visible label carried] →
the `aria-label` names the same flag the visible text did. The
browser check verifies each checkbox's computed accessible name, not
just its DOM attribute.

[The narrower cell crowds three checkboxes together, harder to click
precisely] → `gap: var(--space-2)` keeps the design language's own
spacing scale. The browser check tunes the exact spacing by eye,
rather than a pixel value pinned here.

## Migration Plan

This change needs no data migration. It changes client-side rendering
only, behind no feature flag. It leaves the JSON definition contract
and every persisted draft or published body exactly as they are. Ship
it as a normal `packages/web` release. Rollback is a plain revert of
the two changed files.

## Open Questions

None.
