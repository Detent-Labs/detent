# Tasks

## 1. The frame (spa-accessibility, studio-app)

- [ ] 1.1 Add `panels/shared/btn.ts` with `btn` and `ghost` per design D10. Move `ChangeList.tsx`, `FormTabStrip.tsx`, `FormEditorScreen.tsx` and `EditScreen.tsx` onto it. Check with the typecheck.
- [ ] 1.2 Give `ToolsScreen.tsx`, `PlayerScreen.tsx` and `VersionsScreen.tsx` the helper on their back controls, per D10. A source test pins that no studio file writes a literal `.btn` beside `stylex.props`.
- [ ] 1.3 Add `panels/shared/dialogFocus.ts` with `wrapTarget`, `dialogFocusables` and `activeControl` per D3 and D4. Add `packages/web/test/studio-dialogFocus.test.ts` for `wrapTarget` at both ends, from outside the list, and with an empty list.
- [ ] 1.4 Add `panels/shared/StudioDialog.tsx` with the parts of D1, the layout of D2, and the hook of D3 and D4. Delete `panels/shared/confirmDialog.tsx`.
- [ ] 1.5 Add the catalog keys `dialog.cancel` and `dialog.noUndo`.
- [ ] 1.6 Add `packages/web/test/studio-studioDialog.test.tsx`. Assert the label, the description, the `autofocus` on Cancel, the order of the parts, a count in mono, no row at zero, no `dl` with no row, and the refusal outside the description.
- [ ] 1.7 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 2. The dialogs that exist (studio-app, studio-publish, environment-promotion)

- [ ] 2.1 Rebuild `RemoveStepDialog.tsx`, `KindSwitchDialog.tsx` and `RemoveDataSourceDialog.tsx` on the frame. Drop the Step row, and move the source's name into the heading per D8. Extend their tests.
- [ ] 2.2 Add `panels/DiscardDraftDialog.tsx`. Move the publish dialog onto the frame in `ProcessHeaderBar.tsx`, with its heading from D7. Drop the discard revision and its catalog use. Extend `studio-processHeaderBar-publishGate.test.tsx` and `studio-processSurface.test.ts`.
- [ ] 2.3 Add a `discarding` flag to `useDraftToolbarActions` so the discard dialog disables its controls during the request. Read it in the header bar's `busy`.
- [ ] 2.4 Move `StartPickerDialog` and `PromotionPreviewDialog` onto the frame in `ProcessesScreen.tsx`, with ref openers for + New process and Import. Move their literals into the catalog. Move the key, the id and the hash into the Developer view per D7. Add a static test for both.
- [ ] 2.5 Rebuild `RemoveFieldDialog.tsx` on the frame with a `names` prop per D8, without the key. Its full names rows arrive in group 3.
- [ ] 2.6 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 3. Remove field names its reach (studio-app)

- [ ] 3.1 Add `sites` to `FieldRemovalReach` per D8. Track the JSON path in the walk. Extend `studio-fieldRemoval.test.ts` with one case per kind, and one that a taken-along expression leaves no site.
- [ ] 3.2 Refactor `readByRows.ts` so `readByPlaces` and `readByRows` read one `placeOf`. `studio-readByRows.test.ts` stays green unchanged.
- [ ] 3.3 Add `panels/removalNames.ts` and its catalog keys per D8. Add `studio-removalNames.test.ts` with one case per term and writer position, duplicate places, and a group.
- [ ] 3.4 Call `removalNames` once per press in `EntityTabs.tsx`'s `requestRemove`, and pass it to `RemoveFieldDialog`. Reword the notes per D8. Extend `studio-removeFieldDialog.test.tsx`: names print, no key and no "CEL" prints.
- [ ] 3.5 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 4. The prompts convert (studio-app, studio-canvas)

- [ ] 4.1 Add `panels/confirmations.tsx` with the seven components of D6 and the sentences of D7. Remove each prompt's old catalog key. Add `studio-confirmations.test.tsx` with each heading, body and confirm label.
- [ ] 4.2 Convert `root.tsx` per D5. Extend the source test that covers the guards.
- [ ] 4.3 Convert `EditScreen.tsx`'s Arrange and restore per D6, with the openers of D4.
- [ ] 4.4 Convert `FieldCatalogPanel.tsx`'s `changeKind` and `toggleTechnical` per D6. Rewrite the comment in `field-usage.ts`.
- [ ] 4.5 Convert `ProcessesScreen.tsx`'s discard onto `DiscardDraftDialog`, with the refusal inside it and the focus landing of D4. Add a name link id on the row.
- [ ] 4.6 Convert `TemplatesScreen.tsx`'s delete and replace per D6, naming a template by `templateDisplayName`, with the landings of D4.
- [ ] 4.7 Rewrite `studio-no-confirm.test.ts` to walk `src/areas/studio`, per D11. It fails on a planted `confirm(` in a fixture string and on a second `<dialog` site.
- [ ] 4.8 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 5. A real browser, and the docs (spa-accessibility)

- [ ] 5.1 Add `e2e/dialog.e2e.ts`. On a dirty draft's Publish dialog: Tab repeatedly, and `document.activeElement` stays inside the dialog. Click a fact's text, press Tab, and it stays inside. Press Escape, and the Publish control holds the focus. Press the back control on the dirty draft: "Leave this draft?" opens, Cancel keeps the draft, and the confirm leaves.
- [ ] 5.2 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Install Chromium once if the pod lacks it. Expect every flow to pass.
- [ ] 5.3 Rewrite the "Dialogs" entry in `DESIGN.md`, and its `design-language.md` mention, per D1 and D2. Add a `dialog` row to `.claude/rules/ui-glossary.md`.
- [ ] 5.4 Update `docs/browser-checks.md`: the entries that dismiss a native prompt, and the Tab and focus entries. Add an entry "One dialog form" naming what stays manual: the 420px gutter, the sticky footer at 1024 by 600, and the account menu's focus return.
- [ ] 5.5 Move the closed entries of `docs/decisions.md` word for word to `docs/decisions-archive.md`: the keyboard hold, the presentation gaps, the six prompts, ACCORDION-17, HEADER-7, FIELDCARD-25, FIELDS-21, FIELDS-22 and NAMES-6. Narrow "The process list's literal strings" to what stays.
- [ ] 5.6 Rewrite the comments that name the old hook or the native prompt: `git grep -n -E "useConfirmDialog|native prompt|browser's own confirm" -- packages/web/src packages/web/test` prints nothing that states a stale fact.
- [ ] 5.7 Run the full gated suite in the foreground. Read its verdict off the named tests.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 6.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 6.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test` with `DATABASE_URL` set by the pod.
- [ ] 6.4 Read the pass, skip and fail counts off that run. Name any failing test. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [ ] 6.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 6.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 6.7 On the production bundle, open each dialog of D7 once. Read the heading, the confirm label and the opening focus. Cancel it and read `document.activeElement`.
- [ ] 6.8 Press Tab through the Publish dialog with its Developer view closed, then open. Read every stop. No stop is `body`.
- [ ] 6.9 At 420px, measure the gutter on a dialog. Below 30rem, facts stack. At 1024 by 600, the IT Offboarding group's removal keeps its heading and Cancel on screen.
- [ ] 6.10 Leave a dirty draft through the area nav, the back control, the account menu's profile entry and logout. Decline each: the focus returns. Confirm one.
- [ ] 6.11 Run `/impeccable critique` and `/impeccable audit` on the dialogs. Run `impeccable detect --json` on the changed files, since the app's CSP blocks the overlay.
- [ ] 6.12 Read `git grep -n "confirm(" -- packages/web/src/areas/studio`. Only comments and `onConfirm(` remain.

## Workflow follow-up

- Run `openspec-verify-change`, sync the specs, and archive.
- Update stage 64's status line in `ROADMAP.md`.
- Merge the newest `origin/main`, push, open the PR, and merge on green CI.
