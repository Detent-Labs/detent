## 1. Reach and removal logic

- [x] 1.1 Create `packages/web/src/areas/studio/draft/field-removal.ts` with `fieldRemovalReach` and `hasReach`. Follow design.md, "Reach is one pure walk over the draft". Add `packages/web/test/studio-fieldRemoval.test.ts`. Cover each kind, a group's subtree and one count per expression. Cover an unparseable expression, the config walk and an unknown id. Verify: the new cases pass.
- [x] 1.2 Add `removeFieldAndReferences` to the same module. Follow design.md, "One recipe collects, then cleans, then prunes". Test each reference kind, a nested group with notes and untouched entries of other fields. Test that an emptied `output` and `columnMapping` leave. Test that an emptied `outputMapping` stays, and CEL and configs stay unchanged. Verify: the new cases pass.
- [x] 1.3 In the same test file, run the recipe on `examples/it-offboarding.json`. Remove "Access Excel updated or prepared", then "Processing (Fabrikam)" from a fresh copy. Verify: `runValidation` reports the same issues after each removal as before it.
- [x] 1.4 Add a pure `removalAnnouncement(label, fieldsInside)` to `panels/fieldCatalogLogic.ts`. Add its three sentence keys under `panelsScreen`, with the copy from design.md's shape brief. Verify: cases for zero, one and many fields pass.
- [x] 1.5 Extend the reach cases. A field whose own rule reads its key counts no CEL read. A rule on a view entry the removal takes out counts none either. Cover two groups that share a key, a key-less group and a plugin-typed field's config. Verify: the new cases pass.
- [x] 1.6 Test that removing one of two groups sharing a key keeps the other group's card, members and notes. Verify: the new case passes.
- [x] 1.7 In the same test file, remove "Booking Status" from `examples/expense-approval.json`. Verify: its issues gain exactly two CEL issues, each naming `booking_status`.

## 2. Shared confirmation dialog

- [x] 2.1 Run `/impeccable hooks on` in the apply worktree first. Move `useConfirmDialog` into `panels/shared/confirmDialog.tsx`. Import it back in `panels/ProcessHeaderBar.tsx`, with no markup change. Rewrite its doc comment, which names only the header bar's controls and `pendingDialog`. Verify: `studio-processHeaderBar-publishGate.test.tsx` passes unchanged.
- [x] 2.2 Create `panels/RemoveFieldDialog.tsx` from the shape brief, with its own copy of the header bar's dialog styles. Add its catalog keys under `fieldCatalog`. Add `packages/web/test/studio-removeFieldDialog.test.tsx`. Check the heading per kind, rows only for hits and the key in mono. Check the notes, `aria-labelledby`, Cancel's `autoFocus` and the confirming control's classes. Verify: the new cases pass.

## 3. Fields tab wiring

- [x] 3.1 Add `removeControlId` beside `moveControlId` in `panels/fieldCatalogLogic.ts`. Put it on Remove field in `FieldCatalogPanel.tsx`. Give "Add first field" a stable id. Verify: `studio-fieldCatalogPanel.test.tsx` asserts both ids.
- [x] 3.2 Add `requestRemove` to `FieldsTab` in `panels/EntityTabs.tsx`. With no reach it removes at once, and with reach it opens `RemoveFieldDialog`. Point the hook's trigger ref at Remove field, and clear it before a confirm. Verify: `bun run typecheck` passes in the devcontainer.
- [x] 3.3 Make `removeField` run `removeFieldAndReferences` in one `mutate`. Set the refocus ids from a pure `focusAfterRemove` in `panels/fieldCatalogLogic.ts`, with a case per branch. Write the announcement. Rename the region's label key to `panelsScreen.fieldAnnouncerLabel`. Rewrite the doc comments on `removeField`, the refocus effect, `removeFieldIn` and `neighbourAfterRemove`. Verify: typecheck and the new cases pass, and no test reads the old key.
- [x] 3.4 Extend `packages/web/test/studio-no-confirm.test.ts` to scan `panels/EntityTabs.tsx`. Add `panels/RemoveFieldDialog.tsx` and `panels/shared/confirmDialog.tsx` too. Rewrite the file's header, which says it names two files. Verify: the test passes.

## 4. Documentation

- [x] 4.1 Rewrite the Remove field steps in `docs/browser-checks.md` near lines 1544, 2897 and 2916. Read each field's reach in the example first. Add a walk for "Processing (Fabrikam)" with the dialog, Escape, a confirm, focus and the announcement. Add "Booking Status" on Expense Approval, with its guards reported afterwards. Add the new confirming control to the destructive controls walk. Verify: the prose gate passes for the file.
- [x] 4.2 Rewrite the removal passage in `docs/current-state.md` near line 4324. Name the shared dialog module there too. Verify: the prose gate passes for the file.
- [x] 4.3 In `docs/decisions.md`, remove FIELDS-1. Add the four follow-up entries design.md names. They cover the kept focus after two other removals and two misleading check messages. They also cover checks that run only at publish or never, and a rebound removed key. Rewrite FIELDS-8's Remove field example, which no removal reproduces now. Verify: the prose gate passes for the file.
- [x] 4.4 In `docs/browser-checks.md`, rewrite the walk "Where a confirmation dialog leaves the focus" for the header row. Each dialog opens from its own control on that row. Focus returns to that control after each close. Verify: the prose gate passes for the file.
- [x] 4.5 Add a step to the new removal walk that removes two new unnamed fields in a row. It passes when the live region announces both. Verify: the prose gate passes for the file.

## 5. Browser check and design review

- [ ] 5.1 Run the new and rewritten walks on the production bundle with `playwright-cli`, in a named session. Read the DOM through `run-code` and `page.evaluate`. Rerun the walk "Where a confirmation dialog leaves the focus" for both header bar dialogs. Verify: every walk step records a pass.
- [ ] 5.2 Run `/impeccable critique` and `/impeccable audit` on the Fields tab's removal flow. Fix each finding inside this change's scope. Record the others in `docs/decisions.md`. A finding an open entry already covers goes into that entry. After a fix, rerun the walks 5.1 ran. Verify: both reports exist and every finding has an outcome.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` and then `bun run build` in the devcontainer. Verify: both exit 0.
- [ ] 6.2 Run the full `bun test` with `DATABASE_URL` set, in the devcontainer. Pipe its output through `scripts/gates/silent-green.sh`. Verify: no test fails, and the gate exits 0.
- [ ] 6.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` over the change's range. Run the same range through `scripts/gates/whitespace.sh`. Verify: both gates exit 0, and neither prints "nothing to check" or "SKIPPED".
- [ ] 6.4 In `openspec/specs/studio-app/spec.md`, put a targeted `synonym-rotation` directive with a one-line reason above line 81. Append this delta's four requirements to a scratch copy of that spec. Verify: the copy and the live spec report the same antislop count.
