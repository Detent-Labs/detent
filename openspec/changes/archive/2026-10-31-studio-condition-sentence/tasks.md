# Tasks

## 1. Operands and the sentence logic (conditionLogic.ts)

- [x] 1.1 Add every key of design.md D8 to `packages/web/src/i18n/catalogs/studio.ts`. Reword `condition.empty`.
- [x] 1.2 In `conditionLogic.ts`, make `fieldLabel` return the label alone, or `condition.unnamedField`, per D7.
- [x] 1.3 Give `Operand` an optional `group`: `fields`, `child`, `case` or `person`. Set it per D7.
- [x] 1.4 Number duplicate catalog labels with `condition.duplicateLabel`, in catalog order, per D7.
- [x] 1.5 Label the context and child operands from the D7 keys. Keep the path as the fallback label.
- [x] 1.6 Offer `instance.status` values with the `condition.status.*` labels. The values stay the engine's own.
- [x] 1.7 Make `buildOperands` return fields, child, case, then person. Keep `operandSignature` on path and type.
- [x] 1.8 Replace `OP_WORDS` with the `condition.clause.*` and `condition.join.*` keys, per D2.
- [x] 1.9 Format a number value with `Intl.NumberFormat("en")`. Put free text in curly quotes, per D2.
- [x] 1.10 Give `summarizeCondition` a raw-row choice: the source, or `condition.clause.raw`. The edge keeps the source.
- [x] 1.11 Add `conditionSentence(condition, operands, stored)` over D1's states. It capitalizes the first letter.
- [x] 1.12 Fix `packages/web/test/studio-conditionLogic.test.ts` for the labels, order, groups, duplicates and status words.
- [x] 1.12a Keep `packages/web/test/studio-ruleLogic.test.ts` green, its operand shapes untouched.
- [x] 1.13 In that file, add one test per D1 state of `conditionSentence`, and the raw-row choice.
- [x] 1.14 Bring `studio-edgeGuardLabel.test.ts` and `studio-guardedPathNotes.test.ts` to the new clause words.
- [x] 1.15 Run the full gated suite in the foreground. Name any failing test.

## 2. The rows print no CEL (ConditionBuilder.tsx)

- [x] 2.1 Print the operator select from `condition.op.*`, per D6. Drop `operatorLabel`'s CEL symbols.
- [x] 2.2 Print the joiner as `condition.joiner.and` or `.or` in the written face. Keep its flip and hint.
- [x] 2.3 Group the operand select under `<optgroup>` headings from `condition.group.*`. Skip an empty group.
- [x] 2.4 Make a raw row print `condition.rawRowSentence` in slate, with its remove control, per D5.
- [x] 2.5 Keep `studio-conditionNarrowColumn.test.ts` true to the new markup. Drop the `conditionRaw` assertion with its style.
- [x] 2.6 Add `packages/web/test/studio-conditionBuilder-words.test.tsx`: operator words, joiner word, optgroups, raw row sentence.
- [x] 2.7 Check `studio-booleanEmptyOption.test.tsx` and `studio-conditionInput-childOperands.test.tsx` against the new picker markup.
- [x] 2.8 Run the full gated suite in the foreground. Name any failing test.

## 3. The sentence and the Developer view (ConditionInput.tsx)

- [x] 3.0 Drop `ConditionBuilder`'s empty paragraph and give it the `describedBy` prop of D1.
- [x] 3.1 Replace the readout with the sentence note of D1. The rows' group names it through `aria-describedby`.
- [x] 3.2 Drop `toggleVariant` and `celMode`. Add the `<details>` Developer view of D3 with its caption.
- [x] 3.3 Add the `cel: "disclosure" | "inline"` prop of D3. `BooleanOrExpressionInput` passes `"inline"`.
- [x] 3.4 Print the D4 notice over unparseable source. Open the `<details>` on each re-seed onto it.
- [x] 3.5 Keep the clear command in the footer, above the Developer view. Keep its focus landing.
- [x] 3.6 Remove `toggleVariant` from `PathsPanel.tsx` and `FieldCatalogPanel.tsx`.
- [x] 3.7 Remove `condition.editAsCel`, `condition.useBuilder` and `condition.contains` from the catalog. Typecheck names any reader.
- [x] 3.8 Fix `packages/web/test/studio-conditionInput-clear.test.tsx` to the footer and the new focus target.
- [x] 3.9 Add `packages/web/test/studio-conditionSentence.test.tsx`: the sentence states, a closed Developer view, the unparseable open state.
- [x] 3.10 In that file, mount the inline variant. Assert one CEL input and no second "Developer view".
- [x] 3.11 Check `studio-stepPage.test.tsx`'s `<details>` slices still find the step's own Developer view.
- [x] 3.12 Run the full gated suite in the foreground. Name any failing test.

## 4. Docs and records

- [x] 4.1 In `.claude/rules/ui-glossary.md`, name the condition builder's sentence and its Developer view.
- [x] 4.1a There, say that unparseable source opens the condition's Developer view. Add no antislop finding.
- [x] 4.2 In `docs/authoring-guide.md`, say the guard's CEL stands in the builder's Developer view. Drop the old link name.
- [x] 4.3 In `docs/browser-checks.md`, re-point the two condition entries that name the old link.
- [x] 4.3a Leave the Default value entries alone. Their link belongs to `DefaultValueEditor`.
- [x] 4.4 Add a browser-check entry for this change. It holds the checks of 5.7 to 5.10.
- [x] 4.5 In `docs/decisions.md`, record the three open points of design.md's risks section.
- [x] 4.5a Those are the rule builder's readout, the list-clause grammar and the canvas edge's raw fallback.
- [x] 4.5b Move refused simplification 12 to `docs/decisions-archive.md` word for word, per D9. Renumber the rest.
- [x] 4.6 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [x] 5.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [x] 5.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`.
- [x] 5.4 Read the pass, skip and fail counts off that run. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [x] 5.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [x] 5.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [x] 5.7 On the production bundle, open a way out's "Only when" on Steps. Build two rows; read the sentence.
- [x] 5.8 Open its Developer view. The CEL input holds the guard; parseable text typed there redraws the rows.
- [x] 5.9 On Fields, open "Only ask this when". The picker lists labels, then the case, then the person.
- [x] 5.10 Type unparseable CEL and reload the draft. The notice shows, and the Developer view stands open.
- [x] 5.11 Run `/impeccable critique` and `/impeccable audit` on the Steps tab. Run `impeccable detect --json`, since the CSP blocks the overlay.
- [x] 5.12 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect every flow to pass.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Set the stage 64 status line in `ROADMAP.md`.
- Push, open the PR, and merge on green CI.
