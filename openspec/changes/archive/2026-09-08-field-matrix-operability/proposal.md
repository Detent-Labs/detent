## Why

An impeccable critique and audit measured the Field matrix during
`stylex-shorthand-repair`. Both found faults that predate that change, and it
swept none of them in. Eight remain, verified against the source on
2026-09-08.

The worst one destroys work. A bulk badge reads `eligible.every(...)`. A
column where some cells carry the flag then looks exactly like a column where
none do. Pressing it writes every cell. Pressing again clears every cell. The mix
never returns, and the studio offers no undo.

The rest cost reach rather than data. The grid stands 32 tab stops against a
`spa-accessibility` requirement that states one. Thirty badges share three
accessible names. A fieldless process draws a header-only table, which
`design-language.md` forbids in words. A toggle announces a pressed state that
nothing paints. A gated checkbox swallows a click and says nothing. The blank
cell's dash reads 2.59:1.

## What Changes

- The bulk badge reads three states. Empty, mixed and full each look
  different, and mixed no longer reads as empty.
- Each badge names the blast radius its press carries, in its accessible name
  and in its title. An author reads how many cells a press touches before
  pressing.
- The badges join the grid's roving model. They stop taking 30 tab stops
  inside a grid the specification calls one.
- Each badge's accessible name carries its column or its row. Thirty controls
  stop sharing three names.
- The field matrix states an empty result in words, rather than drawing a
  table with no rows.
- The Hide-inert toggle paints its pressed state, picked in code from the
  attribute it already carries.
- A gated cell says why the studio gates it.
- Every mark in the grid meets the contrast floor, the blank cell's dash
  included.
- Targets meet WCAG 2.5.8 through the spacing exception, so the grid keeps
  the density an operator scans.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: six added requirements. Three cover the badge, for its own
  three states, its blast radius and its name. Three cover the empty result,
  the toggle's pressed state, and the reason a gated cell gives.
- `spa-accessibility`: two added requirements cover a control inside a grid
  cell, and the target-size floor a dense grid meets through spacing.

The bulk badge's write behavior stays as it is. A press on a mixed column
still turns the flag on across that column. The existing requirement already
states that. Only the badge's appearance and its name change, so that
requirement stands as written.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx` and
  `FieldMatrixPanel.tsx` carry every code change bar one.
- `packages/web/src/areas/studio/panels/fieldMatrixLogic.ts` gains a
  three-state reading beside the boolean one. The boolean stays: the write
  path reads it.
- `packages/web/src/i18n/catalogs/studio.ts` gains the new strings.
- New tests under `packages/web/test`.
- No engine, HTTP or definition-contract change.
- `docs/browser-checks.md` gains the pass a harness cannot make.
