# Tasks

## 1. The section model, the accordion and the removal dialog (studio-step-page, studio-checks-rail, studio-guided-vocabulary, spa-accessibility)

- [x] 1.1 In `panels/sectionsFor.ts`, make `SectionName` the eight names of design D1 and `sectionsFor` return D1's three ordered lists. Remove `sectionColumns`.
- [x] 1.2 Add `sectionLabel(section, performedBy)` to `sectionsFor.ts`, returning the catalog key per D1. An end step's `lifecycle` reads `stepSections.lifecycleEntryOnly`.
- [x] 1.3 In `panels/sectionIssues.ts`, map `onEntry`, `onExit` and `onCancel` onto `lifecycle` and `cancellable` and `collaboration` onto `more`, in `LOC_SECTION` and the action claims.
- [x] 1.4 Add the D8 keys to `packages/web/src/i18n/catalogs/studio.ts`, with the exact texts. Remove the four `stepSections.*` keys D8 retires.
- [x] 1.5 Add `panels/stepSummaries.ts` with `SectionState`, `sectionSummary`, `defaultOpenSection` and `nextOpenSection` per D3. Fill a `{slot}` through a replacer function.
- [x] 1.6 Add `draft/stepRemoval.ts` with `stepRemovalReach(draft, stepId, fields)` per D7.
- [x] 1.7 In `panels/StepPage.tsx`, render each section per D2: an `<h3>` holding a `<button type="button">` with `aria-expanded` and `aria-controls`, over a `role="region"` body.
- [x] 1.8 Give the header the name in the Legend style and the mark per D2. The summary takes body text, ink when done and slate otherwise, mono where `sectionSummary` says.
- [x] 1.9 Hold `openSection` in state per D4, initialised from `defaultOpenSection`. A press sets `nextOpenSection`. Open `paths` when `selectedPathId` becomes defined. Hide a closed body with `hidden` and a compiled `display: none`.
- [x] 1.10 Print the section's step-level issues above its controls per D5. Build the `lifecycle`, `form` and `more` bodies per D5, with the Developer view last in More.
- [x] 1.11 Set `page`'s `overflowY` to `auto` by default and `visible` under `NARROW`, and rewrite its comment per D6. Wrap the masthead, the sections and the walk in a `column` capped at 52rem.
- [x] 1.12 Add `panels/RemoveStepDialog.tsx` per D7, copying `KindSwitchDialog.tsx`'s shape. Declare its styles with `stylex.create()`.
- [x] 1.13 Give the masthead's Remove this step `btn btn-secondary btn-destructive`, a trigger ref and a `removing` flag that mounts the dialog. Confirm calls `onRemoveStep`.
- [x] 1.14 Rewrite `packages/web/test/studio-sectionsFor.test.ts` and `studio-stepPage.test.tsx` per D9. Extend `studio-sectionIssues.test.ts` and `studio-vocabulary.test.ts` per D9.
- [x] 1.15 Add `packages/web/test/studio-stepSummaries.test.ts` and `studio-stepRemoval.test.ts` per D9. Run the full gated suite in the foreground. Read its verdict off the named tests; `studio-panels-literal-text.test.ts` stays green.

## 2. The Steps tab's grid and the unnamed-step fallbacks (studio-step-page)

- [x] 2.1 In `screens/EditScreen.tsx`, make `stepsTab` read `"22rem minmax(0, 1fr)"` and, under `NARROW`, rows `"auto auto"`, per D6. Rewrite the comment above it.
- [x] 2.2 In `EditScreen.tsx`'s `walkNeighbour` and in `StepsRail.tsx`'s row label, read `stepText(step, contentLocale, baseLocale)` in place of the label-else-key chain, per D11.
- [x] 2.3 In `packages/web/test/studio-guidedSurfaceStyle.test.ts`, assert the page's `overflowY` pair and the grid's two values per D9. In `studio-stepsRail.test.tsx`, assert an unnamed step's row reads "(unnamed step)" and not its key.
- [x] 2.4 In `studio-stepPage.test.tsx`, assert an unnamed next neighbour reads "Next: (unnamed step)". Run the full gated suite in the foreground.

## 3. Docs, glossary and roadmap

- [x] 3.1 Apply D10's four glossary edits to `.claude/rules/ui-glossary.md`. Run `antislop check` on it; add no finding.
- [x] 3.2 In `docs/authoring-guide.md`, make sections 4 to 7 name the sections as the headers read. Section 7 says "Who acts".
- [x] 3.3 In `docs/browser-checks.md`, add the entry D10 names. It holds the checks of 4.7 to 4.10. Rewrite the four stale passages D10 lists by line range.
- [x] 3.4 In `docs/decisions.md`, move RAIL-6, RAIL-7, SENTENCE-7, SELECTS-1 and SELECTS-2 to `docs/decisions-archive.md` word for word. Give each a resolution line naming this change.
- [x] 3.4a Add the resolution line to the "Remove step and the field catalog's Remove field trigger" entry, per D10. Add one to KEYFOLLOW-11 too.
- [x] 3.4b Re-point SELECTS-9 and SELECTS-10 to change 11. Add the section "Open from studio-step-accordion".
- [x] 3.5 In `ROADMAP.md` stage 64, append "Shipped 2026-11-01." to item 10. Make the status line read "CHANGES 1, 2, 3, 4, 6, 7, 8, 9 AND 10 DONE, REST NOT STARTED".
- [x] 3.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host over the touched Markdown. Read its exit code.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [x] 4.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [x] 4.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, with `OPENSPEC_TELEMETRY=0`.
- [x] 4.4 Read the pass, skip and fail counts off that run. Name any failing test. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [x] 4.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [x] 4.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [x] 4.7 On the production bundle, open a `purchase_requisition` draft's Steps tab at 1440px. A task step shows six headers in D1's order, one open, each a button with `aria-expanded`.
- [x] 4.7a Press a closed header. It opens and the open one closes. Press it again. None stands open. Tab order runs masthead, headers, open body, walk.
- [x] 4.7b Open a subprocess step and an end step. The headers read per D1. Open More: the Developer view stands last, closed, and prints the key only once opened.
- [x] 4.8 Add a task step from the rail's foot. Ways out stands open with a badge reading 1. Who acts reads "Nobody in particular" in slate, carries the word To do and no Done mark.
- [x] 4.8a Set an assignment. The Who acts header shows the Done mark and the strategy's name in ink.
- [x] 4.9 Press Remove this step on a step two ways out lead to. The dialog names the step, counts two ways out leading here, and Cancel holds the focus. Escape returns focus to the control. Confirm removes the step and focus lands on the rail's current row.
- [x] 4.10 At 420px, the rail stands above the page capped at 20rem. The page has no scroll box of its own: `getComputedStyle` reads `overflow-y: visible` on it. At 1024px the condition builder's row wraps inside the page column, and no control clips or runs under the rail.
- [x] 4.11 Run `/impeccable critique` and `/impeccable audit` on `/studio/processes/<id>/edit/steps`. Run `impeccable detect --json` on the changed files, since the app's CSP blocks the overlay.
- [x] 4.12 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect every flow to pass.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Push, open the PR, and merge on green CI.
