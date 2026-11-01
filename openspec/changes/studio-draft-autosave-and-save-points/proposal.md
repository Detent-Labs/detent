# Proposal

## Why

An author saves by hand today. The header bar reads "Unsaved changes" most of
the time. Every exit asks a question, and the move to the Player does too. The
owner chose D6 option 6c on 2026-10-30. The draft saves itself, and named save
points give the author a place to come back to. The studio has no undo, so a
save point also covers part of that gap.

## What Changes

- A debounced `PUT /drafts/:processId` follows each change to the body or the
  layout. The state line reads "Saving…", then "Saved just now". After a minute
  it reads "Saved at" and a time.
- **BREAKING** (studio UI): the header bar's Save control goes. A failed save
  raises a banner with "Try again", and the state line reads "Unsaved changes".
- A 409 behaves as it does today: the conflict banner and Reload. Automatic
  saves stop until the author reloads.
- Every exit saves first and leaves with no question. The leave dialog stands
  only where that save fails. The browser's own prompt stays for a tab close or
  a reload while a change has not landed.
- Publish no longer saves first. Pressing Publish hurries a waiting save, and
  the dialog's confirm waits for its answer. A failed save closes the dialog,
  and the banner reports it.
- Test reaches the Player with no prompt, and the Player's run holds the
  author's latest work.
- The Player's two create buttons name their runs. The filled one tests the
  draft, and the outlined one starts a case from the published version. This
  closes HEADER-4.
- A draft holds named save points, on a new Settings view and through four new
  routes beside the draft routes. Naming one copies the persisted draft.
- Restoring a save point first keeps the current work as another save point.
- Discarding a draft removes its save points, and the dialog says so.
- A restore notice holds automatic saves until the author answers it. No save
  then deletes the kept copy behind the author's back.

## Capabilities

### New Capabilities

None. Save points belong to the draft (`process-drafts`) and its screen
(`studio-app`).

### Modified Capabilities

- `process-drafts`: the save point table, its module functions and its routes.
- `studio-app`: automatic saving, the leave rule, the restore notice's hold and
  the conflict rule's words. Also the discard dialog and the Save points view.
- `studio-publish`: the dialog waits for the save instead of chaining one.
- `studio-player`: the two create buttons' names and the guard's new words.
- `studio-process-tabs`: Save and its focus rule leave the header bar. Try
  again takes the focus rule. The Settings sub-row and the `⋮` menu each gain
  an entry.
- `studio-canvas`: the state line's words and the back control's scenario.
- `studio-form-editor`: "Save, Discard and Publish" no longer describes what
  persists.
- `studio-json-view`: the hook's list of acts drops `save`.

## Impact

- `src/engine/store.ts`, `src/engine/drafts.ts` and a new
  `src/engine/draft-save-points.ts`.
- `src/http/studio-routes.ts` and `src/http/server.ts` gain the routes.
- `src/schema/definition.ts` stays as it is. Save points stand outside the body
  and the hash.
- `packages/web/src/areas/studio`, in `panels/`: `DraftToolbar.tsx`,
  `ProcessHeaderBar.tsx`, `SettingsTab.tsx`, `confirmations.tsx`,
  `DiscardDraftDialog.tsx`, `shared/StudioDialog.tsx`, and a new
  `SavePointsPanel.tsx`.
- The same area, in `screens/`: `EditScreen.tsx`, `PlayerScreen.tsx`,
  `draftToolbarState.ts`, and a new `draftAutosaveLogic.ts`.
- The same area, at its root: `root.tsx`, `routing.ts`, `api/client.ts` and
  `api/types.ts`.
- The studio catalog, `.claude/rules/ui-glossary.md`, `docs/authoring-guide.md`,
  `docs/browser-checks.md`, `docs/decisions.md`, `docs/current-state.md` and
  `ROADMAP.md`.
- `scripts/e2e.ts` seeds a second draft, and `e2e/` gains a flow file.
- `docs/openapi.yaml` excludes `drafts/*` by name, so it stays as it is.
- The new table bootstraps with `CREATE TABLE IF NOT EXISTS`, as every table
  does. No dependency moves.
