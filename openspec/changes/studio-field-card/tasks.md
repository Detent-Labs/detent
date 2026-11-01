# Tasks

## 1. The view move, the source words and the contract words (studio-process-tabs, studio-app, studio-guided-vocabulary)

- [ ] 1.1 In `routing.ts`, make `FieldsView` read `catalog`, `matrix`, `sources` and `SettingsView` read `process`, `contract`, `access`, per D6. Point both `dataSources` map entries at `{ tab: "fields", view: "sources" }`.
- [ ] 1.2 In `draft/process-tabs.ts`, return `{ tab: "fields", view: "sources" }` for a `dataSource` row. Update `studio-processTabs.test.ts` and `studio-routing.test.ts`, which pin the old place.
- [ ] 1.3 Add the D12 keys `fieldsViews.sources`, `dataSources.nameCaption`, `dataSources.kindLegend`, `dataSourceKind.db.list` and `dataSourceKind.instance.query` to `catalogs/studio.ts`. Remove `settings.sources`, `dataSources.keyCaption`, `dataSources.pluginLegend` and `contract.heading`. Give the seven `contract.*` keys and `panelsScreen.unnamedDataSource` their D12 texts.
- [ ] 1.4 In `panels/FieldsTabViews.tsx`, add the third view body mounting `DataSourcesTab`, per D6. In `panels/SettingsTab.tsx`, drop the sources body and entry. Update `studio-subRow.test.tsx`. Add `studio-fieldsTabViews.test.tsx` and `studio-settingsTab.test.tsx` per D14.
- [ ] 1.5 Add `dataSourceKindLabel(type)` to `draft/guided-labels.ts`, per D7. In `panels/DataSourcesPanel.tsx`, head the editor with the name, caption the input "Name" in the body face, and pass the legend and `typeLabel`.
- [ ] 1.6 Make `EntityTabs.tsx`'s source rail rows and `RemoveDataSourceDialog` read the name or "(unnamed source)", the dialog in the body face per D7. Update `studio-removeDataSourceDialog.test.tsx`. Add `packages/web/test/studio-dataSourcesPanel.test.tsx` asserting the heading, the caption, the kind names and the fallback.
- [ ] 1.7 Rewrite `panels/ContractPanel.tsx` per D8: no heading, the sentence checkbox, three legends, labels in the field lists, mono endings. Add `packages/web/test/studio-contractPanel.test.tsx` asserting the words and that no key prints.
- [ ] 1.8 Run the full gated suite in the foreground. Read its verdict off the named tests, and keep `studio-panels-literal-text.test.ts` and `studio-vocabulary.test.ts` green.

## 2. The pure modules (studio-app, studio-field-validation-form, studio-column-mapping-form)

- [ ] 2.1 Add `draft/choiceValue.ts` with `nextChoiceValue` and the default rewrite per D2. Add `collectOptionValues` and `usePublishedOptionValues` to `draft/publishedFields.tsx`. Add `packages/web/test/studio-choiceValue.test.ts` covering derivation, dedupe, a hand-set value, the per-choice lock and the default rewrite.
- [ ] 2.2 Add `panels/askedOnRows.ts` with `askedOnRows` per D3. Add `packages/web/test/studio-askedOnRows.test.ts` covering the three marks, the sentence, a conditional requiredness with no mark, an unnamed step and draft order.
- [ ] 2.3 In `panels/readByRows.ts`, add `target` per D4 to every row. Extend `studio-readByRows.test.ts` with one case per place kind and the fallbacks' absent target.
- [ ] 2.4 In `panels/shared/ruleLogic.ts`, number the other fields in `buildRuleOperands` through `optionText.ts::numberRepeats` and add `ruleSentence` per D10. Test both in the rule logic test.
- [ ] 2.5 In `draft/field-usage.ts`, drop the `step.key` fallback. In `panels/fieldMatrixLogic.ts`, replace `type` with `kind` and `unmatched` per D11. Update `studio-fieldMatrix.test.ts`.
- [ ] 2.6 Add the `fieldCard.*`, `fieldMatrix.markCondition`, `fieldMatrix.rowKindLabel`, `defaultValue.computedNote`, `defaultValue.developerView` and `formsTab.legendGroup` keys per D12. Reword the keys D12 lists as changed. Remove no key yet: each later task removes the keys its file last reads. Keep `studio-vocabulary.test.ts` in step.
- [ ] 2.7 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 3. The card, the default value and the rule builder (studio-app, studio-condition-builder, studio-field-validation-form)

- [ ] 3.1 In `panels/shared/DefaultValueEditor.tsx`, replace the toggle with the Developer view per D9. Print choice names in the picker's option and checkbox branches. Remove `defaultValue.editAsCel` and `defaultValue.useValue`. Add `packages/web/test/studio-defaultValueEditor.test.tsx` asserting the closed disclosure, the computed note, the clear, and no value as text.
- [ ] 3.2 In `panels/shared/RuleInput.tsx`, draw the builder, the sentence and the closed Developer view per D10. Remove the readout and the keys `condition.celReadout` and `condition.celEmpty`. Add `studio-ruleInput.test.tsx` asserting the sentence and no "Writes".
- [ ] 3.3 In `panels/FieldCatalogPanel.tsx`, draw the card's name line, Name block, Kind and Choices sections per D1 and D2. Include the choice Developer view and the bound-source sentence. Remove the `fieldCatalog.*` keys D12 retires.
- [ ] 3.4 Draw Asked on per D3, with the rows, the requiredness checkbox and the condition input. Draw Read by with its Open commands per D4. Draw More per D5 and map `fieldCheckZone` onto the sections.
- [ ] 3.5 In `panels/EntityTabs.tsx`, add `onOpenPlace` and `openMoreFor` per D4, and the stacked layout values per D13. In `screens/EditScreen.tsx`, wire `onOpenPlace` to `openTabFromRow` and `openFormEditor`.
- [ ] 3.6 Rewrite `studio-fieldCatalogPanel.test.tsx` per D14 and extend `studio-guidedSurfaceStyle.test.ts` with the stacked layout's values. Keep `studio-panels-literal-text.test.ts` green.
- [ ] 3.7 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 4. The matrix words and the Forms legend (studio-app, studio-forms-overview, studio-guided-vocabulary)

- [ ] 4.1 In `panels/FieldMatrixGrid.tsx`, print labels in both headers, the kind word, word badges at one shared width and "Condition", per D11. Remove `FLAG_LETTER`, the key spans, `fieldMatrix.rowTypeLabel` and `formEditor.markCel`.
- [ ] 4.2 In `panels/FieldMatrixPanel.tsx`, keep the seven legend entries over the D12 texts. Update `studio-fieldMatrixPanel-legend.test.tsx`, `studio-fieldMatrixGrid-bulkBadges.test.tsx`, `studio-fieldMatrixBadge.test.ts` and the other matrix tests per D14.
- [ ] 4.3 In `panels/formCardRows.ts`, make the group legend entry read `formsTab.legendGroup` and remove `formsTab.legendSection`. Update `studio-formCardRows.test.ts`, `studio-formsTab.test.tsx` and `studio-vocabulary.test.ts`.
- [ ] 4.4 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 5. Docs, glossary and roadmap

- [ ] 5.1 Apply D15's glossary edits to `.claude/rules/ui-glossary.md`. Run `antislop check` on it; add no finding.
- [ ] 5.2 In `DESIGN.md`, rewrite the Field Matrix entry and add "The Field Card" entry per D15. Run `impeccable doctor` only if the detector reports drift.
- [ ] 5.3 In `docs/browser-checks.md`, add the field card entry per D15 and rewrite the stale passages in place.
- [ ] 5.4 In `docs/decisions.md` and `docs/decisions-archive.md`, move the nine resolved entries and rewrite the Settings-bodies entry per D15. Re-point SELECTS-9 and SELECTS-10, and add "Open from studio-field-card".
- [ ] 5.5 In `docs/authoring-guide.md`, add the two sentences on choice values per D15. In `ROADMAP.md` stage 64, append "Shipped 2026-11-01." to item 11 and set the status line to "CHANGES 1 TO 11 AND 14 DONE, REST NOT STARTED".
- [ ] 5.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host over the touched Markdown. Read its exit code.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 6.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 6.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, with `OPENSPEC_TELEMETRY=0`.
- [ ] 6.4 Read the pass, skip and fail counts off that run. Name any failing test. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [ ] 6.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 6.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 6.7 On the production bundle, open a `purchase_requisition` draft's Fields tab at 1440px. The sub-row reads Catalog, Where fields appear, Where values come from. A field's card reads Name, Kind, Choices, Asked on, Read by, More, with More closed.
- [ ] 6.8 Add a choice named "In review" to a choice field. Its Developer view reads `in_review`. Rename it; the value follows. Open a published field's Choices Developer view: the sentence says the name no longer sets its values.
- [ ] 6.9 On a field two steps ask for, the Asked on rows print Required, Read-only or Not asked as words. They print their condition sentences too. "Open the form" lands on the form editor. The requiredness checkbox writes both views.
- [ ] 6.10 Press "Open" on a Read by way-out row: the Steps tab opens on that step with the way out marked. Press "Open" on a field-rule row: the rail selects that field and More stands open.
- [ ] 6.11 Open Where values come from on Fields. The editor heads with the source's name, the caption reads Name, and the kind picker prints names. Open Settings: its sub-row holds three entries. Load `/edit/settings/sources`: the Process view opens.
- [ ] 6.12 Open Where fields appear. Headers print labels and kind words, and no key. Badges read Asked, Required, Read-only. A CEL flag reads Condition, and the legend prints no "CEL". Open the Forms tab: the legend reads Group.
- [ ] 6.13 At 1024px, the card's container reads `overflow-y: visible` and the view body scrolls the whole card. At 420px nothing scrolls sideways.
- [ ] 6.14 Run `/impeccable critique` and `/impeccable audit` on `/studio/processes/<id>/edit/fields`. Run `impeccable detect --json` on the changed files, since the app's CSP blocks the overlay.
- [ ] 6.15 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect every flow to pass.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Push, open the PR, and merge on green CI.
