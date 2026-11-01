# Tasks

## 1. The section model and its strings (studio-step-page, studio-checks-rail)

- [ ] 1.1 In `panels/sectionsFor.ts`, make `SectionName` the eight names of design D1 and `sectionsFor` return D1's three ordered lists. Remove `sectionColumns`.
- [ ] 1.2 Add `sectionLabel(section, performedBy)` to `sectionsFor.ts`, returning the catalog key per D1. An end step's `lifecycle` reads `stepSections.lifecycleEntryOnly`.
- [ ] 1.3 In `panels/sectionIssues.ts`, map `onEntry`, `onExit` and `onCancel` onto `lifecycle` and `cancellable` and `collaboration` onto `more`, in `LOC_SECTION` and the action claims.
- [ ] 1.4 Add the D8 keys to `packages/web/src/i18n/catalogs/studio.ts`, with the exact texts. Remove the four `stepSections.*` keys D8 retires.
- [ ] 1.5 Add `panels/stepSummaries.ts` with `SectionState`, `sectionSummary` and `defaultOpenSection` per D3. Fill a `{slot}` through a replacer function.
- [ ] 1.6 Add `draft/stepRemoval.ts` with `stepRemovalReach(draft, stepId, fields)` per D7.
- [ ] 1.7 Rewrite `packages/web/test/studio-sectionsFor.test.ts` per D9. Extend `studio-sectionIssues.test.ts` per D9.
- [ ] 1.8 Add `packages/web/test/studio-stepSummaries.test.ts` and `studio-stepRemoval.test.ts` per D9. Run the full gated suite in the foreground. Read its verdict off the named tests.

## 2. The accordion and the removal dialog (studio-step-page, studio-checks-rail, spa-accessibility)

- [ ] 2.1 In `panels/StepPage.tsx`, render each section per D2: an `<h3>` holding a `<button type="button">` with `aria-expanded` and `aria-controls`, over a `role="region"` body.
- [ ] 2.2 Give the header the name in the Legend style and the mark per D2. The summary takes body text, ink when done and slate otherwise, mono where `sectionSummary` says.
- [ ] 2.3 Hold `openSection` in state per D4, initialised from `defaultOpenSection`. Open `paths` when `selectedPathId` becomes defined. Hide a closed body with `hidden` and a compiled `display: none`.
- [ ] 2.4 Print the section's step-level issues above its controls per D5. Build the `lifecycle` and `more` bodies per D5, with the Developer view last in More.
- [ ] 2.5 Set `page`'s `overflowY` to `auto` by default and `visible` under `NARROW`. Wrap the masthead, the sections and the walk in a `column` capped at 52rem, per D6.
- [ ] 2.6 Add `panels/RemoveStepDialog.tsx` per D7, copying `KindSwitchDialog.tsx`'s shape. Declare its styles with `stylex.create()`.
- [ ] 2.7 Give the masthead's Remove this step `btn btn-secondary btn-destructive`, a trigger ref and a `removing` flag that mounts the dialog. Confirm calls `onRemoveStep`.
- [ ] 2.8 Rewrite `packages/web/test/studio-stepPage.test.tsx` per D9. Run the full gated suite in the foreground. `studio-panels-literal-text.test.ts` stays green.

## 3. The Steps tab's grid (studio-step-page)

- [ ] 3.1 In `screens/EditScreen.tsx`, make `stepsTab` read `"22rem minmax(0, 1fr)"` and, under `NARROW`, rows `"auto auto"`, per D6. Rewrite the comment above it.
- [ ] 3.2 In `packages/web/test/studio-guidedSurfaceStyle.test.ts`, assert the page's `overflowY` pair and the grid's two values per D9. Run the full gated suite in the foreground.

## 4. Docs, glossary and roadmap

- [ ] 4.1 Apply D10's four glossary edits to `.claude/rules/ui-glossary.md`. Run `antislop check` on it; add no finding.
- [ ] 4.2 In `docs/authoring-guide.md`, make sections 4 to 7 name the sections as the headers read. Section 7 says "Who acts".
- [ ] 4.3 In `docs/browser-checks.md`, add the entry D10 names. It holds the checks of 5.7 to 5.10.
- [ ] 4.4 In `docs/decisions.md`, move RAIL-6 and RAIL-7 to `docs/decisions-archive.md` word for word. Give each a resolution line naming this change.
- [ ] 4.4a Add the resolution line to the "Remove step and the field catalog's Remove field trigger" entry, per D10. Add the section "Open from studio-step-accordion".
- [ ] 4.5 In `ROADMAP.md` stage 64, append "Shipped 2026-11-01." to item 10. Make the status line read "CHANGES 1, 2, 3, 4, 6, 7, 8, 9 AND 10 DONE, REST NOT STARTED".
- [ ] 4.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host over the touched Markdown. Read its exit code.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 5.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 5.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, with `OPENSPEC_TELEMETRY=0`.
- [ ] 5.4 Read the pass, skip and fail counts off that run. Name any failing test. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [ ] 5.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 5.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 5.7 On the production bundle, open a `purchase_requisition` draft's Steps tab at 1440px. A task step shows six headers in D1's order, one open, each a button with `aria-expanded`.
- [ ] 5.7a Press a closed header. It opens and the open one closes. Press it again. None stands open. Tab order runs masthead, headers, open body, walk.
- [ ] 5.7b Open a subprocess step and an end step. The headers read per D1. Open More: the Developer view stands last, closed, and prints the key only once opened.
- [ ] 5.8 Add a task step from the rail's foot. Who acts stands open with "Nobody in particular" in slate and no Done mark. Ways out shows "No way out yet" and a badge reading 1.
- [ ] 5.8a Set an assignment. The Who acts header shows the Done mark and the strategy's name in ink.
- [ ] 5.9 Press Remove this step on a step two ways out lead to. The dialog names the step, counts two ways out leading here, and Cancel holds the focus. Escape returns focus to the control. Confirm removes the step and focus lands on the rail's current row.
- [ ] 5.10 At 420px, the rail stands above the page capped at 20rem. The page has no scroll box of its own: `getComputedStyle` reads `overflow-y: visible` on it. At 1024px the condition builder's row reads whole.
- [ ] 5.11 Run `/impeccable critique` and `/impeccable audit` on `/studio/processes/<id>/edit/steps`. Run `impeccable detect --json` on the changed files, since the app's CSP blocks the overlay.
- [ ] 5.12 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect every flow to pass.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Push, open the PR, and merge on green CI.
