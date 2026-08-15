## Why

<!-- antislop: allow synonym-rotation -->
<!-- Why: `.claude/rules/ui-glossary.md` fixes "edit screen" as the one name
     for this screen. The rule reads its "edit" as a synonym for the "change"
     this document uses in the OpenSpec sense. -->
The studio canvas edit screen leaves its lower band empty on a tall window.
The grid `.studio-canvas-layout` grows with the viewport. The canvas fills its
middle column to the bottom edge, and the two side columns do not. The 12rem
`EditRail` holds seven entries. The 22rem `ChecksRail` holds a heading and one
short line per issue group when a draft is clean.

Three questions send an author away from the canvas today. What would a
publish change? Which flags does each field carry on each step? What rules
govern the paths of the whole process?

The first question has the versions screen. The second has the field matrix.
The third has no surface at all. The canvas draws an automatic path's priority
as a badge, and its guard as a label on the line. It draws neither for a manual
path, and it shows nothing for the process as a whole. Reading the rules of
forty paths costs forty clicks.

A design pass on 2026-08-15 settled a dock for that band, and
`docs/decisions.md` carries it.

## What Changes

- A dock. It is a collapsible strip below the canvas grid, full width, and
  collapsed by default. It renders only in the canvas sub-state of the
  structure surface. The form editor and the panels screen each replace the
  canvas, so neither one shows it.
- Open, the dock takes a bounded height. The grid `.studio-canvas-layout`
  keeps its 36rem floor, so the canvas never shrinks below today's size.
- Three tabs ship, in this order.
- **Changes** repeats what `VersionsScreen.diffAgainstBase()` does. An author
  reads what a publish would change, without leaving the canvas. One pure
  export of `screens/versionDiffLogic.ts` carries it, `diffJson`. The sibling
  `canDiff` guards the versions screen's two-version selection and does not
  reach this tab. The guard here is `baseVersion !== null`.
- **Field matrix** mounts `panels/FieldMatrixPanel.tsx`. That view writes its
  flags through `draft/view-flags.ts`. The panels-screen mount uses the same
  module, and its `/edit/panels/matrix` route stays.
- **Paths** is the one new view. It gives one row per path across the whole
  process. The five columns are source step, trigger, priority, guard and
  target. The row-building function is pure over `draft.workflow.steps`, and
  it carries the test.
- The dock persists nothing. The open flag and the active tab live in
  `EditorArea` component state. They survive a selection change and reset on a
  reload.
- The dock claims no key in `saveState.layout`. That blob is per-draft. One
  author's open dock would therefore open for every author of the draft.
- The file `.claude/rules/ui-glossary.md` registers **dock** as the one word
  for this part, beside *edit rail* and *checks rail*.

Neither shipping tab earns a filter. A 200-step process gives the Paths tab
400 rows and the field matrix 200 columns. Both tabs scroll their own
overflow. A filter is the first thing that scale demands, and four steps
demand none.

## Capabilities

### New Capabilities

None. The dock is a region of a screen that already ships. It adds no route,
no persisted key and no schema field. Two of its three tabs mount views that
already ship. The third reads the draft the canvas already holds.

### Modified Capabilities

- `studio-canvas`: the canvas edit screen gains a fourth region, below its
  three columns. The spec's layout requirement names three columns today. The
  dock's collapse, its tab set, its bounded height and the canvas floor all
  become requirements of that screen. The Paths tab's row derivation carries
  its own pure-module rule inside the new requirement. The canvas's own
  eleven-computation requirement stays as it is. That derivation belongs to a
  dock view, not to canvas interaction.

## Impact

Affected files, inside `packages/web`:

- `src/areas/studio/screens/EditScreen.tsx`. `EditorArea` gains the open flag
  and the active tab. It renders the dock below the canvas grid.
- `src/areas/studio/dock/` (new). The strip with its collapse and its tab bar,
  the Paths table, and the pure row builder behind that table.
- `src/areas/studio/app.css`. Rules for the strip, the tab bar, the tab bodies
  and their scroll regions.
- `src/i18n/catalogs/studio.ts`. Keys for the dock's toggle, its three tab
  labels, the Paths table's five column headers and its empty state.

Tests, inside `packages/web`:

- `test/studio-dock-path-rows.test.ts` (new). It covers the pure row builder,
  beside the area's other pure-logic suites.

Documents:

- `.claude/rules/ui-glossary.md`, `docs/current-state.md`,
  `docs/browser-checks.md`, `docs/decisions.md` and
  `tmp/open-work-priority.md`.

`ROADMAP.md` takes no edit. The dock carries no stage of its own, the way
`studio-canvas-fills-vertically` carried none. So `docs/roadmap-history.md`
takes no entry either.

A later stage names the dock as work that lands before it. That sentence stays
true once this ships, and it needs no edit.

No schema change, no engine change, no API change and no `definitionHash`
movement. The dock reads the draft. It writes nothing the panels screen does
not write already.
