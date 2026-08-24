## Why

The edit screen's own nav ("Back to processes", "Versions", "Player" in
`EditScreen.tsx`) and the studio area's top-level "Processes"/"Tools"/
"Templates" tabs (`root.tsx`) navigate away from an open draft immediately,
with no check for unsaved changes. `EditorArea`'s `saveState`/`draft` live
only in React state until an explicit Save call; navigating away unmounts
`EditScreen` and the in-memory edits are gone with no way back. The toolbar's
own Publish and Discard controls already guard a destructive action with
`confirm(t(...))` (`draftToolbar.publishConfirmSave`,
`draftToolbar.discardConfirm`); leaving the screen has no equivalent guard
even though it is just as destructive.

## What Changes

- Add an unsaved-changes confirmation before any navigation away from the
  edit screen while the draft is dirty (`isDirty(draft, savedBody)`):
  the edit screen's own "Back to processes", "Versions" and "Player" links,
  and the studio area's top-level "Processes", "Tools" and "Templates" tabs.
- Confirming proceeds with the navigation and the in-memory edits are lost,
  the same way an explicit Discard already works. Canceling stays on the
  edit screen with the draft untouched.
- A clean draft (nothing to lose) navigates exactly as it does today, with no
  prompt.
- Out of scope: browser-level navigation (Back button, tab close, address-bar
  navigation) and any autosave mechanism — this change only guards the
  in-app links that already exist.

## Capabilities

### Modified Capabilities
- `studio-app`: leaving the edit screen (its own nav, or the studio area's
  top-level tabs) while the draft carries unsaved changes now prompts for
  confirmation before navigating away, instead of discarding silently.
- `studio-player`: its "Player is one of the edit screen's togglable
  surfaces" requirement previously guaranteed unsaved edits survive any
  round trip to Player. That guarantee now holds only for a clean draft;
  an unsaved draft is guarded by the same `studio-app` prompt and discarded
  on confirmation, reconciling the requirement with the behavior this
  change ships.

## Impact

- `packages/web/src/areas/studio/screens/EditScreen.tsx`: report the open
  draft's dirty state upward via a new optional prop. No guard logic of its
  own — its three screen-nav links already call the `navigate` prop they're
  given, and that prop is guarded one level up.
- `packages/web/src/areas/studio/root.tsx`: hold the reported dirty state,
  and guard `navigate` once at the point it's created, covering both the
  top-level tabs and the `navigate` prop handed down to `EditScreen`.
- `packages/web/src/i18n/catalogs/studio.ts`: one new confirmation string.
- No server, schema, or definition-contract change.
