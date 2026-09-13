## 1. Logic helpers

- [x] 1.1 Add `neighbourAfterRemove(fields, fieldId)` to `fieldCatalogLogic.ts`. It follows the Remove rule in design.md. Add `fieldLabelInputId(fieldId)` and `railEntryId(fieldId)` beside `moveControlId`. Verify with `bun run typecheck`.
- [x] 1.2 Add `appendToGroup(fields, groupId, field)` and `removeFieldIn(fields, fieldId)` beside `moveFieldToGroup`. Each returns a new top-level array, as `moveFieldToGroup` does. Verify with `bun run typecheck`.
- [x] 1.3 Extend `studio-fieldCatalogLogic.test.ts` for `neighbourAfterRemove`. Assert the next sibling, the previous sibling, the parent group and both top-level fallbacks. Assert `appendToGroup` on a nested group and `removeFieldIn` at depth two. Pin both id helpers. Verify in the full suite.
- [x] 1.4 Make `resolveLoc` in `draft/issues.ts` follow the whole `fields[i].fields[j]` chain. A nested field's check then names that field. Add the nested cases to `studio-issues.test.ts`. Add a `runValidation` case to `studio-fieldCheckZone.test.ts`. Verify in the full suite.

## 2. Selection and writes in the tab

- [x] 2.1 In `FieldsTab`, store the chosen `row.id` as the selection. Mark only the entry whose id matches. Resolve the selection against every field id, with the first rail entry as the fallback. Verify with `bun run typecheck`.
- [x] 2.2 Remove the `focusFieldId` state from `FieldsTab`, with every call that sets it. Remove the prop from `FieldCatalogPanel` and `FieldEditor`, with the scroll effect that reads it. Remove both `field-row-<id>` anchors. Drop `focusFieldId={undefined}` from `studio-fieldCatalogPanel.test.tsx`. Verify with `bun run typecheck`.
- [x] 2.3 Reset the editor pane's scroll to its top whenever the selection changes. Declare that effect before the refocus effect. Verify in task 5.5.
- [x] 2.4 Give `addField` an optional group id. A given group id appends the new field through `appendToGroup`. Both paths select the new field. Type the panel's `onAdd` prop as `(groupId?: string) => void`. Wrap each add button's handler, as in `onClick={() => onAdd()}`. Verify with `bun run typecheck`.
- [x] 2.5 After an add into a group, focus the element `fieldLabelInputId` names. Scroll the element `railEntryId` names with `block: "nearest"` and no smooth option. Use the existing refocus effect. Verify in task 5.5.
- [x] 2.6 Make `removeField` take a field id. It removes that field through `removeFieldIn`, at any depth. It selects the id `neighbourAfterRemove` returns for the draft before the write. Type the panel's `onRemove` prop as `(fieldId: string) => void`. Pass `field.id` where the panel calls it. Verify with `bun run typecheck`.
- [x] 2.7 Make `moveField` keep `fieldId` selected. Keep its refocus on `moveControlId(fieldId)`. Rewrite the comments that name its top-level ancestor. Verify in task 5.5.
- [x] 2.8 Give `PanelsRailFieldRow` an optional `id` on its button. Pass `railEntryId` for each field entry. Assert in `studio-panelsRailFieldRow.test.tsx` that the id lands on the button. Verify in the full suite.
- [x] 2.9 Remove `rootId` from `RailFieldRow`, from its doc comments and from `flattenRailFields` in `draft/panel-rail.ts`. Drop it from the expected rows in `studio-edit-panel-rail.test.ts`. Rename the test whose title names `rootId`. Verify with `bun run typecheck`.

## 3. Editor

- [x] 3.1 Make `FieldCatalogPanel` find the selected field at any depth through `flattenDraftFields`. Write through the same lookup. Key `FieldEditor` on `field.id`. Verify with `bun run typecheck`.
- [x] 3.2 Replace the child fieldset in `FieldEditor` with the zone "Fields inside this group". Render it for `type: "group"` alone, directly after "Validation", under `fieldCatalog.groupChildrenHeading`. Its one secondary button calls a new `onAdd` prop with `field.id`. The panel passes its own `onAdd` to that prop. Remove `SubFieldRow`, the child helpers in `FieldEditor` and every import left unread. Verify with `bun run typecheck`.
- [x] 3.3 Give `LocalizedTextInput` an optional `id` on its input. Pass `fieldLabelInputId(field.id)` from the editor's label input. Verify with `bun run typecheck`.
- [x] 3.4 Set `fieldCatalog.addSubField` to "+ Add field to this group". Remove `fieldCatalog.subFieldsLegend` and `fieldCatalog.optionsLegend`. Verify with `bun run typecheck`.
- [x] 3.5 Rewrite every comment that names `SubFieldRow`, two field editors or a top-level selection. Those comments sit in `FieldCatalogPanel.tsx`, `EntityTabs.tsx`, `fieldCatalogLogic.ts`, `field-usage.ts`, `FieldValidationEditor.tsx` and `mintField.ts`. The `field-usage.ts` doc then counts six remaining prompts. Verify that `git grep -n SubFieldRow -- packages/web/src` prints nothing.
- [x] 3.6 Replace the `FieldCatalogPanel` describe block in `studio-fieldCatalogPanel.test.tsx`. Keep the `MoveFieldControl` block as it stands. Assert that a selected nested `string` field renders its move control and the Technical checkbox. Assert that it also renders the Default value zone, the preview and the "Used in" heading. Assert that its label input carries `fieldLabelInputId(field.id)`. Verify in the full suite.
- [x] 3.7 Assert in the same block that a selected group renders the zone "Fields inside this group". Assert that the group's editor renders no move control for its child. Assert that a selected top-level `string` field renders no such zone. Verify in the full suite.
- [x] 3.8 Set `sitesChecked` in `boundaries.test.ts` to 7. Rewrite the comment above it to name the sites that remain. Verify that `git grep -n SubFieldRow -- packages` prints nothing. Verify in the full suite.

## 4. Docs

- [x] 4.1 Rewrite the `discrepancy_note` passage in `docs/browser-checks.md`. Selecting the child opens its own editor, and no `SubFieldRow` appears. Verify in task 5.5.
- [x] 4.2 Rewrite the "Pick `Line Item`" passage of the same walk. Its pass adds that the rail marks `po_status` alone. The editor still shows the two halves of `po_status`. Verify in task 5.5.
- [x] 4.3 Rewrite the nested-child passage of the walk "Panels screen: Fields and Data sources as list and detail". Clicking `item_description` marks that entry alone. It opens the field's own editor at its top. Verify in task 5.5.
- [ ] 4.4 Add a walk to `docs/browser-checks.md` on the IT Offboarding draft. It covers selection, the add zone in "Processing (Fabrikam)", focus and the rail scroll. It checks that an entry already in view moves no rail, and that no scroll animates. It checks that a newly chosen field's editor opens at its top. Verify in task 5.5.
- [ ] 4.5 Extend that walk with the three Remove cases and a nested field's check on its own rail entry. Move "Permissions" into "Hardware" through its move control. Select the field inside it, which draws at the rail's cap. Select `immediate_lock_written_confirmation` for the longest label. Repeat selection and the add zone below 64rem. Verify in task 5.5.
- [x] 4.6 Rewrite the `rootId` passage in `docs/current-state.md` for a selection that names the chosen field. Rewrite the Add and Remove paragraph below it too. The Fields tab passes the removed field's id, and the Data sources tab keeps the index. Verify in task 5.4.
- [x] 4.7 In the `confirm()` entry of `docs/decisions.md`, count six remaining prompts, two of them in `FieldCatalogPanel.tsx`. Its closing count becomes "The other five". Point the `_2` label finding at `FieldEditor::updateLabel` alone. Verify in task 5.4.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer. Both exit with status 0.
- [ ] 5.2 Run the full `bun test` with `DATABASE_URL` set. Pipe its log through `scripts/gates/silent-green.sh`. No test fails, and the skip floor holds.
- [ ] 5.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`. It reports no finding.
- [ ] 5.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. No Markdown file gains a finding.
- [ ] 5.5 Run the walks from tasks 4.1 to 4.5 on the production build. Run `/impeccable critique` and `/impeccable audit` on the Fields tab. Run the impeccable detector once over the changed files.
