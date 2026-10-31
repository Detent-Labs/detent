# Tasks

## 1. Operands and the sentence logic (conditionLogic.ts)

- [ ] 1.1 Add every key of design.md D8 to `packages/web/src/i18n/catalogs/studio.ts`. Reword `condition.empty`.
- [ ] 1.2 In `conditionLogic.ts`, make `fieldLabel` return the label alone, or `condition.unnamedField`, per D7.
- [ ] 1.3 Give `Operand` a `group` member: `fields`, `child`, `case` or `person`. Set it in all three builders.
- [ ] 1.4 Number duplicate catalog labels with `condition.duplicateLabel`, in catalog order, per D7.
- [ ] 1.5 Label the context and child operands from the D7 keys. Keep the path as the fallback label.
- [ ] 1.6 Offer `instance.status` values with the `condition.status.*` labels. The values stay the engine's own.
- [ ] 1.7 Make `buildOperands` return fields, child, case, then person. Keep `operandSignature` on path and type.
- [ ] 1.8 Replace `OP_WORDS` with the `condition.clause.*` and `condition.join.*` keys, per D2.
- [ ] 1.9 Format a number value with `Intl.NumberFormat("en")`. Put free text in curly quotes, per D2.
- [ ] 1.10 Give `summarizeCondition` a raw-row choice: the source, or `condition.clause.raw`. The edge keeps the source.
- [ ] 1.11 Add `conditionSentence(condition, operands, stored)` over D1's states. It capitalizes the first letter.
- [ ] 1.12 Fix `packages/web/test/studio-conditionLogic.test.ts` for the labels, order, groups, duplicates and status words.
- [ ] 1.13 In that file, add one test per D1 state of `conditionSentence`, and the raw-row choice.
- [ ] 1.14 Bring `studio-edgeGuardLabel.test.ts` and `studio-guardedPathNotes.test.ts` to the new clause words.
- [ ] 1.15 Run the full gated suite in the foreground. Name any failing test.

## 2. The rows print no CEL (ConditionBuilder.tsx)

- [ ] 2.1 Print the operator select from `condition.op.*`, per D6. Drop `operatorLabel`'s CEL symbols.
- [ ] 2.2 Print the joiner as `condition.joiner.and` or `.or` in the written face. Keep its flip and hint.
- [ ] 2.3 Group the operand select under `<optgroup>` headings from `condition.group.*`. Skip an empty group.
- [ ] 2.4 Make a raw row print `condition.rawRowSentence` in slate, with its remove control, per D5.
- [ ] 2.5 Keep `studio-conditionNarrowColumn.test.ts` true to the new markup. Drop the `conditionRaw` assertion with its style.
- [ ] 2.6 Add `packages/web/test/studio-conditionBuilder-words.test.tsx`: operator words, joiner word, optgroups, raw row sentence.
- [ ] 2.7 Check `studio-booleanEmptyOption.test.tsx` and `studio-conditionInput-childOperands.test.tsx` against the new picker markup.
- [ ] 2.8 Run the full gated suite in the foreground. Name any failing test.

## 3. The sentence and the Developer view (ConditionInput.tsx)

- [ ] 3.1 Replace the readout with the sentence note of D1. The rows' group names it through `aria-describedby`.
- [ ] 3.2 Drop `toggleVariant` and `celMode`. Add the `<details>` Developer view of D3 with its caption.
- [ ] 3.3 Add the `cel: "disclosure" | "inline"` prop of D3. `BooleanOrExpressionInput` passes `"inline"`.
- [ ] 3.4 Print the D4 notice over unparseable source and mount the `<details>` open. Sync it through `onToggle`.
- [ ] 3.5 Keep the clear command in the footer, above the Developer view. Keep its focus landing.
- [ ] 3.6 Remove `toggleVariant` from `PathsPanel.tsx` and `FieldCatalogPanel.tsx`.
- [ ] 3.7 Remove `condition.editAsCel`, `condition.useBuilder` and `condition.contains` from the catalog. Typecheck names any reader.
- [ ] 3.8 Fix `packages/web/test/studio-conditionInput-clear.test.tsx` to the footer and the new focus target.
- [ ] 3.9 Add `packages/web/test/studio-conditionSentence.test.tsx`: the sentence states, a closed Developer view, the unparseable open state.
- [ ] 3.10 In that file, mount the inline variant. Assert one CEL input and no second "Developer view".
- [ ] 3.11 Check `studio-stepPage.test.tsx`'s `<details>` slices still find the step's own Developer view.
- [ ] 3.12 Run the full gated suite in the foreground. Name any failing test.

## 4. Docs and records

- [ ] 4.1 In `.claude/rules/ui-glossary.md`, name the condition builder's sentence and its Developer view. Add no antislop finding.
- [ ] 4.2 In `docs/authoring-guide.md`, say the guard's CEL stands in the builder's Developer view. Drop the old link name.
- [ ] 4.3 In `docs/browser-checks.md`, re-point the two condition entries that name the old link.
- [ ] 4.3a Leave the Default value entries alone. Their link belongs to `DefaultValueEditor`.
- [ ] 4.4 Add a browser-check entry for this change. It holds the checks of 5.7 to 5.10.
- [ ] 4.5 In `docs/decisions.md`, record the three open points of design.md's risks section.
- [ ] 4.5a Those are the rule builder's readout, the list-clause grammar and the canvas edge's raw fallback.
- [ ] 4.6 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 5.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 5.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`.
- [ ] 5.4 Read the pass, skip and fail counts off that run. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [ ] 5.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 5.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 5.7 On the production bundle, open a way out's "Only when" on Steps. Build two rows; read the sentence.
- [ ] 5.8 Open its Developer view. The CEL input holds the guard; parseable text typed there redraws the rows.
- [ ] 5.9 On Fields, open "Only ask this when". The picker lists labels, then the case, then the person.
- [ ] 5.10 Type unparseable CEL and reload the draft. The notice shows, and the Developer view stands open.
- [ ] 5.11 Run `/impeccable critique` and `/impeccable audit` on the Steps tab. Run `impeccable detect --json`, since the CSP blocks the overlay.
- [ ] 5.12 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect every flow to pass.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Set the stage 64 status line in `ROADMAP.md`.
- Push, open the PR, and merge on green CI.
