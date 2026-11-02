# Tasks

## 1. The model, the reader and the writer

- [ ] 1.1 In `conditionLogic.ts`, replace the flat `Row` with design.md D1's model: `RowValue`, `Leaf`, `GroupRow`, `Row` and `CmpOp` with `!in`. Make `summarizeValue` take the literal and the operand. Adapt the one call in `ruleLogic.ts`. Verify: `bun run typecheck` exits 0.
- [ ] 1.2 Extend `fromCel` per design.md D2. Verify: new cases in `packages/web/test/studio-conditionLogic.test.ts` cover every read scenario of the two ADDED requirements on groups and on negation. Cover the field read-back scenario and the raw-context scenario too.
- [ ] 1.3 Extend `toCel`, `isComplete` and the row count `commitDecision` compares per design.md D3 and D4. Add a `rowCount` helper and pass it from `ConditionInput.tsx`. Verify: round-trip tests cover every write scenario of the group requirement and the examples under `examples/`. Every written text passes `checkAgainstFields`. The file `studio-commitDecision.test.ts` covers a removal inside a group.
- [ ] 1.4 Give `operatorsFor` an optional format per design.md D5. Add the date, date-time and list words to the catalog. Verify: tests prove a date offers six operators and a date-time reads "is at or before". A person field offers two. A list offers "includes" and "does not include". Adapt `studio-vocabulary.test.ts` and `studio-conditionBuilder-words.test.tsx` where the words changed.
- [ ] 1.5 Extend the clause code per design.md D7: the list clauses, the field label, the date and the group clauses. Verify: tests cover every scenario of the MODIFIED sentence requirement, the canvas scenario through `guardPhrase`, and the Read by scenario through `readerSentence`. Adapt `studio-conditionSentence.test.tsx`, `studio-guardPhrase.test.ts` and `studio-readByRows.test.ts` where the words changed.
- [ ] 1.6 Add a test for `rewriteFieldRead` per design.md D9. It changes a key on the right side of a comparison and inside a group's parentheses. Verify: the test passes.

## 2. The builder's components

- [ ] 2.1 Split `ConditionBuilder.tsx` into `ComparisonRow`, `GroupRow` and `ValueEditor` per design.md D8. Draw the group head, the indented inner list and the group flag. Draw "+ Add group", "+ Add row to this group" and "Remove group". Verify: a bun:test render of a grouped condition finds a nested list. It finds the control "how the group's rows combine". The gutter joiner inside a group flips the group's joiner alone.
- [ ] 2.2 Add the value swap command per design.md D6, with the field picker over same-type candidates. Verify: a render test finds number fields alone in a number row's picker. A list row has no command. The swap empties the value.
- [ ] 2.3 Keep focus after a removal by DOM order among the remove controls, groups included, per design.md D8. Verify: `studio-conditionBuilder-removeFocus.test.tsx` gains a removal inside a group and a group's own removal.
- [ ] 2.4 Run `.claude/skills/impeccable/scripts/impeccable detect --json packages/web/src/areas/studio/panels/shared/ConditionBuilder.tsx`. Resolve every finding above the advisory `design-system-font-size` baseline. Verify: the output lists none.

## 3. Words, records and the glossary

- [ ] 3.1 Add a "group" entry to the condition builder's terms in `.claude/rules/ui-glossary.md`. Verify: `antislop check` reports zero new findings.
- [ ] 3.2 Close SENTENCE-2 in `docs/decisions.md` and move its reasoning to `docs/decisions-archive.md`. Record design.md's Non-Goals as one open entry for this change. Verify: `antislop check` reports zero new findings on either file.
- [ ] 3.3 Add a browser check entry to `docs/browser-checks.md`. It covers the group row, the unfinished group, the field-compared row and the swap command, in light and dark. Verify: `antislop check` reports zero new findings.
- [ ] 3.4 Add the `cel-expressions` scenarios to `test/cel.test.ts`: two date fields in order, and a date field against a date literal. Verify: both tests pass.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` and `bun run build`. Verify: both exit 0.
- [ ] 4.2 Run the full `bun test` with `DATABASE_URL` set, in the devcontainer. Verify: the summary reads 0 fail, with the skip count at the floor.
- [ ] 4.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh` on the host. Verify: both pass.
- [ ] 4.4 Browser check on the production build. At a way out's Only if, build a group and a field-compared date row. Add a list row on "does not include" and an unfinished group. Build a group at the field card's Only ask this when. Verify: the sentence under the rows reads as the spec's scenarios state. So does the way out's line on the Map, in light and dark.
- [ ] 4.5 Run `/impeccable critique` and `/impeccable audit` on the Steps tab. Verify: every finding has a fix or an entry in `docs/decisions.md`.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
- Close stage 64 in `ROADMAP.md` with a table row. Add its entry to `docs/roadmap-history.md`. Move `docs/studio-ui-concept.md` into the archive of change 1.
