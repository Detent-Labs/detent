## 1. Pure logic and its tests

- [x] 1.1 Add `rootId` to `RailFieldRow` in `draft/panel-rail.ts`
- [x] 1.2 Set `rootId` in `flattenRailFields`, top-level rows to their own id
- [x] 1.3 Add `issueCountForEntityId(issues, entityId)` beside its siblings
- [x] 1.4 Update the five existing `flattenRailFields` expectations in
      `packages/web/test/studio-edit-panel-rail.test.ts` to include `rootId`
- [x] 1.5 Cover `rootId` in `studio-edit-panel-rail.test.ts`, nested twice included
- [x] 1.6 Cover `issueCountForEntityId` there, zero and two issues
- [x] 1.7 Check that `fieldMatrixLogic` still reads `flattenRailFields` unchanged

## 2. The rail

- [x] 2.1 Hold `selectedFieldId` and `selectedDataSourceId` in `PanelsScreen`
- [x] 2.2 Resolve each against the draft on render, falling back to the first
- [x] 2.3 Render a sub-list only under the open view
- [x] 2.4 List the data sources under the Data sources entry
- [x] 2.5 Select `rootId` on a field row, and keep the `scrollToField` call
- [x] 2.6 Mark the selected row, with `aria-current` on the entry
- [x] 2.7 Draw a per-row issue mark from `issueCountForEntityId`

## 3. The panels

- [x] 3.1 Give `FieldCatalogPanel` a `selectedId` prop, rendering that field
- [x] 3.2 Give `DataSourcesPanel` a `selectedId` prop, rendering that source
- [x] 3.3 Move both Add controls to screen-owned handlers returning the new id
- [x] 3.4 Select the added entity, so an author types into it at once
- [x] 3.5 Move both Remove controls up, selecting the neighbour after each
- [x] 3.6 Keep the empty state when a draft holds no entity

## 4. Strings

- [x] 4.1 Catalogue the literal labels in `FieldCatalogPanel` under `fieldCatalog.*`
      — none qualify. `catalogs/studio.ts`'s own header excludes "key",
      "label", "type" and the rest as raw contract vocabulary shown as a bare
      field label; all five candidates here are exact `FieldDef` property
      names, so this deviates from design.md's CSS-section note and leaves
      them literal. See `docs/roadmap-history.md` stage 42 for the reasoning.
- [x] 4.2 Catalogue the literal labels in `DataSourcesPanel` under `dataSources.*`
      — `dataSources.dataListLabel` ("data list") only; its `key` label stays
      literal for the same reason as 4.1.
- [x] 4.3 Add the rail's issue-mark label under `panelsScreen.*`

## 5. The CSS

- [x] 5.1 Append `.field-catalog-panel` and `.field-row` rules to `app.css`
- [x] 5.2 Append `.option-row` and `.data-source-row` rules
- [x] 5.3 Set a label above its control, at `--space-1`
- [x] 5.4 Print a `key` and a `type` in mono
- [x] 5.5 Divide rail sub-list rows with a hairline: free, via the existing
      `.studio-panels-rail-field` class the new data-source rows reuse
- [x] 5.6 Rule a view's heading, and take no corner radius

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`
- [x] 6.2 Run the full `bun test` with `DATABASE_URL` set
- [x] 6.3 Run the antislop linter over every Markdown file touched
- [x] 6.4 Run `git diff --check` and `git ls-files --eol`
- [x] 6.5 Check the selection, both Add controls (which entity gets
      selected after Add), and both Remove-selects-neighbour behaviours,
      in the Fields and the Data sources views, in a real browser
- [x] 6.6 Check a group child scroll, a per-row issue mark, and that a
      reload selects the first entity, in the Fields and the Data
      sources views, in a real browser
- [x] 6.7 Record the browser steps in `docs/browser-checks.md`

## 7. The record

- [x] 7.1 Mark stage 42 DONE in `ROADMAP.md`, with its one table row
- [x] 7.2 Write the stage's entry in `docs/roadmap-history.md`
- [x] 7.3 Drop the settled row from `docs/decisions.md`
- [x] 7.4 Update the panels description in `docs/current-state.md`
