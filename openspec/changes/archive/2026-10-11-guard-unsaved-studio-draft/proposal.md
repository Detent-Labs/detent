# Proposal

## Why

The studio keeps an open draft in React state alone. Three ordinary actions
lose unsaved work without a prompt. An author changes a field label, then opens
"Manage assignment groups for this process". The label is gone. An area switch,
the profile entry or logout in the account menu does the same.

A save that answers 401 after the 8-hour token ends logs the author out. The
studio unmounts and the work is gone. A canvas move, a new group or an edge
style never counts as unsaved. "Back to processes" then leaves silently. The
audit of 2026-10-10 found all three (E1-2, E1-3, E1-4).

## What Changes

- Every exit from an unsaved draft asks first. That covers the groups link of
  the `⋮` menu and the account menu's area switch, profile entry and logout.
  The native prompt and its sentence stay.
- A tab close or reload asks first while the draft has unsaved changes. The
  browser words that prompt.
- A canvas layout change counts as unsaved. The header bar, the leave prompts
  and the Publish dialog share one definition. The body or the layout differs
  from the last save.
- A save applies its answer to the layout that the author has now. A drag
  during a running save survives the answer. A 409 stops rolling the layout
  back.
- A 401 on an unsaved draft keeps body, layout and revision in
  `sessionStorage`, keyed by actor and process. The logout then runs as today.
  When that actor reopens that draft, a notice offers "Restore unsaved
  changes" and "Discard them". Restore keeps the stored revision. A draft saved
  elsewhere meanwhile then ends in the existing conflict banner.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the leave prompt covers the groups link, the account menu and
  tab close. The dirty state includes the layout. A save keeps a layout change
  made while it runs. A 401 keeps an unsaved draft, and the next visit offers a
  restore. The session requirement allows that one storage key. A conflict
  reload resets the saved layout too.
- `unified-shell`: an area may hold the exits of the account menu behind its
  own confirmation. A 401 never asks.

## Impact

- `packages/web/src/areas/studio/`: `root.tsx`, `screens/EditScreen.tsx`,
  `screens/draftSaveLogic.ts`, `screens/draftToolbarState.ts` and
  `panels/DraftToolbar.tsx`. Two new files join them: `draft/draftStash.ts`
  and `panels/RestoreNotice.tsx`.
- `packages/web/src/i18n/catalogs/studio.ts`: four strings for the notice.
- `packages/web/test/`: tests for the dirty helpers, the save logic, the stash,
  the notice and the leave guard.
- `docs/browser-checks.md`: the manual checks. `.claude/rules/ui-glossary.md`:
  one row for the restore notice. `docs/decisions.md`: the audit index entry.
- `openspec/specs/studio-app/spec.md`: the Purpose clause on the session key.
- No engine, API, schema or dependency change. The definition contract stays
  as it is, and `docs/authoring-guide.md` states no rule that this change moves.
- Left out on purpose: re-login in place, a Back step in the page and the
  login's return address.
