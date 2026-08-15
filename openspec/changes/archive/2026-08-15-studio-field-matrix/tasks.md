## 1. Routing

- [x] 1.1 Add `"matrix"` to `PanelView` and `PANEL_VIEWS` in
  `packages/web/src/areas/studio/routing.ts`.
- [x] 1.2 Change the file's own "three process-wide views" doc comment to
  four.
- [x] 1.3 Change `routePath`'s "one of three literals" comment to four.
- [x] 1.4 Confirm `matchRoute`'s `isPanelView` guard and the
  `editPanelMatch` regex need no change. Both already derive from
  `PANEL_VIEWS`/the route param alone.

## 2. Rail counting helpers

- [x] 2.1 In `packages/web/src/areas/studio/draft/panel-rail.ts`, add
  `issueCountForSource(issues, source)`. Mirror
  `issueCountForEntityType`'s shape, but filter on `EditorIssue.source`.
- [x] 2.2 Add a `matrix` key to `panelEntityCounts`'s return type and
  computation: the total count of `view.fields[]` entries across every
  step in `draft.workflow?.steps`. Widen the function's own parameter
  type to include an optional `workflow?: { steps?: ... }` field. It
  carries no such field today.
- [x] 2.3 Confirm `EditRail.tsx`'s `entityCount` read
  (`panelEntityCounts(draft)`) needs no further change beyond the type
  gaining the `matrix` key.
- [x] 2.4 Narrow `PanelsScreen.tsx`'s `VIEW_ENTITY_TYPE` type to
  `Record<Exclude<PanelView, "matrix">, EntityType>`. No `EntityType`
  value names the matrix's own findings correctly. `"step"` is already
  every other per-step issue's entity type. That is the exact collision
  task 2.1 exists to avoid.

## 3. Field matrix data derivation

- [x] 3.1 Add `packages/web/src/areas/studio/panels/fieldMatrixLogic.ts`.
  No React import. Pure functions over a `Draft`, matching the sibling
  `columnMappingLogic.ts`/`dataListKeysLogic.ts` split.
- [x] 3.2 Export a row type. It carries a field's `id`, `key`, `depth`
  (0 or 1, capped the way `flattenRailFields` caps it), and whether it
  is a group field (`type === "group"`).
- [x] 3.3 Export a row-list function built on `flattenDraftFields`
  (`draft/fields.ts`). This is the same depth-first order the field
  catalog panel and `checkViewFlags` already use.
- [x] 3.4 Export a cell-state function: `"hatched"` when `step.view` is
  `undefined`, `"blank"` when the view's `fields` carries no entry whose
  `ref` matches the row's field id, `"live"` otherwise.
- [x] 3.5 Export a cell-entry lookup: the `DraftViewField` (and its array
  index, for the write path) a live cell's `ref` resolves to.
- [x] 3.6 Export a live-cell summary function reading `effectiveFlag` and
  `isExpression` (`draft/view-flags.ts`, `panels/shared/overrideMode.ts`)
  for each of the three flags. It carries no independent resolution
  logic.

## 4. The grid component

- [x] 4.1 Invoke `/frontend-design:frontend-design` for visual
  direction on the grid and the cell editor, per CLAUDE.md's rule for
  UI work in `packages/web`. Treat
  `tmp/field_matrix_ui_starter/Field Matrix.dc.html` as input material,
  not a spec: it carries the three departures design.md's Context
  section already rejects.
- [x] 4.2 Add `packages/web/src/areas/studio/panels/FieldMatrixPanel.tsx`.
- [x] 4.3 Render the header row. One `<th scope="col">` per step, in
  `workflow.steps` order, holds the step's label (or a fallback for an
  unlabeled step, matching `formEditor.unnamedField`'s pattern).
- [x] 4.4 Render one `<th scope="row">` per field row. Indent a
  depth-1 row one level. Give a group row a distinct style.
- [x] 4.5 Render each data cell in its computed state. Hatched draws a
  pattern and is non-interactive. Blank draws empty and is
  non-interactive. Live draws the flag summary from 3.6 and is
  selectable.
- [x] 4.6 Wrap the grid in a scrolling region carrying `tabindex="0"` and
  an accessible name (`aria-label` or `aria-labelledby`).
- [x] 4.7 Make the header row and the header column sticky within that
  scroll region.
- [x] 4.8 Give the header row and first column a fixed width. Take it
  from the design language's spacing scale, not from measured
  step-label text. German step labels run longer than English ones.

## 5. Roving tabindex and grid semantics

- [x] 5.1 Give the grid element `role="grid"`.
- [x] 5.2 Track one `(rowIndex, colIndex)` as the grid's current focus
  position in component state.
- [x] 5.3 Give every cell `tabindex={-1}`, except the current focus
  position, which gets `tabindex={0}`. The grid is one tab stop, and
  focus moves inside it on arrow keys, not on Tab.
- [x] 5.4 Handle `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`: move the
  focus position by one cell, clamped to the grid's bounds.
- [x] 5.5 Handle `Home`/`End`: move to the first/last cell in the current
  row. Handle `Ctrl+Home`/`Ctrl+End`: move to the grid's first/last cell.
- [x] 5.6 On a focus-position change, call `.focus()` on the new cell's
  DOM node.
- [x] 5.7 Activating a live cell (click, or `Enter`/`Space` while
  focused) opens the cell editor for it. Activating a hatched or blank
  cell does nothing observable, beyond moving focus.

## 6. The cell editor

- [x] 6.1 Track the selected `(stepIndex, fieldId)` pair in component
  state, distinct from the roving-tabindex focus position. The
  selection persists across a focus move. The grid's Escape key, or a
  different cell's activation, clears or replaces it.
- [x] 6.2 Render one editor region below the grid whenever the author
  selects a live cell. It holds three `BooleanOrExpressionInput`s, for
  `visible`, `required` and `readonly`. This is the same component
  `FormEditorScreen`'s strip uses. Pass each one `stepId={step.id}` for
  the selected cell's own step, matching the strip's own usage. The
  condition builder's `child.*` operands need it on a subprocess step.
- [x] 6.3 Wire each control's `onChange` through `setFlag`
  (`draft/view-flags.ts`), against the selected step's `view.fields[]`
  entry. Write through `mutate()`/`updateInDraftArray`, the way
  `FormEditorScreen.writeView`/`setViewFlag` already do.
- [x] 6.4 Disable `required` and `readonly` when `gatedKeys(entry)` names
  them (the selected cell's own `visible` is a literal `false`).
- [x] 6.5 Selecting a hatched or blank cell, or a click outside the grid
  and the editor, closes the editor.
- [x] 6.6 Confirm the editor's controls read `effectiveFlag` for their
  starting state, not `value === true`. That is the exact issue
  `studio-view-flags-module` fixed elsewhere. It must not reappear here.

## 7. Wiring into the panels screen and the canvas rail

- [x] 7.1 In `PanelsScreen.tsx`, add a `matrix` entry to `VIEW_LABEL`.
- [x] 7.2 Mount `<div hidden={openView !== "matrix"}><FieldMatrixPanel
  /></div>` alongside the other three. It stays mounted while hidden.
  Task 6.1's selected-cell state must survive a view switch.
- [x] 7.3 Compute the matrix's rail issue count with
  `issueCountForSource(validation.issues, "view")` instead of
  `issueCountForEntityType`. `checkViewFlags` issues carry `entityType:
  "step"`, like every other per-step issue.
- [x] 7.4 In `EditRail.tsx`, add the `"matrix"` arm to `PROCESS_ROWS`'s
  label ternary. Or replace the ternary with a lookup record instead. A
  fourth arm is the point past which a ternary chain stops reading
  cleanly.
- [x] 7.5 Confirm `EditorArea`'s `panel !== undefined` branch and
  `ROUTE_ROLE.edit` need no change. Both already key off `PanelView`
  generically.

## 8. Glossary and cross-references

- [x] 8.1 Change `.claude/rules/ui-glossary.md`'s panels-screen row.
  Three views becomes four. The row names "field matrix" as the fourth.
- [x] 8.2 Add "field matrix" to the glossary's own one-term list. Do
  this only if the file's structure calls for a dedicated entry, rather
  than a parenthetical.

## 9. i18n

- [x] 9.1 Add `panelsScreen.linkFieldMatrix` ("Field matrix") to
  `packages/web/src/i18n/catalogs/studio.ts`. English only, matching the
  file's existing `studioCatalog = { en }`.
- [x] 9.2 Add `fieldMatrix.heading`, column/row group labels, the
  scroll-region accessible name, and a "no cell selected" placeholder for
  the editor region. Reuse `formEditor.visible`/`formEditor.required`/
  `formEditor.readonly` for the editor's three control labels, rather
  than duplicating them.

## 10. Tests

- [x] 10.1 Add `packages/web/test/studio-fieldMatrix.test.ts`.
- [x] 10.2 Assert the row list matches `flattenDraftFields`'s order. Use
  a catalog with a group field. Its own row must precede its children.
- [x] 10.3 Assert cell state. A step with no `view` reads hatched. A
  view-bearing step with no matching entry reads blank. A matching
  entry reads live.
- [x] 10.4 Assert the live-cell summary reflects `effectiveFlag`'s
  resolved values, including a CEL-holding flag reading as marked rather
  than resolved.
- [x] 10.5 In `studio-edit-panel-rail.test.ts`, assert
  `issueCountForSource` counts only issues with the given `source`. Use
  a draft mixing `view`-source and other-source issues on the same
  step. That file already tests `issueCountForEntityType`, its sibling
  function.
- [x] 10.6 In the same file, assert `panelEntityCounts(draft).matrix`
  equals the total `view.fields[]` length across every step.
- [x] 10.7 Assert the cell editor writes through `setFlag`'s existing
  delete-on-default and gate-on-`visible:false` behavior. These are the
  same assertions `studio-viewFlags.test.ts` already makes against the
  form editor's own writer, run here against the matrix's writer.

## 11. Documentation

- [x] 11.1 Change `ROADMAP.md` stage 41. Its headline moves from
  "SHARED MODULE DONE, GRID NOT STARTED" to done. Fold in what the grid
  shipped, and where it landed relative to the design pass's own
  decisions.
- [x] 11.2 Move stage 41 to `docs/roadmap-history.md`, now that it
  holds both halves. Do this if the table-row convention
  (`ROADMAP.md`'s own instructions for a finished stage) calls for it.
- [x] 11.3 Add the field matrix to `docs/current-state.md`, under the
  studio area's panels screen.
- [x] 11.4 Add the browser walk to `docs/browser-checks.md`. Cover
  keyboard traversal and the two-key gate clearing together. Also cover
  a CEL `visible` round-tripping through the JSON view, and German step
  labels at 1280px.
- [x] 11.5 Move item 17b to `ARCHIVED` in `tmp/open-work-priority.md`,
  and write its own section there, the way item 17a's section closed
  out.

## 12. Verification

- [x] 12.1 `bun run typecheck`, then `bun run build`. Both exit 0.
- [x] 12.2 Full `bun test` with `DATABASE_URL` set. Confirm the pass
  count, the skip count, and 0 failures. Never a single-file rerun.
  2667 pass, 1 skip (pre-existing, unrelated), 0 fail.
- [x] 12.3 The antislop linter over every Markdown file this change
  touched.
- [x] 12.4 `git diff --check`, and `git ls-files --eol` shows `w/lf` on
  every touched file.
- [x] 12.5 Browser: open `purchase-requisition`'s field matrix. Confirm
  22 rows (including `line_item`'s four children indented), 13 columns,
  and the three hatched columns (`approval_routing`, `issue_po`,
  `receipt_check`). Confirmed by DOM query: 54 live, 66 hatched (three
  predicted columns), 166 blank, summing to 286.
- [x] 12.6 Browser: select a live cell, change `required`, confirm the
  same entry updates in the JSON view. Confirmed against `cost_center`.
- [x] 12.7 Browser: turn a selected cell's `visible` off, confirm
  `required` and `readonly` disable and clear in the same write.
  Confirmed against `category`.
- [x] 12.8 Browser: author a CEL `visible` expression through the cell
  editor, confirm it round-trips through the JSON view unmangled.
  Confirmed byte-for-byte against `category`.
- [x] 12.9 Browser: keyboard-only traversal. Tab reaches the grid once.
  Arrow keys move within it. Enter/Space opens the editor on a live
  cell. Home/End and Ctrl+Home/Ctrl+End behave as specified. All
  confirmed via focus-position assertions.
- [x] 12.10 Browser: switch the studio's content locale, view a process
  with German step labels. Confirm no column clips or overflows at
  1280px, and that no column width derives from the English label.
  Confirmed with a real `de` label, added through the JSON view. The
  column wraps to five lines at a fixed width. Neither the cell nor the
  page overflows.
- [x] 12.11 Browser: confirm the panels-screen rail's Field matrix entry
  shows the live-cell total. Where `checkViewFlags` reports a finding,
  confirm the matching issue count. That count must not include
  unrelated per-step issues, a path's CEL issue say, on the same steps.
  Confirmed: authoring an unwritable-required entry on `manager_note`
  showed exactly 1, with every other checks-rail group reading clear.
