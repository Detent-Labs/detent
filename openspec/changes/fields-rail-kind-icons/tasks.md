## 1. Lookups

- [x] 1.1 Add `fieldKindIcon(field)` to `draft/field-type-labels.ts`. It shares one branch helper with `fieldKindWord`. It follows design.md's table. Verify with `bun run typecheck`.
- [x] 1.2 Extend `studio-fieldTypeLabels.test.ts`. Assert sixteen distinct icons for the sixteen kinds. Assert `Puzzle` for a plugin envelope. Assert `Braces` for a triple no kind names. Verify in the full suite.
- [x] 1.3 Move `moveControlId` into `fieldCatalogLogic.ts`, and give its id the prefix `studio-field-move-`. Add `moveTargetsFor(fields, fieldId)` there, as design.md describes. Verify with `bun run typecheck`.
- [x] 1.4 Extend `studio-fieldCatalogLogic.test.ts` for `moveTargetsFor`. Assert the top level first. Assert the field and its descendants absent. Assert a parent that is no group kept. Verify in the full suite.

## 2. Rail row

- [x] 2.1 Remove the move `select`, its four props and the `railMove` style from `PanelsRailFieldRow`. Drop the per-row target build in `FieldsTab`. Keep the drag. Verify with `bun run typecheck`.
- [x] 2.2 Lead the label with the kind icon. Its wrapper carries `aria-hidden` and the kind name as `title`. The kind name stays in the button as hidden text. Verify with task 2.5.
- [x] 2.3 Remove the `railType` style and its mention in the `railName` comment. Set `alignItems` on `railFieldInRow` to `center`. Verify with `bun run typecheck`.
- [x] 2.4 Set the rail column in the `layout` style to `20rem`, up from `16rem`. Verify both tabs in task 4.2.
- [x] 2.5 Update `studio-panelsRailFieldRow.test.tsx`. Assert no `select` renders. Assert the kind name as text inside the button. Assert the wrapper's `aria-hidden` and `title`. Verify in the full suite.

## 3. Editor move control

- [x] 3.1 Add the move control under the key in `FieldEditor` and in `SubFieldRow`. Render it like the key, as a `fieldRowLabel` label around the select. Read its options from `moveTargetsFor` and its id from `moveControlId`. Verify with `bun run typecheck`.
- [x] 3.2 Pass `moveField` from `FieldsTab` through `FieldCatalogPanel` as `onMoveField`. Both editors and nested child rows receive it. Verify with task 4.3.

## 4. Rules and docs

- [x] 4.1 Add the icon sentence from design.md to the Icons section of `design-language.md`. Drop the kind word and `railType` from its entity rail paragraph. Verify with task 5.4.
- [x] 4.2 Add one walk to `docs/browser-checks.md`, on the IT Offboarding draft. It covers the icons, the tooltip and the missing rail picker. It covers both rail widths and both schemes. Verify in task 5.5.
- [x] 4.3 Rewrite the move gesture walk in `docs/browser-checks.md`. The keyboard moves a field through the editor's control. The walk counts the Tab stops from the selected entry to it. Focus returns there, and the live region speaks. Verify in task 5.5.
- [x] 4.4 Update the German walk and the walk that moves `order` into `line_item`. Neither names the rail picker any more. Verify both in task 5.5.
- [x] 4.5 Name the new icon sentence in the closing report. The main checkout's design language file under `tmp/` needs it too. This worktree lacks that file.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer. Both finish without an error.
- [x] 5.2 Run the full `bun test` with `DATABASE_URL` set. Pipe its log through `scripts/gates/silent-green.sh`. No test fails, and the skip floor holds.
- [x] 5.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`. It reports no finding.
- [x] 5.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. No Markdown file gains a finding.
- [x] 5.5 Run the walks from tasks 4.2 to 4.4 on the production build. Run `/impeccable critique` and `/impeccable audit` on the Fields tab. Run the impeccable detector once over the changed files.
