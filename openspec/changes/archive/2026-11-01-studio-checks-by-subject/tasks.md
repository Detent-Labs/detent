# Tasks

## 1. The sentences (studio-checks-rail)

- [x] 1.1 Add every key design D3 lists, plus `checks.severity.*`, to `i18n/catalogs/studio.ts`.
- [x] 1.1a Add `checksRail.fix`, `checksRail.heldBackLine` and `checksRail.publishLine` there too.
- [x] 1.1b Add `checksRail.subject.steps` ("Steps"), `checksRail.subject.fields` ("Fields") and `checksRail.subject.publishing` ("Before publishing").
- [x] 1.2 Add `draft/checkSentence.ts` with `checkSentence`, its four tiers and `checkPlace` per D2. Export the literal rule lookup for the scan test. Export `sectionByEntityId` from `panels/sectionIssues.ts`.
- [x] 1.3 Add `sentence?` to `EditorIssue` and `issueText` to `draft/issues.ts`. Make `runValidation` fill the sentence last, per D1.
- [x] 1.4 Add `packages/web/test/studio-checkSentence.test.ts`. Cover one case per key that names the step and the section. Assert that no sentence holds an engine word. Walk each step kind for a missing section. Cover the fallbacks and both unnamed slots. Pin `checkPlace` per JSON-surface key, and `checks.action.fieldGone`'s section.
- [x] 1.5 In that test file, parse `src/schema/definition.ts`, `src/schema/compile.ts` and `src/engine/registry-check.ts` with the TypeScript AST, as `studio-panels-literal-text.test.ts` does. Collect five forms: `message:` properties, `add(...)` calls, `reasons.push`, the `GRAMMAR` and `OUT_OF_RANGE` constants, and the `${entityLabel}` template.
- [x] 1.5a Replace each template hole with a sample value. Assert that each literal meets a literal rule. Exempt the `migrationSpec` refinements by name.
- [x] 1.5b Assert a floor count. Assert one named literal from each of `add`, `reasons.push` and `GRAMMAR`.
- [x] 1.6 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 2. The rows (studio-checks-rail, studio-guided-vocabulary)

- [x] 2.1 Add `groupChecksBySubject` to `draft/checksRail.ts` per D4. Extend `studio-checksRail.test.ts`.
- [x] 2.2 Rewrite `panels/ChecksRail.tsx` per D4, D5 and D6: the three subjects, `CheckRow`, `HeldBackLine`, and the prop `onFix`. Remove `checksRail.heldBack` and `checksRail.groupClear`.
- [x] 2.2a Pass `onFix` at the rail's mount in `screens/EditScreen.tsx`, still through `openTabFromRow`.
- [x] 2.3 In `panels/shared/IssueList.tsx`, print `issueText` with no source label. Add `anchorId` to `IssueItems`, and forward it from `IssueList`, per D7 and D8. Move `issueSourceLabel` into `ChecksRail.tsx`. Update `studio-issueList.test.tsx`.
- [x] 2.4 Rewrite `studio-checksRail-narrowing.test.tsx` and `studio-checksRail-publishVerdict.test.tsx` where they read groups. Add `studio-checksRail-rows.test.tsx` for the subjects, the words, the Developer view, the line and the start state.
- [x] 2.5 Update `studio-actionListEditor-registryBadge.test.tsx`, `studio-strip-compiled.test.ts` and any test asserting a source label.
- [x] 2.5a Keep `studio-panels-literal-text.test.ts` and `studio-vocabulary.test.ts` green.
- [x] 2.6 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 3. The landing (studio-process-tabs, studio-step-page)

- [x] 3.1 Extend `CheckTarget` and `checkTarget` in `draft/process-tabs.ts` per D7's table, reading `checkPlace` first. Update `studio-processTabs.test.ts` with one case per row. Cover a duplicate field id against a duplicate field key.
- [x] 3.2 In `panels/sectionIssues.ts`, add `key: "more"` to `LOC_SECTION`. Add a `sectionRequest` prop and `onSectionOpened` to `StepPage.tsx`. Open More's Developer view while a key check stands. Update `studio-sectionIssues.test.ts` and `studio-stepPage.test.tsx`, which pin the key on the masthead. Export the output-search helper D2 names, call it from `sectionOfIssue`, and test the header's count.
- [x] 3.3 In `StepPage.tsx`, print the name check under Name and the description check under Description. Keep the rest at the masthead's end. Give the name input the id `step-page-name`.
- [x] 3.4 In `screens/EditScreen.tsx`, add `fixCheck` and `pendingFocus` per D7. Move the three `pendingTabFocus` writers over, and key the effect on `[openTab, pendingFocus]`. Keep `openTabFromRow` for Read by. Point the rail's `onFix` at `fixCheck`, with `checkTarget(issue, draft)`. After `onAddStep`, focus `step-page-name`.
- [x] 3.5 In `panels/EntityTabs.tsx`, add `fixRequest` and `onFixLanded` for a field and a source per D7. Pass them through `panels/FieldsTabViews.tsx`.
- [x] 3.5a In `panels/FieldCatalogPanel.tsx`, set `anchorId` on each zone's `IssueItems`. In `panels/DataSourcesPanel.tsx`, set the source's anchor. Add `namesFieldSource` to `panels/fieldCheckZone.ts`, and include it in `moreChecked`.
- [x] 3.5b Set `process-header-name` in `panels/ProcessHeaderBar.tsx` and `json-surface-input` in `panels/JsonView.tsx`.
- [x] 3.6 Add `studio-stepPage-sectionRequest.test.tsx`. Extend the step page tests for the name check, the key check in More and the opened Developer view.
- [x] 3.6a Add field and source landing tests beside the existing `EntityTabs` tests.
- [x] 3.7 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 4. The inherited points (studio-publish, studio-step-page, studio-guided-vocabulary)

- [x] 4.1 Reword `draftToolbar.publishDialogBlocked`. Add `describePublishRefusal`, `actions.errorDetail` and the two `checks.publishRefused*` keys per D9. Draw the detail's closed Developer view in the dialog and the banner. Add `checks.publishRefusedFallback`. Extend `studio-publishErrors.test.ts` and `studio-processHeaderBar-publishGate.test.tsx`.
- [x] 4.1a Update `e2e/publish.e2e.ts`: the alert reads the fallback sentence, and the closed Developer view holds the server's text.
- [x] 4.2 Add `paths.targetGone`. Update `wayOutHeading` and the Leads to select in `panels/PathsPanel.tsx` per D9. Test the heading and the option in `studio-optionText.test.ts` and `studio-pathsPanel-manualGuard.test.tsx`.
- [x] 4.3 Set `condition.onlyWhenHeading` to "Only if". Update the tests and the `docs/browser-checks.md` passages quoting the old word. Update `docs/authoring-guide.md` in the same commit.
- [x] 4.4 Give `warning` in `StepPage.tsx` a 3px rule in `colors.advisory`. Give `childLoadError` `role="alert"`, with a render test over a rejected file.
- [x] 4.5 Read `stepTextMap` in the narrowing label, the walk and the removal dialog per D9. Make `StepsRail.tsx` scroll its current row into view when the step moves. Test what a pure function can pin.
- [x] 4.6 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 5. Docs

- [x] 5.1 In `.claude/rules/ui-glossary.md`, update the checks rail row and the Developer view list. Add the words Must fix, Worth a look and Fix. Run `antislop check` on it; add no finding.
- [x] 5.2 In `DESIGN.md`, rewrite the Checks rail entry, and note the row's kicker under the Check Badge's neighbours. Update `.claude/rules/design-language.md` if it names the source label.
- [x] 5.3 In `docs/browser-checks.md`, add the entry "Checks by subject". Rewrite the passages on row press focus and the full grouped list. Rewrite those on source labels, and the opening one naming the groups.
- [x] 5.3a Passages quoting a raw message stay true against a row's Developer view. Reword each to read it there.
- [x] 5.4 In `docs/decisions.md` and `docs/decisions-archive.md`, move the resolved entries word for word, each with a resolved line.
- [x] 5.4a Narrow the 22 failure renders entry, and re-point D10's entries. Narrow TONE-1 to the timers panel's `refusal`: D9 removes the step page's 2px rule, and D5 removes the rail's.
- [x] 5.4b Add "Open from studio-checks-by-subject" for what stays open.
- [x] 5.5 In `ROADMAP.md` stage 64, append "Shipped 2026-11-01." to item 12 and set the status line to "CHANGES 1 TO 12 AND 14 DONE, REST NOT STARTED".
- [x] 5.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host over the touched Markdown. Read its exit code.

## 6. The review wave

- [x] 6.1 Land a time limit's unreadable length on Time limit per the D3 text, and add `checks.fallback.contract` for the contract's tier 4.
- [x] 6.2 Give the sentences the D3 texts: internal name, the unlisted ending, the line. An unnamed step reads its rail number per D2.
- [x] 6.3 Rework the row per D6: no box, no visible heading, subject `h2`, Fix as `.btn-secondary` on the sentence's first line.
- [x] 6.4 Give `IssueItems` the warning callout's form per D8. Hide the banner on the Checks tab, and set its text.
- [x] 6.5 Land a key check on `step-page-key`, and scroll a section header to the top, per D7.
- [x] 6.5a Print the check's sentence over the JSON input. A tab press leaves that view, per D7.
- [x] 6.6 Normalize a refusal's dotted location before the sentence, with a test over real Zod paths.
- [x] 6.7 Close the final review's M-1 to M-10, per `.superpowers/sdd/tasks/wave-brief.md`.
- [x] 6.8 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [x] 7.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [x] 7.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test` with `DATABASE_URL` set by the pod.
- [x] 7.4 Read the pass, skip and fail counts off that run. Name any failing test. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [x] 7.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [x] 7.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [x] 7.7 On the production bundle, break a `purchase_requisition` draft. Give it a step with no way out, a field with no name and no process name.
- [x] 7.7a Open Checks at 1440px. It reads Steps, Fields and Before publishing, with a word and one sentence per row. No ZOD or CEL prints outside a Developer view.
- [x] 7.8 Press Fix on each row kind in D7's table. Read the landing and `document.activeElement` for each.
- [x] 7.9 Add a step. Focus stands in Name. Its name check stands under Name, and Checks lists it. Type `cancel_sink` as a step's key; the check stands in More with the Developer view open.
- [x] 7.10 Clear the draft. The ink box and the publish line stand. On a blocked draft, read the Publish dialog's sentence.
- [x] 7.10a Add an unknown key inside a step in the JSON view. Publish, and read the refusal's sentences and the closed Developer view.
- [x] 7.11 Open a Forms badge's narrowed Checks on an unnamed step. The label names no key. At 1024px and 420px, nothing scrolls sideways.
- [x] 7.11a At 900px wide, press Fix on the last step's row. Its rail row stands whole in view.
- [x] 7.12 Run `/impeccable critique` and `/impeccable audit` on `/studio/processes/<id>/edit/checks`. Run `impeccable detect --json` on the changed files, since the app's CSP blocks the overlay.
- [x] 7.13 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect every flow to pass.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Push, open the PR, and merge on green CI.
