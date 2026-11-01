<!-- antislop: allow-file synonym-rotation -->
<!-- Why: delete, discard and remove are control labels the UI prints; a Tab stop is a focus position. -->
# Tasks

## 1. The frame (spa-accessibility, studio-app)

- [x] 1.1 Add `panels/shared/btn.ts` with `btn` and `ghost` per design D10. Move `ChangeList.tsx`, `FormTabStrip.tsx`, `FormEditorScreen.tsx` and `EditScreen.tsx` onto it. Check with the typecheck.
- [x] 1.2 Give `ToolsScreen.tsx`, `PlayerScreen.tsx`, `VersionsScreen.tsx` and `MigrationPlanScreen.tsx` the helper on their back controls, per D10.
- [x] 1.2a A source test pins that no studio file writes a literal `.btn` beside `stylex.props`, across line breaks too.
- [x] 1.3 Add `panels/shared/dialogFocus.ts` with `wrapTarget`, `dialogFocusables` and `activeControl` per D3 and D4.
- [x] 1.3a Add `packages/web/test/studio-dialogFocus.test.ts` for `wrapTarget` at both ends, from outside the list, and with an empty list.
- [x] 1.4 Add `panels/shared/StudioDialog.tsx` with the parts of D1, the layout of D2, and the hook of D3 and D4. Its scroll padding satisfies `studio-scrollBoxRingRoom.test.ts`.
- [x] 1.5 Add the catalog keys `dialog.cancel` and `dialog.noUndo`.
- [x] 1.6 Add `packages/web/test/studio-studioDialog.test.tsx`. Assert the label, the description, the `autofocus` on Cancel and the order of the parts.
- [x] 1.6a In that file, assert a count in mono, a mono fact printing 0 and no row at zero. Assert no `dl` with no row, an array of zero counts included. Assert the refusal renders after the body closes.
- [x] 1.7 Run `bun run typecheck` and the full gated suite in the foreground. Read its verdict off the named tests.

## 2. The dialogs that exist (studio-app, studio-publish, environment-promotion)

- [x] 2.1 Rebuild `RemoveStepDialog.tsx`, `KindSwitchDialog.tsx` and `RemoveDataSourceDialog.tsx` on the frame. Drop the Step row, and move the source's name into the heading per D8. Extend their tests. Remove the catalog keys this retires, per D7 and D8.
- [x] 2.2 Add `panels/DiscardDraftDialog.tsx`. Move the publish dialog onto the frame in `ProcessHeaderBar.tsx`, with its heading from D7. Drop the discard revision and its catalog use. Remove the catalog keys this retires.
- [x] 2.2a Move `RefusalDetail` so the frame and the header bar's banner share it. Give `PublishChanges.tsx` the `DialogFact` row, and remove its `listBox` height and scroll.
- [x] 2.2b Make `runMenuAction` focus the `⋮` trigger first, per D4. Extend `studio-processHeaderBar-publishGate.test.tsx`, `studio-processSurface.test.ts` and `studio-publishChanges.test.ts`.
- [x] 2.2c In the publish-gate test's Languages case, point `plainRow` at the `>Process</dt>` row, which stays a written-face `DialogFact`.
- [x] 2.3 Add a `discarding` flag to `useDraftToolbarActions` so the discard dialog disables its controls during the request. Read it in the header bar's `busy`. Add it to the `noActions` fixture in the publish-gate test.
- [x] 2.4 Move `StartPickerDialog` and `PromotionPreviewDialog` onto the frame in `ProcessesScreen.tsx`, with ref openers for + New process and Import. Move their literals into the catalog. Move the key, the id and the hash into the Developer view per D7. The import's Process fact falls back per D7, and its refusal keeps `pre-line`. Add a static test for both.
- [x] 2.5 Rebuild `RemoveFieldDialog.tsx` on the frame with an optional `names` prop per D8, without the key. Its full names rows arrive in group 3. Update `studio-removeFieldDialog.test.tsx` for the frame.
- [x] 2.6 Delete `panels/shared/confirmDialog.tsx`, now that its last consumer moved. Replace its `FILES` entry in `studio-no-confirm.test.ts` with `panels/shared/StudioDialog.tsx`.
- [x] 2.7 Run `bun run typecheck` and the full gated suite in the foreground. Read its verdict off the named tests.

## 3. Remove field names its reach (studio-app)

- [x] 3.1 Add `sites` to `FieldRemovalReach` per D8. Track the JSON path in the walk. Extend `studio-fieldRemoval.test.ts` with one case per kind, and one that a taken-along expression leaves no site.
- [x] 3.1a Narrow `NONE` in that test to `Omit<FieldRemovalReach, "field" | "sites">`. Widen `hasReach` to take `Omit<FieldRemovalReach, "sites">`. Give the dialog test's `reach()` empty `sites`.
- [x] 3.2 Refactor `readByRows.ts` so `readByPlaces` and `readByRows` read one `placeOf`. `studio-readByRows.test.ts` stays green unchanged.
- [x] 3.3 Add `panels/removalNames.ts` and its catalog keys per D8. Add `studio-removalNames.test.ts` with one case per term and writer position, duplicate places, and a group.
- [x] 3.4 Call `removalNames` once per press in `EntityTabs.tsx`'s `requestRemove`, and pass it to `RemoveFieldDialog`. Make `names` required, and reword the notes per D8. Remove the keys this retires.
- [x] 3.4a Extend `studio-removeFieldDialog.test.tsx`: names print, and no key and no "CEL" prints. Its header comment stops quoting the removed requirement.
- [x] 3.5 Run `bun run typecheck` and the full gated suite in the foreground. Read its verdict off the named tests.

## 4. The prompts convert (studio-app, studio-canvas)

- [x] 4.1 Add `panels/confirmations.tsx` with the seven components of D6 and the sentences of D7. Remove each prompt's old catalog key. Add `studio-confirmations.test.tsx` with each heading, body and confirm label.
- [x] 4.2 Convert `root.tsx` per D5. Update `studio-leave-guard.test.ts`: pin `askLeave`'s dirty read, and each wrapper's callee inside its `proceed`, with its mutation cases.
- [x] 4.3 Convert `EditScreen.tsx`'s Arrange and restore per D6, with the openers and landings of D4.
- [x] 4.3a Update `studio-stash-wiring.test.ts` to `askRestore`, keeping its `requestRunning` pin and its mutation. Drop the removed key from `studio-restoreNotice.test.tsx`.
- [x] 4.4 Convert `FieldCatalogPanel.tsx`'s `changeKind` and `toggleTechnical` per D6, with `visible` passed down. A hide clears each pending state. `FieldCatalogPanel` writes `visible = true`, so its static test still types. Rewrite the comment in `field-usage.ts`.
- [x] 4.5 Convert `ProcessesScreen.tsx`'s discard onto `DiscardDraftDialog`, with the refusal inside it and the focus landing of D4. Add a name link id on the row.
- [x] 4.5a Hold a `discarding` state beside `importing`, and pass it as `busy`. The dialog closes only after the `DELETE` answers. The row landing runs after `load()`.
- [x] 4.6 Convert `TemplatesScreen.tsx`'s delete and replace per D6, naming a template by `templateDisplayName`, with the landings of D4.
- [x] 4.7 Rewrite `studio-no-confirm.test.ts` to walk `src/areas/studio`, per D11. It fails on a planted `confirm(` in a fixture string and on a second `<dialog` site.
- [x] 4.8 Run `bun run typecheck` and the full gated suite in the foreground. Read its verdict off the named tests.

## 5. A real browser, and the docs (spa-accessibility)

- [x] 5.1 Add `e2e/dialog.e2e.ts`. On a dirty draft's Publish dialog, Tab repeatedly: `document.activeElement` stays inside the dialog. Click a fact's text and press Tab: it stays inside. Press the backdrop: the dialog stays. Press Escape: the Publish control holds the focus.
- [x] 5.1a In that file, press the back control on the dirty draft. "Leave this draft?" opens, Cancel keeps the draft, and the confirm leaves.
- [x] 5.1b In `e2e/publish.e2e.ts`'s refused flow, expect Cancel to hold the focus after the refusal.
- [x] 5.2 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Install Chromium once if the pod lacks it. Expect every flow to pass.
- [x] 5.3 Rewrite the "Dialogs" entry in `DESIGN.md`, and its `design-language.md` mention, per D1 and D2. Its Hierarchy line says a dialog heading takes Headline as an `h2`.
- [x] 5.3a Add a `dialog` row to `.claude/rules/ui-glossary.md`, and add the import preview to its Developer view row. Narrow its sentence on a refused publish's Developer view to the Publish dialog and the banner.
- [x] 5.4 Update `docs/browser-checks.md`: the Tab and focus entries, and each hit of the pattern `native prompt|browser's confirm|accept the confirm|dialog-accept`. Admin's entries stay.
- [x] 5.4a Add an entry "One dialog form" there. It names what stays manual: the 420px gutter, the sticky footer at 1024 by 600, and the account menu's focus return.
- [x] 5.5 Move the closed entries of `docs/decisions.md` word for word to `docs/decisions-archive.md`. They are the keyboard hold, the presentation gaps, the six prompts, ACCORDION-17, HEADER-7, FIELDCARD-25, FIELDS-21, FIELDS-22 and NAMES-6.
- [x] 5.5a Narrow three entries to what stays. They are "The process list's literal strings", the `.btn-ghost` entry citing a dialog's Cancel, and HEADER-4. Record that `StepPage.tsx`'s two dialogs can still stand modal in a hidden tab body.
- [x] 5.6 Rewrite the comments that name the old hook or the native prompt: `git grep -n -E "useConfirmDialog|native prompt|browser's own confirm|counts each kind of reach" -- packages/web/src packages/web/test` prints nothing that states a stale fact.
- [x] 5.7 Run `bun run typecheck` and the full gated suite in the foreground. Read its verdict off the named tests.

## 6. The review wave (studio-app, studio-canvas, spa-accessibility)

- [x] 6.1 In the open hook of `StudioDialog.tsx`, set `scrollTop` to 0 after the focus call, since `scrollKeyboardFocusIntoView` runs on that focus.
- [x] 6.2 Replace `100vw - 32px` with `100% - 32px` in the frame's width. A classic scrollbar then keeps the gutter.
- [x] 6.3 Rewrite the comments that say React's `autoFocus` moves the focus before the effect. A focus inside a closed dialog does nothing. `autoFocus` serves the markup alone.
- [x] 6.4 Give `DialogNames` the fold of "A long dialog keeps its controls in view", with one catalog key `dialog.moreNames` ("and {count} more"). Test 8 names unfolded, and 9 as 5 plus "and 4 more".
- [x] 6.5 Print `aria-describedby` only where a `confirm` is present. Test the start picker carries none.
- [x] 6.6 Reword `KindDropDialog` per D7's table, with the old and new kind names passed from `KindPicker`. Fall back to the heading "Change the kind of “{field}”?" where the old kind has no name.
- [x] 6.7 Reword `processList.importNote` per D7. Rename `dialogError` in `ProcessesScreen.tsx` to what it styles.
- [x] 6.8 Call `clearError()` at the top of `runPublish` and `runDiscard`, so a repeated refusal scrolls and announces again. Pin it.
- [x] 6.9 Run `fieldsInside` and `columnMappings` through `numberRepeats` in `removalNames.ts`, so two fields sharing a label stay two lines. Test it.
- [x] 6.10 Guard `newProcess` in `ProcessesScreen.tsx`: no second dialog opens while one is pending. Pin it.
- [x] 6.11 Pass `visible` into `StepPage`, and clear `removing` and `pendingKind` during the render that hides it. Close DIALOG-1 in `docs/decisions.md`.
- [x] 6.12 Add `canvas.removeStepsHeading` and `RemoveStepsDialog` per the `studio-canvas` delta. Route the canvas bar's two controls through it and `RemoveStepDialog`, with the landing of D4. Test the words.
- [x] 6.13 Fix `studio-leave-guard.test.ts`'s two lint warnings with `startsWith` and `endsWith`. `bun run lint` exits 0.
- [x] 6.14 Delete the `refusalSlot` assertion, and narrow the comment in `studio-dialogFocus.test.ts` to what e2e covers.
- [x] 6.15 Fix the stale comment at `ProcessHeaderBar.tsx`'s dialog section.
- [x] 6.16 In `e2e/dialog.e2e.ts`, after the click on a fact's text, press Shift+Tab and expect Cancel to hold the focus. In `e2e/publish.e2e.ts`'s refused flow, delay the route. Press Escape three times while busy. The dialog stays, and the refusal arrives.
- [x] 6.17 In `DESIGN.md`, say Cancel takes the opening focus unless the dialog commits nothing, and add the fold. Restore the revision and the source hash in the glossary's Developer view row. Say in `docs/browser-checks.md`'s entry to open a long dialog with Enter and to run with scrollbars shown.
- [x] 6.18 Record six points in `docs/decisions.md`. A busy dialog announces nothing. Remove this step counts where Remove field names. No dialog carries `alertdialog`.
<!-- antislop: allow sentence-length -->
<!-- Why: the ticked box counts as a word, and a task keeps its wording once ticked. -->
- [x] 6.18a Record too: an import's refusal keeps server text in the alert, Back under Arrange or Restore, and `activeControl()` on Safari.
- [x] 6.19 Run `bun run typecheck` and the e2e, then the full gated suite in the foreground. Read its verdict off the named tests.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [x] 7.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [x] 7.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test` with `DATABASE_URL` set by the pod.
- [x] 7.4 Read the pass, skip and fail counts off that run. Name any failing test. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [x] 7.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [x] 7.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [x] 7.7 On the production bundle, open each dialog of D7 once. Read the heading, the confirm label and the opening focus. Cancel it and read `document.activeElement`.
- [x] 7.7a Confirm Restore, a template delete and a list discard, and read `document.activeElement` each time. Hide the Fields tab with browser Back under the kind dialog, and no modal stays.
- [x] 7.8 Press Tab through the Publish dialog on a draft with changes since its base. Do it with the change list and Developer view closed, then open. Read every stop. No stop is `body`.
- [x] 7.9 At 420px, measure the gutter on a dialog. Below 30rem, facts stack. Open the IT Offboarding group's removal with Enter at 1024 by 600. Its heading and Cancel stand on screen. At a viewport short enough to overflow, ArrowDown with Cancel focused moves `scrollTop`. A refusal under a long list scrolls into view.
- [x] 7.10 Leave a dirty draft by five routes. They are the area nav, the back control, the `⋮` menu's Versions, the account menu's profile entry and logout. Decline each: the focus returns. Confirm one.
- [x] 7.11 Run `/impeccable critique` and `/impeccable audit` on the dialogs. Run `impeccable detect --json` on the changed files, since the app's CSP blocks the overlay.
- [x] 7.12 Read `git grep -n "confirm(" -- packages/web/src/areas/studio`. Only comments and `onConfirm(` remain. A `git grep` of each key D7 and D8 retire prints nothing.

## Workflow follow-up

- Run `openspec-verify-change`, sync the specs, and archive.
- Update stage 64's status line in `ROADMAP.md`.
- Merge the newest `origin/main`, push, open the PR, and merge on green CI.
