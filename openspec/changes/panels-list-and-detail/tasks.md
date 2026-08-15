## 1. Pure logic and its tests

- [ ] 1.1 Add `rootId` to `RailFieldRow` in `draft/panel-rail.ts`
- [ ] 1.2 Set `rootId` in `flattenRailFields`, top-level rows to their own id
- [ ] 1.3 Add `issueCountForEntityId(issues, entityId)` beside its siblings
- [ ] 1.4 Cover `rootId` in `studio-edit-panel-rail.test.ts`, nested twice included
- [ ] 1.5 Cover `issueCountForEntityId` there, zero and two issues
- [ ] 1.6 Check that `fieldMatrixLogic` still reads `flattenRailFields` unchanged

## 2. The rail

- [ ] 2.1 Hold `selectedFieldId` and `selectedDataSourceId` in `PanelsScreen`
- [ ] 2.2 Resolve each against the draft on render, falling back to the first
- [ ] 2.3 Render a sub-list only under the open view
- [ ] 2.4 List the data sources under the Data sources entry
- [ ] 2.5 Select `rootId` on a field row, and keep the `scrollToField` call
- [ ] 2.6 Mark the selected row, with `aria-current` on the entry
- [ ] 2.7 Draw a per-row issue mark from `issueCountForEntityId`

## 3. The panels

- [ ] 3.1 Give `FieldCatalogPanel` a `selectedId` prop, rendering that field
- [ ] 3.2 Give `DataSourcesPanel` a `selectedId` prop, rendering that source
- [ ] 3.3 Move both Add controls to screen-owned handlers returning the new id
- [ ] 3.4 Select the added entity, so an author types into it at once
- [ ] 3.5 Move both Remove controls up, selecting the neighbour after each
- [ ] 3.6 Keep the empty state when a draft holds no entity

## 4. Strings

- [ ] 4.1 Catalogue the literal labels in `FieldCatalogPanel` under `fieldCatalog.*`
- [ ] 4.2 Catalogue the literal labels in `DataSourcesPanel` under `dataSources.*`
- [ ] 4.3 Add the rail's issue-mark label under `panelsScreen.*`
- [ ] 4.4 Add a DE entry for each new key, for `i18n-catalog-parity`

## 5. The CSS

- [ ] 5.1 Append `.field-catalog-panel` and `.field-row` rules to `app.css`
- [ ] 5.2 Append `.option-row` and `.data-source-row` rules
- [ ] 5.3 Set a label above its control, at `--space-1`
- [ ] 5.4 Print a `key` and a `type` in mono
- [ ] 5.5 Divide rail sub-list rows with a hairline
- [ ] 5.6 Rule a view's heading, and take no corner radius

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`, then `bun run build`
- [ ] 6.2 Run the full `bun test` with `DATABASE_URL` set
- [ ] 6.3 Run the antislop linter over every Markdown file touched
- [ ] 6.4 Run `git diff --check` and `git ls-files --eol`
- [ ] 6.5 Check the selection and both Add controls in a real browser
- [ ] 6.6 Check a group child scroll and a per-row issue mark there
- [ ] 6.7 Record the browser steps in `docs/browser-checks.md`

## 7. The record

- [ ] 7.1 Mark stage 42 DONE in `ROADMAP.md`, with its one table row
- [ ] 7.2 Write the stage's entry in `docs/roadmap-history.md`
- [ ] 7.3 Drop the settled row from `docs/decisions.md`
- [ ] 7.4 Update the panels description in `docs/current-state.md`
