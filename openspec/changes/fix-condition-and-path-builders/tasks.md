# Tasks

## 1. Literal read-back and write (E2-10)

- [x] 1.1 In `conditionLogic.ts`, make `literalOf` read a `bigint` while safe and fold a `-_` node. Verify with the round-trip test in 1.3.
- [x] 1.2 In `celLiteral`, keep an exponent text as it stands, and accept only a safe integer for `int`. Verify `celLiteral(1e21, "double")` parses.
- [x] 1.3 Add a round-trip test per type to `packages/web/test/studio-conditionLogic.test.ts`. It writes with `toCel`, reads with `fromCel`, and expects the same row.
- [x] 1.4 Add the three audit repros to that file: `data.prioritaet > 3`, `data.amount > -5.0`, and `1e21`. Verify each yields a `cmp` row.
- [x] 1.5 Add a `ruleLogic` test that `data.prioritaet > -3` reads as a row. Verify `fromRuleCel` returns `cmp`.

## 2. Boolean empty option (E2-14)

- [x] 2.1 In `ConditionBuilder.tsx` and `RuleBuilder.tsx`, show an empty option and map `""` to `undefined`. Verify with the static-markup test in 2.2.
- [x] 2.2 Add a `renderToStaticMarkup` test for a new boolean row. Verify the empty option is the selected one, and the row carries the incomplete mark.

## 3. The write rule and the clear command (E2-6)

- [x] 3.1 Add a pure `commitDecision` to `conditionLogic.ts`. It takes the written text, the row counts and the stored source, and returns write, clear or hold. Verify with the table test in 3.2.
- [x] 3.2 Test `commitDecision` for four cases. They are an unfinished row, removing the last stored row, removing with nothing stored, and a complete row.
- [x] 3.3 In `ConditionInput.tsx` and `RuleInput.tsx`, call `commitDecision` and keep `seededFrom` on a hold. Print the held source in the readout. Verify the unfinished-edit scenario in a browser.
- [x] 3.4 Fix the comments in `BooleanOrExpressionInput.tsx`, `ConditionInput.tsx` and `RuleInput.tsx` that say an unfinished row writes `undefined`. Verify with `git grep -n 'writes .undefined' -- packages/web/src`.
- [x] 3.5 Add the `clearLabel` prop. Put the authoring-command button in both footers, and reset the local rows on press.
- [x] 3.6 In `FieldCatalogPanel.tsx`, pass `clearLabel` from `fieldVisibleOverrides`. Add the studio catalog key. Verify the command shows for a divergent field and hides when no view carries `visible`.
- [x] 3.7 Test that `applyVisibleOverride` with `undefined` drops `visible` from every referencing entry. Verify a divergent field reads as `uniform` afterwards.

## 4. The path row, the add action and the canvas (E2-1, E2-17)

- [x] 4.1 Add `triggerForNewPath` and `pathWithTrigger` to `draft/createPath.ts`. Test both: subprocess, sibling, no path, and a switch to manual that keeps the guard and drops `priority`.
- [x] 4.2 Use `triggerForNewPath` in `PathsPanel.addPath` and in `CanvasView`'s connect drag. Verify with a browser check on a subprocess step.
- [x] 4.3 In `PathsPanel.tsx`, show the "Only when" fieldset for both triggers. Keep `priority` automatic-only, and add the manual-path note and hint to the studio catalog.
- [x] 4.4 Add a static-markup test that a manual path with a guard shows the `ConditionBuilder` and no `priority` input.
- [x] 4.5 Add `edgeGuardLabel` to `conditionLogic.ts` and call it from `CanvasView.tsx`. Keep the badge and the "else" marker automatic-only. Test both triggers, and verify a manual edge shows its label in a browser.
- [x] 4.6 Add a pure `guardedManualPathNotes` in `draft/guarded-path-notes.ts`, and show its lines in `FormPreview.tsx`. Test: guarded path, unguarded path, unreadable guard.

## 5. Docs and the audit index

- [x] 5.1 Add one sentence on the conditional button to `docs/authoring-guide.md`, under "Path". Verify the sentence reads against `studio-app`.
- [x] 5.2 Add a checklist entry to `docs/browser-checks.md` for the five findings. Verify it names the route and the pass condition.
- [x] 5.3 Strike this change's entry in the audit index in `docs/decisions.md`.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`, then the full gated `bun test` with `DATABASE_URL` set, in the lane's devcontainer.
- [ ] 6.2 Run the antislop and whitespace gates over the pushed range, as the push gate does.
- [x] 6.3 Run a browser check on the production build for E2-1, E2-6, E2-10, E2-14 and E2-17. Then run `/impeccable critique` and `/impeccable audit` on the step page's Path to section and the Fields tab.

## Workflow follow-up

- Verify, sync the delta specs, archive, push, open the PR and merge on green CI.
- At sync, place each added requirement beside the removed one it replaces.
