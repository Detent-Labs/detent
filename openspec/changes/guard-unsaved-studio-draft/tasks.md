# Tasks

## 1. The layout counts as unsaved (E1-4)

- [x] 1.1 Add `isLayoutDirty` and `isDraftDirty` to `screens/draftToolbarState.ts`. Test equal layouts in another key order, a moved coordinate and a body-only difference in `studio-draftToolbarState.test.ts`.
- [x] 1.2 Give `applySaveResult` in `screens/draftSaveLogic.ts` a third parameter, the layout the request sent. Pass an updater from its one caller in `panels/DraftToolbar.tsx`. Test a save with no layout change, a save after one, and a 409 in `studio-draftSaveLogic.test.ts`. Verify `bun run typecheck` passes.
- [x] 1.3 Hold `savedLayout` beside `savedBody` in `ProcessSurface`. Pass `savedLayout` and `onSavedLayoutChange` to `useDraftToolbarActions`. Set them after a save and after a reload. Make `dirtyNow` and `runPublish` read `isDraftDirty`. Verify `bun run typecheck` and `studio-processHeaderBar-publishGate.test.tsx` pass.

## 2. Every exit from an unsaved draft asks first (E1-2)

- [x] 2.1 In `root.tsx` add one `confirmLeave` check and use it in `guardedNavigate`. Add `guardedGo` and `guardedLogout`. Pass `guardedGo` to `EditScreen`, `onGoToArea` and `onGoToProfile`. Pass `guardedLogout` to `onLogout`. Leave `onUnauthorized` unwrapped. Verify the test in 2.3 passes.
- [x] 2.2 Add the `beforeunload` listener to `StudioArea`. It calls `preventDefault()` while `dirtyRef.current` is true. The unmount removes it. Verify the test in 2.3 passes.
- [x] 2.3 Add `studio-leave-guard.test.ts` in the source-scan idiom of `studio-no-confirm.test.ts`. It fails when `root.tsx` passes a raw `go` to `EditScreen` or `Chrome`. It also fails when `root.tsx` wraps `onUnauthorized` or lacks a `beforeunload` listener. Verify it fails against a copy of `root.tsx` with the raw `go` restored.

## 3. A 401 keeps the unsaved work for a restore (E1-3)

<!-- antislop: allow synonym-rotation -->
<!-- Discard them and Discard draft are two controls; the process surface is a glossary term. -->
- [x] 3.1 Add `draft/draftStash.ts` with `stashDraft`, `readRestorable` and `clearStash`. Each takes a storage argument. Test a round trip, a second actor, a malformed value, a throwing storage, and an equal stash that `readRestorable` clears, in `studio-draftStash.test.ts`.
- [x] 3.2 Pass the actor id from `StudioArea` through `EditScreen` to `ProcessSurface`. Wrap `onUnauthorized` there. The wrapper writes the stash of a dirty draft before it calls the callback of the shell. Verify `bun run typecheck` passes.
- [x] 3.3 Add `panels/RestoreNotice.tsx` and its four strings in `i18n/catalogs/studio.ts`. Style it as the warning callout with compiled styles. Show it under the header bar when `readRestorable` returns a stash. Verify `bun run typecheck` passes.
- [x] 3.4 Wire the two buttons. Restore replaces the draft and sets the stored revision and layout. It asks with `confirm` first when the draft is dirty. A restore, "Discard them", a successful save and the Discard draft action clear the stash. After either button focus moves to the open tab. Verify the browser check in 5.4.
- [x] 3.5 Test the notice in `studio-restoreNotice.test.tsx` with static markup: both buttons, `role="status"` and the four catalog strings. Verify the file passes.
- [x] 3.6 Add a "restore notice" row to the process surface table in `.claude/rules/ui-glossary.md`. Verify the term appears once in the file.
- [x] 3.7 Disable both notice buttons while a save or publish runs. Verify `studio-restoreNotice.test.tsx` and `studio-stash-wiring.test.ts` pass.

## 4. Records

- [x] 4.1 Add the manual checks to `docs/browser-checks.md` under the studio. Cover the groups link, each account menu exit and a layout-only change. Cover a drag during a slow save and a tab close. Cover a 401 on save with a restore. Cover a Discard draft after a drag, with no native prompt. Verify each check names its route and its pass condition.
- [x] 4.2 Reword the clause on the session key in the Purpose paragraph of `openspec/specs/studio-app/spec.md`. It still names `session.ts` and a key of its own. Verify with the prose gate that the file count does not rise.
- [x] 4.3 Strike the `guard-unsaved-studio-draft` entry from the audit index in `docs/decisions.md`. Verify with `git grep guard-unsaved-studio-draft docs/decisions.md` that nothing remains.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and `bun run build`. Verify both exit 0.
- [x] 5.2 Run the full `bun test` with DATABASE_URL set, through `scripts/test-gated.sh`. Verify zero failures and a skip count at or under the floor.
- [x] 5.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh`. Verify both exit 0.
- [ ] 5.4 Check the production build in a real browser. Verify that every exit prompts on an unsaved draft and none prompts on a clean one. Verify the 401 restore works end to end. Run `/impeccable critique` and `/impeccable audit` on the notice.
