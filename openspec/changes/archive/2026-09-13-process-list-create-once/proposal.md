## Why

An author presses "Create draft" on a published process's row. The screen
reads the published version and writes the draft. Only then does it open the
edit screen. The button stays enabled for that whole wait.

Measured 2026-09-13 during a slow navigation, a second press sent a second
`PUT /drafts/:processId`. The stored revision moved ahead of the open editor.
The editor's first save then answered 409 with the draft conflict message. The
author has to reload and redo the edit. `docs/decisions.md` records this as
FORMS-10, together with the fix the owner approved.

## What Changes

- A press on a row's "Create draft" holds that row's button disabled until
  the edit screen opens. A second press during the wait sends no second write.
- A failed seed read or a failed draft write enables the button again. The
  author reads the error banner and can press once more.
- Each row keeps its own hold. A write in flight on one row leaves every other
  row's button enabled.
- A small pure helper in the screen's logic module owns the hold, with a
  `bun:test` suite beside the existing process list tests.
- `docs/browser-checks.md` gains a double-press check on a slowed network.
  `docs/decisions.md` drops FORMS-10.
- The "+ New process" start picker stays as it is. It closes before its write,
  so a second write needs a second, deliberate pick.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: one ADDED requirement, "A process row writes one draft per
  press". The two base requirements on the process list keep their text.

## Impact

- `packages/web/src/areas/studio/screens/processListLogic.ts`: a new exported
  helper that runs one write per key at a time.
- `packages/web/src/areas/studio/screens/ProcessesScreen.tsx`: `createDraft`
  runs through the helper, and the row's button reads the hold.
- `packages/web/test/studio-processListLogic.test.ts`: a new `describe` block
  for the helper.
- `docs/browser-checks.md`, `docs/decisions.md`, and the seeding entry in
  `docs/current-state.md`.
- No engine code, no HTTP route, no definition contract, no i18n catalog key.
