## 1. `gatedKeys` gains the written-aware mutual gate

- [x] 1.1 Update `gatedKeys` in `packages/web/src/areas/studio/draft/view-flags.ts` to `gatedKeys(entry: DraftViewField, written: Set<string>): FlagKey[]`.
- [x] 1.2 Keep the existing `visible: false` branch: return `["required", "readonly"]` unchanged.
- [x] 1.3 Add the new branch: when the entry's `ref` is absent from `written`, gate `readonly` if `required === true` and `readonly !== true`; gate `required` if `readonly === true` and `required !== true`.
- [x] 1.4 Add or update the function's doc comment to state the one-way, turn-on-only gate and why (design.md decision 1).

## 2. Field matrix grid and bulk-toggle logic

- [x] 2.1 Update `FieldMatrixGrid.tsx`'s cell checkbox `disabled` computation to call `gatedKeys(entry, written)`.
- [x] 2.2 In `fieldMatrixLogic.ts`, add a `written: Set<string>` parameter to `cellEligible`, threading it into its `gatedKeys` call.
- [x] 2.3 Thread `written` through `eligibleTargetEntries`, `bulkBadgeOn`, and `applyBulkToggle` in `fieldMatrixLogic.ts`.
- [x] 2.4 In `FieldMatrixGrid.tsx`, add a `written: Set<string>` prop to `BulkBadges`'s props type. This component is a sibling, not a closure over the grid's own `written` variable. Its `bulkBadgeOn` call needs the new prop. The extra argument alone will not reach it.
- [x] 2.5 Pass `written={written}` at both `<BulkBadges>` JSX call sites (the column header, the row header).
- [x] 2.6 Update `applyBulk`'s `applyBulkToggle` call to pass `written`. `applyBulk` lives inside `FieldMatrixGrid` itself, so this one reads `written` from the closure with no new prop.

## 3. Form editor override strip

- [x] 3.1 Destructure `draft` from `useDraft()` in `FormEditorScreen.tsx`, alongside the existing `mutate`/`contentLocale`.
- [x] 3.2 Add `const written = useMemo(() => writtenFieldIds(draft), [draft]);`, importing `writtenFieldIds` from `../draft/view-flags`. Add `useMemo` to the file's existing `react` import; it is not there today.
- [x] 3.3 Update both `OverrideField` `disabled` props (`required`, `readonly`) to call `gatedKeys(selectedRow, written)`.

## 4. Tests

- [x] 4.0 Update every existing call site of `gatedKeys`, `bulkBadgeOn`, and `applyBulkToggle` in `packages/web/test/studio-viewFlags.test.ts` and `packages/web/test/studio-fieldMatrix.test.ts` to pass the new `written` argument. An empty `Set<string>()` covers a scenario with no written field.
- [x] 4.1 Unit-test `gatedKeys`: the existing `visible: false` case stays covered; add cases for the new mutual gate, both directions.
- [x] 4.2 Add the "both already true, neither disables" case: `gatedKeys` returns neither key when `required` and `readonly` are both already `true`.
- [x] 4.3 Add a case where the field is in the `written` set: `gatedKeys` returns no new gate from the mutual rule.
- [x] 4.4 Unit-test `cellEligible`/`bulkBadgeOn`/`applyBulkToggle` for the new gate, mirroring the `visible: false` gate's existing test coverage.

## 5. Manual verification

- [x] 5.1 In a running studio draft, check `required` on a live field-matrix cell for a field nothing writes. Confirm `readonly` disables.
- [x] 5.2 Uncheck `required` and check `readonly` instead, on the same cell. Confirm `required` disables.
- [x] 5.3 Confirm the same pair of checks in the form editor's override strip, for the same field/step.
- [x] 5.4 Confirm a field an action output (or other written source) already writes keeps both controls enabled, in both surfaces.
- [x] 5.5 Author a `required: true`/`readonly: true` entry on an unwritten field through the JSON surface, then open the draft. Confirm both controls stay enabled.
- [x] 5.6 Uncheck either control from task 5.5's entry. Confirm the checkbox itself accepts the click and clears the key.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and confirm it passes.
- [x] 6.2 Run `bun run build` and confirm it passes.
- [x] 6.3 Run the full `bun test` suite with `DATABASE_URL` set and confirm it passes. Check the skip count, not just the pass count.
