# Proposal

## Why

Typing one character into a label on the Fields tab costs 17.0 to 19.5 ms of
synchronous commit. The example is IT Offboarding, with 51 fields and 12 steps. Of that, 70 to 80
percent goes into the Field matrix tab's bulk badges, a tab the author is not
looking at. All eleven tab bodies stay mounted on purpose, so a hidden body
renders on every draft change. The studio chunk also weighs 548 kB, over Vite's
500 kB threshold, although only authors ever load it.

## What Changes

- A hidden Field matrix tab and a hidden change list keep their mounted state.
  They stop rendering from the live draft and show the last draft they drew
  while visible. The commit that reveals the tab catches up to the live draft.
- `writtenFieldCounts` caches its accessor per `(fieldId, step index)` inside
  one instance, so the bulk badges stop re-walking every step and view entry.
- The Changes tab keeps computing `describeChanges` while hidden, because the
  tab badge needs the count.
- The studio chunk loses two seams. `@dagrejs/dagre` loads on the Arrange
  command. `FormEditorScreen` and `PlayerScreen` load on their routes through
  `React.lazy`.
- Baseline and after-measurements go into the change's `design.md`.
- Out of scope: guard-label memoization on the canvas (E1-6). Its measured cost
  is 0.6 ms per `pointermove`, below any frame budget, so the finding closes as
  measured. FIELDS-14 stays out.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: hidden tab bodies stop recomputing from the live draft; the form
  editor and the player load on demand.
- `studio-canvas`: the Arrange layout library loads on the Arrange command.

## Impact

- `packages/web/src/areas/studio/`: `screens/EditScreen.tsx`, `root.tsx`,
  `panels/FieldMatrixPanel.tsx`, `panels/FieldMatrixGrid.tsx`,
  `panels/ChangesView.tsx`, `panels/ChangeList.tsx`, `draft/view-flags.ts`,
  `canvas/arrange.ts`, the studio catalog and a new hook file under `draft/`.
- `packages/web/test/studio-canvas-arrange.test.ts`, which awaits the async
  arrange call.
- `.claude/rules/ui-glossary.md` and `docs/decisions.md` (the audit index entry).
- Build output: the studio chunk splits into the area chunk plus two lazy
  chunks. No API, no engine, no definition contract change.
- Specs: delta files for `studio-app` and `studio-canvas`. The tab-mount
  requirement (all eleven bodies stay mounted) stays true.
