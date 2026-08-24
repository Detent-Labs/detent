## Why

The edit screen's own nav ("Back to processes", "Versions", "Player" in
`EditScreen.tsx`) navigates away from an open draft immediately. So does the
studio area's top-level "Processes"/"Tools"/"Templates" tabs (`root.tsx`).
Neither checks for unsaved changes first. `EditorArea`'s `saveState`/`draft`
live only in React state until an explicit Save call.

Navigating away unmounts `EditScreen`, and the in-memory edits vanish with
no way back. The toolbar's own Publish and Discard controls already guard a
destructive action with `confirm(t(...))`
(`draftToolbar.publishConfirmSave`, `draftToolbar.discardConfirm`). Leaving
the screen has no equivalent guard, even though it is just as destructive.

## What Changes

- Add an unsaved-changes confirmation before any navigation away from the
  edit screen while the draft is dirty (`isDirty(draft, savedBody)`). This
  covers the edit screen's own "Back to processes", "Versions" and "Player"
  links. It also covers the studio area's top-level "Processes", "Tools"
  and "Templates" tabs.
- Confirming proceeds with the navigation. The navigation loses the
  in-memory edits, the same way an explicit Discard already loses them.
  Canceling stays on the edit screen with the draft untouched.
- A clean draft (nothing to lose) navigates exactly as it does today, with no
  prompt.
- Out of scope: browser-level navigation (Back button, tab close, address-bar
  navigation) and any autosave mechanism. This proposal only guards the
  in-app links that already exist.

## Capabilities

### Modified Capabilities
- `studio-app`: leaving the edit screen (its nav or the studio area's
  top-level tabs) now prompts for confirmation before navigating away. This
  applies whenever the draft carries unsaved changes, instead of
  discarding silently.
- `studio-player`'s "Player is one of the edit screen's togglable surfaces"
  requirement made a guarantee. Unsaved edits previously survived any round
  trip to Player. That guarantee now holds only for a clean draft. The same
  `studio-app` prompt guards an unsaved draft and discards it on
  confirmation. This reconciles the requirement with the behavior this
  proposal ships.

## Impact

- `packages/web/src/areas/studio/screens/EditScreen.tsx`: report the open
  draft's dirty state upward via a new optional prop. It carries no guard
  logic of its own. Its three screen-nav links already call the `navigate`
  prop they receive, and that prop carries the guard one level up.
- `packages/web/src/areas/studio/root.tsx`: hold the reported dirty state,
  and guard `navigate` once at the point it's created. This covers both the
  top-level tabs and the `navigate` prop handed down to `EditScreen`.
- `packages/web/src/i18n/catalogs/studio.ts`: one new confirmation string.
- No server, schema, or definition-contract impact.
