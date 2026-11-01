# Tasks

## 1. Transliteration in key derivation

- [ ] 1.1 Add `transliterate(text)` to `draft/deriveKey.ts` per design D5, and slug its result in `deriveKey`.
- [ ] 1.2 Make `draft/createPath.ts::slugify` slug the `transliterate` result too, per D5.
- [ ] 1.3 Drop the key fallback from `createPath.ts::sideText`, per D6, and rewrite its doc comment to match.
- [ ] 1.4 Extend `studio-deriveKey.test.ts`: "Prüfung", "Prüfung der Änderung", "Café Straße", "Größe", decomposed "ä", "Ærø".
- [ ] 1.5 Extend `studio-createPath.test.ts`: "Prüfung" to "Abschluss" keys `pruefung-abschluss`; a keyed unnamed step reads the placeholder.
- [ ] 1.6 Grep `packages/web/test` for keys the old rule derived from non-ASCII labels, and fix each expectation.
- [ ] 1.7 Run the full suite in the foreground and name any failing test.

## 2. One option-text module

- [ ] 2.1 Add `panels/shared/optionText.ts` with `stepText`, `numberRepeats` and `wayOutHeading`, per design D1.
- [ ] 2.2 Add the catalog key `options.repeatedLabel`, "{label} ({n})", to `i18n/catalogs/studio.ts`.
- [ ] 2.3 Make `conditionLogic.ts::catalogOperands` call `numberRepeats`, and delete `condition.duplicateLabel`.
- [ ] 2.4 Add `studio-optionText.test.ts`: unnamed step, content-locale fallback, repeats in list order, each heading placeholder.
- [ ] 2.5 Keep `studio-conditionLogic.test.ts` green on "Name (2)", with no expectation changed.
- [ ] 2.6 Run the full suite in the foreground and name any failing test.

## 3. The step page's selects print labels

- [ ] 3.1 In `PathsPanel.tsx`, list both step selects by `numberRepeats(steps, stepText)`, per design D2.
- [ ] 3.2 There, build the row heading with `wayOutHeading` over the same map, and delete the local `rowHeading`.
- [ ] 3.3 Give `TimersPanel.tsx` the props `steps`, `contentLocale` and `baseLocale`. `StepPage.tsx` passes them.
- [ ] 3.4 List the time limit's ways out by `wayOutHeading`, then `numberRepeats`, per design D3.
- [ ] 3.5 Add `fieldTargets` to `fieldExpressionMapLogic.ts`, and make `targetsOf` callers read labelled targets, per D4.
- [ ] 3.6 Change `FieldExpressionMapEditor`'s `fields` prop to `targets`, and read it in `nextUnusedTarget` too.
- [ ] 3.7 Give `ActionListEditor` the props `contentLocale` and `baseLocale` from its four callers, and pass `fieldTargets`.
- [ ] 3.8 In `SubprocessSpecEditor.tsx`, pass `fieldTargets` to the output mapping and numbered child refs to the input mapping.
- [ ] 3.9 Rewrite `useChildInputFields.ts`'s doc comment: a ref carries the label the select prints.
- [ ] 3.10 Extend `studio-pathsPanel-manualGuard.test.tsx` or a new panel test: label options, unnamed step, "Review (2)", heading.
- [ ] 3.11 Add a TimersPanel render test: the way-out select offers "Freigeben → Abschluss" and no key.
- [ ] 3.12 Extend `studio-fieldExpressionMapEditor.test.tsx`: labelled options, no group, the unlisted id keeps its mark.
- [ ] 3.13 Extend `studio-subprocessSpecEditor.test.tsx`: the input mapping offers "Amount" and "Applicant", never `amount`.
- [ ] 3.14 Run typecheck, then the full suite, both in the foreground. Name any failing test.

## 4. Docs and records

- [ ] 4.1 In `docs/authoring-guide.md`, beside "The key follows the label.", say how umlauts read in a derived key.
- [ ] 4.2 Add a `docs/browser-checks.md` entry for this change holding the walk of task 5.6.
- [ ] 4.3 In `docs/decisions.md`, record the open points of design.md's Non-goals under this change's heading.
- [ ] 4.4 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and report its last lines.
- [ ] 5.2 Run `bun run build` and report its last lines.
- [ ] 5.3 Run `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test` and report pass, skip and fail.
- [ ] 5.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and report its exit code.
- [ ] 5.5 On the host, run the same pipe with `whitespace.sh` and report its exit code.
- [ ] 5.6 Browser check on the production build: the six selects, a heading, a new step "Prüfung" and its key.
- [ ] 5.7 Run `/impeccable critique` and `/impeccable audit` on the Steps tab, plus `impeccable detect --json`.
- [ ] 5.8 Fix every P0 and P1 the audit reports, then rerun 5.1 to 5.3.

## Workflow follow-up

- Run `openspec-verify-change`, then sync the specs and archive the change.
- At sync, move the ADDED inputMapping successor to its removed predecessor's place.
- Set the stage 64 status line in `ROADMAP.md`.
