## Context

`FieldMatrixGrid.tsx` renders two independent flex rows per column. The
header's `BulkBadges` fills `.studio-matrix-flags`. Each cell's flag
controls fill `.studio-matrix-cell-flags`. See proposal.md for why they
drift.

Both mounts of the component share this file and its CSS. That covers
the panels-screen field matrix and the canvas dock's Field matrix tab. A
layout fix here reaches both mounts at once.

## Goals / Non-Goals

**Goals:**
- One shared column layout for the header badge row and the cell checkbox
  row. A flag's badge and its checkbox then always sit in the same
  horizontal slot.
- Keep that alignment when a column offers fewer than three badges.

**Non-Goals:**
- Changing which flags are eligible, what a bulk badge does, or the
  keyboard/roving-focus model. Those stay exactly as `studio-app` already
  specifies.
- A design-system token for the column width. Nothing outside this one
  component needs it yet.

## Decisions

**Grid, not flex, for both rows.** `.studio-matrix-flags` and
`.studio-matrix-cell-flags` become CSS grids: `grid-template-columns:
repeat(3, var(--matrix-flag-col));` plus `justify-items: center`. A grid
gives each of the three flags (`visible`,
`required`, `readonly`) an explicit, equal-width track. A flex row sizes
each item by its own content instead. Column position no longer depends
on how wide a badge's text happens to be.

**One local custom property, not a new design token.** Both rules read
`var(--matrix-flag-col)`, declared once on `.studio-matrix-table`, not in
`tokens.css`. The header row and the cell row each declared their own
width. Nothing forced the two to match. That gap between two independent
declarations is the bug this change fixes. One declaration removes the
chance of a repeat. It does not promote the value to a shared
design-system token, since nothing else needs it yet.

`column-gap: 0` matches on both rules too, for the same reason. An
unequal gap would reintroduce drift even with matching column widths.

**Column width: `1.75rem`.** Sized for the widest badge, "REQ", at the
existing 10px mono, uppercase, tracked style. That includes its
`space-1` padding and 1px border on each side, about 28px total. A
native checkbox is narrower. It centers inside the same track with room
to spare. The three columns total `5.25rem`. The header `th` already
fixes the column width at `11rem`, so nothing reflows.

**`BulkBadges` renders three slots, not `eligibleKeys.length` slots.** It
maps over `FLAG_KEYS`, always three, instead of filtering to
`eligibleKeys` first. An ineligible key renders an empty `<span
aria-hidden="true">` in place of the button. That span claims the same
grid track. It carries no visible mark, no tab stop, and nothing for a
screen reader to announce. This is the change that keeps a
`visible`-only column aligned with a column that has all three badges.
The empty slot still claims its track.

**Row headers share the same grid.** They reuse `BulkBadges`, so they
get the fixed grid for free. A row header has no column of checkboxes
beneath it. Nothing about this change makes it more correct there. It
keeps one component and one CSS rule. Splitting `BulkBadges` into a
column variant and a row variant would only serve a cosmetic
difference.

**CEL cells keep their existing truncation.** A flag rendered as a
`CelStamp`, an active CEL expression, already ellipsis-truncates its
source text. It already carries the full expression in its `title`.
Confined to the same `1.75rem` track as a checkbox, that truncation
triggers sooner. See Risks below.

## Risks / Trade-offs

- **Less CEL preview text.** Today it can grow past its fair share,
  when neighboring items are small. The fixed grid caps it to one
  column's width instead. Mitigation:
  the stamp already carries the full source in `title`. The letters
  `CEL` still render as the primary signal. The truncated preview was
  already a hint, not the full value.
- **A future fourth flag key would need a fourth column.** `FLAG_KEYS`
  is a fixed three-entry array today: `visible`, `required`, `readonly`.
  That matches the definition contract's `ViewField` flags. Adding a
  flag is a schema change on its own. That change would touch this grid
  too.

## Migration Plan

CSS and one component's render logic; no data migration. It ships in one
deploy, no feature flag. The panels screen and the canvas dock both pick
up the new grid the next time either renders.

## Open Questions

None. The column width, the shared custom property, and the empty-slot
render change are all decided above.
