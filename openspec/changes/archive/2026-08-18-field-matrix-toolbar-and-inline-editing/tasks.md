## 1. Pure logic (`fieldMatrixLogic.ts`)

- [x] 1.1 Add inert-column filtering: a `hideInert` toggle state and a
  pure filter over `STEPS`-derived columns that drops steps with no
  `view`.
- [x] 1.2 Add the count-line computation. It needs four numbers:
  - declared view entries
  - the field count
  - the count of steps the grid currently draws
  - the number of cells among those steps that carry no entry
- [x] 1.3 Add the bulk-toggle "all eligible cells agree" derivation, per
  column and per row, for `visible`, `required` and `readonly`. Eligible
  means live, non-CEL, not gated.
- [x] 1.4 Add the bulk-toggle apply function. It iterates a column's or
  row's eligible cells. It calls `setFlag` once per cell, flipping each
  to the opposite of the "all agree" state. Wrap the whole batch in one
  `mutate()` call, per `design.md` Decision 3. Do not call `mutate()`
  once per cell.
- [x] 1.5 Extract `checkViewFlags`'s inline `written`-set computation
  in `draft/view-flags.ts` into its own exported function,
  `writtenFieldIds(body): Set<string>`. Have `checkViewFlags` call it.
  Its own behavior and its two message strings stay unchanged.
- [x] 1.6 Add the flagged-cell predicate in `fieldMatrixLogic.ts`, per
  `design.md` Decision 5. Apply `checkViewFlags`'s exact three-part
  test, in order:
  - skip a group field
  - flag `required` while hidden
  - flag `required` together with `readonly` and absent from
    `writtenFieldIds`
- [x] 1.7 Write `bun:test` coverage for 1.1 through 1.6 in
  `fieldMatrixLogic`'s existing test file. Use small synthetic
  fixtures built per test, matching that file's existing convention.
  Do not couple these tests to `examples/purchase-requisition.json`.
  Cover both new negative cases for 1.6: a required-and-readonly cell
  already written elsewhere, and a group field's own cell.

## 2. i18n catalog strings

- [x] 2.1 Add the new English strings to
  `packages/web/src/i18n/catalogs/studio.ts`:
  - the toggle label
  - the count-line template
  - the five legend lines
  - the column's "no view, inert" note
  - the row header's type label
- [x] 2.2 Confirm no other catalog file needs these keys. `studio.ts`
  is English-only by design (`.claude/rules/design-language.md`), and
  `catalog.ts`'s `t(key)` takes no locale argument.

## 3. Split the grid from its panels-screen chrome

Per `design.md` Decision 6: `FieldMatrixPanel` mounts both from the
panels screen and from the canvas dock's Field matrix tab. Only the
panels screen gets the new toolbar, legend and bulk badges.

- [x] 3.1 Rename the current `FieldMatrixPanel` component to
  `FieldMatrixGrid`. It keeps the column and row header content, the
  cell rendering, and (after group 6) the new keyboard model. It gains
  no toolbar, legend or bulk badge.
- [x] 3.2 Add a new `FieldMatrixPanel` wrapper component, in the same
  directory. It renders `FieldMatrixGrid`, and adds the toolbar, the
  legend and the column/row bulk badges around it.
- [x] 3.3 Switch `dock/EditorDock.tsx`'s Field matrix tab to import
  `FieldMatrixGrid` directly, in place of the old `FieldMatrixPanel`
  import.
- [x] 3.4 Confirm `screens/PanelsScreen.tsx` still imports
  `FieldMatrixPanel`. That name now resolves to the new wrapper, with
  no other change needed at that call site.
- [x] 3.5 Change `.claude/rules/ui-glossary.md`'s "dock tab" and
  "field matrix" rows. Name both `FieldMatrixGrid` (the bare grid,
  both mounts) and `FieldMatrixPanel` (the panels-screen wrapper).

## 4. `FieldMatrixGrid`: headers

- [x] 4.1 Column header: show the step's `key` beside its resolved
  label.
- [x] 4.2 Column header: show the "no view, inert" note on a step with
  no `view`.
- [x] 4.3 Row header: show the field's `type` beside its `key`.

## 5. `FieldMatrixGrid`: cells

- [x] 5.1 Replace each live cell's three-letter summary with three
  `BooleanOrExpressionInput` controls, wired to `setFlag`, one per flag.
  Remove the now-unused `CellSummary` and `summaryLabel`
  (`FieldMatrixGrid`'s own file) and `liveCellSummary`/
  `LiveCellSummary` (`fieldMatrixLogic.ts`).
- [x] 5.2 Apply the existing gating rule: disable the `required` and
  `readonly` controls when the cell's own `visible` resolves to
  `false`.
- [x] 5.3 Add the flagged-cell marker, driven by 1.6.
- [x] 5.4 Remove the below-grid single-cell editor and its selection
  wiring.

## 6. `FieldMatrixGrid`: keyboard operability

Per `design.md` Decision 4 and the delta spec's "The field matrix
stays one tab stop; activating a cell reaches its controls"
requirement.

- [x] 6.1 Keep the existing roving-tabindex arrow-key navigation
  between cells, unchanged. Confirm it adds no tab stop by itself.
- [x] 6.2 Change the existing Enter/Space handler on a focused live
  cell. It no longer opens the below-grid editor (already removed in
  5.4). It activates the cell instead.
- [x] 6.3 On an activated cell, give its three controls `tabindex="0"`.
  Give every other cell's controls `tabindex="-1"`.
- [x] 6.4 On Escape, deactivate the cell and hand the one tab stop
  back to the grid. Do the same when focus leaves the activated cell
  by any other means.

## 7. `FieldMatrixPanel` (wrapper): toolbar and bulk badges

- [x] 7.1 Add the "Hide inert columns" toggle, wired to 1.1.
- [x] 7.2 Add the live count line, wired to 1.2.
- [x] 7.3 Add the static legend row.
- [x] 7.4 Add the `visible`/`required`/`readonly` bulk badges to each
  column header. Show them only where that column has at least one
  live cell. Wire them to 1.3 and 1.4.
- [x] 7.5 Add the same bulk badges to each row header, scoped to that
  field's row.

## 8. Styling (`app.css`)

- [x] 8.0 Run `/frontend-design` for visual direction before styling
  the new toolbar, legend and badges, per CLAUDE.md's Conventions.
- [x] 8.1 Add styles for the toolbar, legend, bulk badges and inline
  checkboxes, following `.claude/rules/design-language.md`.
- [x] 8.2 Resize the grid's column width and row height for the new
  cell content. Do this for both the panels screen and the dock.
- [x] 8.3 Remove the now-dead below-grid editor styles.

## 9. Verification

- [x] 9.1 Run `bun run typecheck` and confirm it passes.
- [x] 9.2 Run the full `bun test` suite with `DATABASE_URL` set. Do not
  substitute a single-file rerun. Read the reported pass and skip
  counts; a green exit code alone is not the signal.
- [x] 9.3 Run the antislop linter over every Markdown file this change
  touches.
- [x] 9.4 Run `git diff --check` for trailing whitespace and
  blank-at-eof in the pushed range.
- [x] 9.5 Open the panels screen's field matrix in a real browser.
  Check each of:
  - the toolbar's toggle and count line
  - the legend
  - both header kinds
  - the bulk badges
  - inline cell editing
  - the flagged-cell marker
  - that Tab stays one stop while no cell holds activation
  - that Enter or Space on a cell makes its three controls
    Tab-reachable, and that Escape hands the one stop back
- [x] 9.6 Open the canvas dock's Field matrix tab in a real browser.
  Confirm it shows no toolbar, no count line, no legend and no bulk
  badge. Confirm its cells still take writes inline. Confirm the dock
  still fits its bounded height.
- [x] 9.7 (Optional) Add a component test for `EditorDock`'s Field
  matrix tab. Assert no toolbar element shows. An accidental future
  import of the wrapper into the dock then fails the suite. It no
  longer waits on 9.6's manual check alone.
