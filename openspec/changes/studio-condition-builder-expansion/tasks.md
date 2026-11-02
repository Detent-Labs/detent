# Tasks

## 1. The model, the reader and the writer

- [x] 1.1 In `conditionLogic.ts`, replace the flat `Row` with design.md D1's model: `RowValue`, `Leaf`, `GroupRow`, `Row` and `CmpOp` with `!in`. Make `summarizeValue` take the literal and the operand. Adapt the one call in `ruleLogic.ts`, and make its `RuleValue` an alias of `RowValue`. Adapt `ConditionBuilder.tsx` to the new type with no new UI, behind a `ponytail:` comment. Verify: `bun run typecheck` exits 0. `studio-ruleLogic.test.ts` reads a date rule as "Due is at most Dec 31, 2026."
- [x] 1.2 Extend `fromCel` per design.md D2. Verify: new cases in `packages/web/test/studio-conditionLogic.test.ts` cover every read scenario of the two ADDED requirements on groups and on negation. Cover every read scenario of the MODIFIED read-back and raw-row requirements, the field read-back scenario and the raw-context scenario too.
- [x] 1.3 Extend `toCel`, `isComplete` and the row count `commitDecision` compares per design.md D3 and D4. Add a `rowCount` helper and pass it from `ConditionInput.tsx`. Verify: round-trip tests cover every write scenario of the group and negation requirements and the examples under `examples/`. The `purchase-requisition.json` guard `data.received_quantity >= data.quantity` round-trips as one field-valued row. Every written text passes `checkAgainstFields`. The file `studio-commitDecision.test.ts` covers a removal inside a group.
- [x] 1.4 Give `operatorsFor` an optional format per design.md D5. Add the date and list words to the catalog under keys outside `condition.group.*`. Verify: tests prove a date offers six operators and a date-time offers "is" and "is not" alone. A person field offers two. A list offers "includes" and "does not include". Adapt `studio-vocabulary.test.ts` and `studio-conditionBuilder-words.test.tsx` where the words changed.
- [x] 1.5 Extend the clause code per design.md D7: list clauses, field labels, dates and group clauses. A group clause with a clause after it ends in a comma. A sentence that opens on a value keeps its case. Verify: tests cover every scenario of the MODIFIED sentence requirement and the raw-row group scenario. The canvas scenario runs through `guardPhrase`, the Read by scenario through `readerSentence`. One grouped guard reads in `studio-mapWords.test.ts` and `studio-guardedPathNotes.test.ts`. 
- [x] 1.6 Add a test for `rewriteFieldRead` in `packages/web/test/studio-keyReaders.test.ts` per design.md D9. It changes a key on the right side of a comparison and inside a group's parentheses. Verify: the test passes.

## 2. The builder's components

- [ ] 2.1 Split `ConditionBuilder.tsx` into `ComparisonRow`, `GroupRow` and `ValueEditor` per design.md D8, all three in that file. Draw the group head, the indented inner list, the group flag and the three commands the spec names. Inside a group the gutter prints the joiner as a word and no button. Removing a group's last row removes the group. Verify: a render test covers the five scenarios of "A group holds rows of its own, one level deep". It finds a nested list and the control "how the group's rows combine".
- [ ] 2.2 Add the value swap command per design.md D6. Its field picker lists candidates of the same CEL type and format. Verify: a render test finds number fields of the same CEL type alone in a number row's picker. A date row's picker lists date fields alone. A list row has no command. The swap empties the value.
- [ ] 2.3 Keep focus after a removal by DOM order among the remove controls, groups included, per design.md D8. Verify: `studio-conditionBuilder-removeFocus.test.tsx` gains a removal inside a group and a group's own removal.
- [ ] 2.4 Run `.claude/skills/impeccable/scripts/impeccable detect --json packages/web/src/areas/studio/panels/shared/ConditionBuilder.tsx`. Resolve every finding above the advisory `design-system-font-size` baseline. Verify: the output lists none.

## 3. Words, records and the glossary

<!-- antislop: allow synonym-rotation -->
<!-- Why: "process surface" is the glossary's own term for the screen. -->
- [ ] 3.1 Add a row "condition group" beside "sentence" in `.claude/rules/ui-glossary.md`'s process surface table. It names a row of a condition input that holds rows of its own, one level deep. Say that bare "group" names a form's Group or a group field. Verify: `antislop check` reports zero new findings.
- [ ] 3.2 In `docs/decisions.md`, close SENTENCE-2 and move its reasoning to `docs/decisions-archive.md`. Change "eleven points" to "ten". Record the deferrals design.md's Open Questions name as one open entry for this change. Reword refused simplification 11's reason per design.md's Non-Goals. Point STEP-1, STEP-2 and STEP-3's `ConditionBuilder.tsx` citations at the new lines. Verify: `antislop check` reports zero new findings on either file.
- [ ] 3.3 Add a browser check entry to `docs/browser-checks.md`. It covers the group row, the unfinished group, the field-compared row and the swap command. It covers a lone group's flat read-back too, in light and dark. Verify: `antislop check` reports zero new findings.
- [x] 3.4 Add the `cel-expressions` scenarios to `test/cel.test.ts`: two date fields in order, and a date field against a date literal. Verify: both tests pass.
- [ ] 3.5 Close stage 64 in `ROADMAP.md`: item 13 gains "Shipped 2026-11-01", item 16 gains its date, the status line reads DONE, and a table row lands. Add the stage's entry to `docs/roadmap-history.md`. Move `docs/studio-ui-concept.md` into `openspec/changes/archive/2026-10-30-studio-fresh-draft-starts-clean/`. Verify: `antislop check` reports zero new findings on each file, and no link to the old path remains.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` and `bun run build`. Verify: both exit 0.
- [ ] 4.2 Run the full `bun test` with `DATABASE_URL` set, in the devcontainer. Verify: the summary reads 0 fail, with the skip count at the floor.
- [ ] 4.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh` on the host. Verify: both pass.
<!-- antislop: allow long-words -->
<!-- Why: "purchase requisition" is the example process's own name. -->
- [ ] 4.4 Browser check on the production build, at 1280px and 1440px. At a way out's Only if, build a group, a field-compared date row and an unfinished group. Add a "does not include" row there, and build a group at the field card's Only ask this when. Open the purchase requisition's "Delivered in full" way out, whose line reads "Only if Received quantity is at least Quantity". Verify: the sentence under the rows and the Map's way out line read as the spec's scenarios state. In both schemes an inner row and its group's ground are visibly distinct.
- [ ] 4.5 Run `/impeccable critique` and `/impeccable audit` on the Steps tab. Verify: every finding has a fix or an entry in `docs/decisions.md`.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
