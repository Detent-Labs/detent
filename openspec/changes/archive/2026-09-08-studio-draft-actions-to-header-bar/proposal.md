## Why

The process owner reviewed the shipped `studio-guided-surface` layout. They
flagged Save, Discard draft and Publish. Sitting in the studio's area nav,
these three read as part of the app's global chrome. They should read as
controls that belong to the open draft instead.

The request came from a screenshot of the live draft screen. Keep the three
always visible. Do not put them back inside the header bar's `⋮` menu.
`studio-guided-surface` deliberately emptied that menu of them.

Dock the three one row down instead, in the process header bar,
right-aligned by the `⋮` trigger. Checks stays in the area nav. The request
names only the three action buttons.

## What Changes

- `ProcessHeaderBar.tsx` renders Save, Discard draft and Publish. They sit
  right-aligned in the header row, ahead of the `⋮` menu trigger.
- `DraftNavControls.tsx` renders in the studio's area nav. It drops the three
  buttons and their two confirmation dialogs. It keeps only the Checks
  control.
- `EditScreen.tsx` stops passing `actions`, `validation` and publish state to
  a portaled `DraftNavControls` for those three controls. It threads the
  save, discard and publish handlers, and the two confirmation dialogs,
  directly into `ProcessHeaderBar` instead. The Checks portal into `navSlot`
  stays as it is.
- `root.tsx` keeps reserving the area-nav slot for Checks. Nothing about
  that slot's DOM position changes.
- The three actions, both confirmation dialogs and every catalog key stay
  the same. Reachability stays the same too, across all 10 tabs and while
  the JSON surface is active. The header bar already renders above the tab
  row regardless of `jsonOpen`. This change relocates three controls. It
  does not add a new capability.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-process-tabs`: the area nav today carries four controls. Those are
  Checks, Save, Discard draft and Publish. The header bar's own menu holds
  none of them. The delta narrows the area nav to Checks alone. It adds a
  new requirement that puts Save, Discard draft and Publish in the header
  bar row instead. They stay always visible, outside the `⋮` menu.

## Impact

- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` gains the
  three buttons and the two confirmation dialogs, moved from
  `DraftNavControls.tsx`. They sit right-aligned in the header row.
- `packages/web/src/areas/studio/panels/DraftNavControls.tsx` loses the
  three buttons and their dialogs. It keeps the Checks control. Its own doc
  comments stop claiming ownership of Save, Discard draft and Publish.
  `useDraftToolbarActions` stays where it already lives, in
  `DraftToolbar.tsx`, called once from `EditScreen.tsx`. It is unaffected.
- `packages/web/src/areas/studio/screens/EditScreen.tsx` passes the toolbar
  actions, validation and publish props to `ProcessHeaderBar` instead of
  only to the portaled `DraftNavControls`.
- `packages/web/src/areas/studio/root.tsx`: the nav-slot doc comment changes
  to name Checks alone. The slot and the portal wiring stay as they are.
- `openspec/specs/studio-process-tabs/spec.md` carries the requirement delta
  above.
- `.claude/rules/ui-glossary.md` and `docs/current-state.md` both describe
  today's split in prose. Both name which controls live in the area nav and
  which live in the header bar. Both go stale the moment the code moves.
  Each needs a one-line change, tracked as a task.
- Five existing test files assert today's placement. Each needs a change to
  match the new one: `packages/web/test/studio-processSurface.test.ts`,
  `studio-draftNavControls.test.tsx`,
  `studio-processHeaderBar-publishGate.test.tsx`,
  `studio-processHeaderBar-findingFallback.test.tsx` (only its
  `renderHeader()` fixture, not its own assertions), and
  `studio-no-confirm.test.ts` (a stale comment, not an assertion).
- No API, schema, or i18n-key changes. No new dependencies.
