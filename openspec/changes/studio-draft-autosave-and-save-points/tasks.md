<!-- antislop: allow-file synonym-rotation one-instruction sentence-length run-ons negation-habit paragraph-length -->
<!-- Why: Discard, Remove and Restore name controls, each task line holds its act and its pass check, and a checked box adds a word. -->

# Tasks

## 1. Save points on the engine

- [x] 1.1 Add `draft_save_points` and its index to `src/engine/store.ts` per design D8. Pass: `test/schema-bootstrap.test.ts` lists the table in its drop list and passes.
- [x] 1.2 Add `lockDraft` and `writeRestoredDraft` to `src/engine/drafts.ts`, then add `src/engine/draft-save-points.ts` per D8. Run each SQL statement in a test. Pass: `test/draft-save-points.test.ts` covers every scenario of the three engine requirements, the publish hash through `publishBody` included.
- [x] 1.3 Make `deleteDraft` remove the points in one transaction with the draft. Pass: a test removes a draft holding two points, and another process's point stays.
- [x] 1.4 Add a test that two concurrent creates at 49 points leave at most 50. Pass: the test fails on a copy of the function with no row lock.

## 2. Save point routes and client

- [x] 2.1 Add the four handlers to `src/http/studio-routes.ts` and dispatch them in `src/http/server.ts` per D9. Pass: `test/draft-save-points.http.test.ts` covers 200, 201, 204, 400, 401, 403, 404 and 409, plus the admin and Developer-list cases.
- [x] 2.2 Add the four calls to `api/client.ts` and their types to `api/types.ts`. A 409 answers `undefined`, as `saveDraft` does. Pass: a client test covers the 409 and the success shapes.
- [x] 2.3 Export `SAVE_TIMEOUT_MS` from `api/client.ts`. Pass `signal: AbortSignal.timeout(SAVE_TIMEOUT_MS)` in `saveDraft` and the three save point write calls. Pass: a client test reads a timed-out call as the `network` error.

## 3. The autosave core

- [x] 3.1 Add `screens/draftAutosaveLogic.ts` with the D1 constants other than `SAVE_TIMEOUT_MS`, `autosaveWait` and `nextDirtySince`. Pass: `bun:test` pins each step of D1's order, the max wait, the backoff, a refused failure's `undefined`, and a send, the saving commit, an answer, a pause and one key giving the debounce wait.
- [x] 3.2 Add the timer effect, `dirtySince`, the failure state, `retry` and `flush` to `useDraftToolbarActions` per D1, D2 and D3. Keep `save` for now. Pass: wiring tests pin each of these, and a mutation on a copy shows a named test fails without the effect's `conflict` guard.
- [x] 3.3 Clear the failure on a clean draft and in `reload`, and clear only the failure's own banner on success, per D2. Pass: named tests fail on a plain `clearError()` and on a lost clean-draft clear.
- [x] 3.4 Add `unconfirmed` and the lost-answer rule of D2. Pass: logic tests cover equal content, differing content, a change made since, a flush after a lost answer, and A lost then B failed.
- [x] 3.5 Add the unmount effect, the `dropped` ref, the `running` promise ref and `keepCopy` of D1. Pass: tests cover a dirty unmount, a running request, a rejected last save, a standing failure and conflict that keep a copy, and each skip.
- [x] 3.6 Rewrite `publish` and `runPublish` per D5, add `PrimaryConfirm`'s `waiting` prop, and remove `publishDialogUnsaved`. Pass: tests pin the waiting markup with Cancel live, `runPublish` holds no `doSave`, and the dirty-gate pins in `studio-draft-toolbar-wiring.test.ts`, `studio-confirmations.test.tsx` and `studio-processHeaderBar-publishGate.test.tsx` flip with their mutations kept.
- [x] 3.7 Hold the timer while the discard dialog stands, and make its `busy` read `discarding || saving`, per D1. Pass: named tests cover both.
- [x] 3.8 Split `adoptDraft` out of `reload`, add `createSavePoint` and `restoreSavePoint` to the hook behind `flush`, add `removeSavePoint` with no flush, and add the pure `keptPointName` of D10. Pass: logic tests cover each row of D10's outcome table, `canPublish` left alone, the Versions offer retired, the selection filtered, a 200-character name and five nested rounds.

## 4. The surface: header bar, leave rule, stash

- [x] 4.0 Seed a second draft in `scripts/e2e.ts` for flows that write. Point `dialog.e2e.ts`'s dirty helper at a stubbed `PUT`, so nothing reaches the server. Its back-control flow stubs a 500, since a dialog now needs a failed save. Move its canvas removal flow to the second draft, along with `draft-autosave.e2e.ts` and the 5.5 flow. Replace the Save assertion at `dialog.e2e.ts:18`. Pass: `bun run e2e` is green, and `publish.e2e.ts` still finds the unedited draft.
- [x] 4.1 Trace every effect that writes the draft or the layout on mount, and fix any that writes on open. Pass: `e2e/draft-autosave.e2e.ts` opens a seeded draft and all six tabs, and counts zero `PUT /drafts/` requests.
- [x] 4.2 Extend `headerStateLine` to the five D6 states. Remove Save from `ProcessHeaderBar.tsx`, take `save` off the returned actions, print the five states, add the hidden `role="status"` and the one-shot timeout of D6, and give the words a minimum width. Pass: `studio-processSurface.test.ts` and static-markup tests pin the bar with no Save, and each state's words and tone. A source pin on the timer holds under an in-memory mutation.
- [x] 4.3 Add Try again to the failure banner, and move `saveFocusTarget` to `{ heldControl, controlGone, focusOnBody }`, per D6. Pass: `studio-draftToolbarState.test.ts` covers a press, a timed retry, a retry answered 409, and a refused retry that keeps the focus.
- [x] 4.4 Under a standing conflict, make Publish move the focus to Reload and open no dialog. Pass: a named test covers it, and e2e stubs a 409 and reads the focus.
- [x] 4.5 Rewrite `askLeave` in `root.tsx` per D4, add `onFlushChange` and `holdSaves` to `EditScreen`, report `dirtyNow || actions.saving` upward, make the dialog's confirm call `drop()`, and rewrite the leave dialog's body. Keep the wrappers' shape. Pass: `studio-leave-guard.test.ts` gains rules for the flush, the one slot, the hold and `drop`, each proved by an in-memory mutation.
- [x] 4.6 Apply the four D7 rules. Pass: named tests cover each scenario of the two stash requirements, and the `onSaved` pins in `studio-stash-wiring.test.ts` flip with their mutation kept.
- [x] 4.7 Add flows to `e2e/draft-autosave.e2e.ts`. An edit saves once and survives a reload. The `PUT` count settles after a label, a drag, an Arrange and a JSON apply, then 5 idle seconds. Back leaves with no dialog. Test reaches the Player with the new label. A stubbed 500 raises the banner and the leave dialog, and it closes the Publish dialog with the focus on Publish. A `PUT` that aborts and then succeeds heals with no press. Pass: `bun run e2e` is green.
- [x] 4.9 Rewrite `formEditor.navigateAwayKeepsChanges` and `formEditor.loadFailed`, delete the unused `panelsScreen.keepsChanges`, and sweep the catalog. Pass: `grep -n -i 'save' packages/web/src/i18n/catalogs/studio.ts` shows no instruction to press or perform a save.

## 5. The Save points view

- [x] 5.1 Add `points` to `SettingsView`, `SETTINGS_VIEWS` and the sub-row. Add the `⋮` entry and `openSavePoints` per D10. Pass: `studio-settingsTab.test.tsx` and the routing tests pin the address and an unknown view's fallback, and tests cover the entry from the JSON surface and from the form editor.
- [x] 5.2 Add `panels/SavePointsPanel.tsx` and its logic per D10: form from the first commit, the rows' waiting line, rows, a row with no display name, empty, bound, failed fetch and kept rows during a refetch, all from the catalog. Use `DESIGN.md`'s register row and field rules. Pass: static-markup tests pin each state, and a test scans the markup for no id, revision or hash.
- [x] 5.3 Add the restore and remove dialogs through `StudioDialog`, with each D10 focus landing and each row of its outcome table. Pass: `studio-no-confirm.test.ts` stays green, and named tests cover both headings, the note, the refusals, the 404 refetch, the three focus cases at the bound and an answer reaching the bound under the focus.
- [x] 5.4 Add the discard dialog's save point note. Pass: `DiscardDraftDialog`'s test covers the header bar and the process list.
- [x] 5.5 Add an e2e flow on the second draft: name a point, change a label, restore, read the old label, restore the kept point, read the new label, remove a point. Pass: `bun run e2e` is green.

## 6. The Player

- [x] 6.1 Rename and refill the two create buttons per D11, through catalog keys. Pass: a static-markup or source test pins both words and which one holds the fill.
- [x] 6.2 Close HEADER-4 in `docs/decisions.md`, moving its reasoning to `docs/decisions-archive.md` word for word. Pass: `git grep -n 'HEADER-4' -- docs/decisions.md` prints nothing.

## 7. Docs

- [x] 7.1 Update `.claude/rules/ui-glossary.md`: the state line, the header bar, the sub-row, the Settings tab, the `⋮` menu and a new *save point* entry. Pass: `git grep -n 'Save stands beside' -- .claude/rules` prints nothing.
- [x] 7.2 Update `docs/authoring-guide.md`: its two Save passages, a save points passage, its Settings sentence and the two Player buttons in section 9. Pass: the prose gate reports no rise on the file.
- [x] 7.3 Sweep `docs/browser-checks.md` for steps that press Save, save the draft, or name a retired label. Rewrite the "Leave this draft?" steps around a failed save. Add one entry "Autosave and save points" holding what stays manual, with a step that waits past the minute for "Saved at". Pass: `git grep -n -i -E 'press(es)? save|save the draft|create (test|new) instance' -- docs/browser-checks.md` prints only non-studio entries, each confirmed by its section.
- [x] 7.4 Record open points in `docs/decisions.md`. Close the entry "The header reads Unsaved changes after a `PUT` that answered 200" only on 4.7's settled count, and otherwise keep it with the new symptom. Pass: the entry stands where that result puts it.
- [x] 7.5 Update `docs/current-state.md` for the new module and the new panel. Pass: `git grep -n 'draft-save-points' -- docs/current-state.md` prints a line.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck` and report the last lines. Pass: exit 0.
- [ ] 8.2 Run `bun run build` and report the last lines. Pass: exit 0.
- [ ] 8.3 Run the full `bun test` with `DATABASE_URL` set through `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, in the foreground. Pass: 0 fail, and no silent-green rejection.
- [ ] 8.4 Run `bun run lint` and `bun run e2e`. Pass: both are green.
- [ ] 8.5 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh`. Pass: both exit 0.
- [ ] 8.6 Run the browser check on the production build, then `/impeccable critique` and `/impeccable audit`, then `impeccable detect --json`. Pass: each scenario reads as observed, and the critique's accepted findings stand fixed.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
- Place each ADDED requirement at its removed predecessor's place during the sync.
- Update the stage 64 status line in `ROADMAP.md`.
- Merge the newest `origin/main`, push, open the PR, and merge on green CI.
