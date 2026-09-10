## Why

The Canvas tab spends a 12rem column on a three-entry palette. That column
stands left of the canvas whatever the author is doing. Its three controls add
a step, which is a canvas action like every other one. One row under the tab
row holds them all, and hands the canvas that column back.

## What Changes

- Delete the palette. The canvas fills the tab body's full width.
- Add the canvas bar. It stands between the tab row and the canvas. It runs
  the body's full width at a fixed height.
- The bar carries an Add step split button. Pressing the button adds a step
  someone works. Its menu adds a call to another process, or an end.
- The button and both menu entries stay drag sources. A drag onto a rendered
  path still inserts the new step inside that path.
- A press with no drag adds the step at the visible canvas centre. The step
  lands on the grid, clear of every step already placed.
- The selection count, the delete control and the group controls move into the
  bar. The panel that stands below the canvas today goes.
- The bar reports one selected step's reachability. A step no path reaches
  reads as unconnected.
- Fit to view, Rounded corners and Arrange stay where they are, over the
  canvas at its top left corner. This change leaves all three alone.

## Capabilities

### New Capabilities

None. The canvas bar is a layout change inside a capability that exists.

### Modified Capabilities

- `studio-canvas`: three requirements change. The palette requirement gives way
  to the canvas bar requirement. The layout requirement drops its ban on a bar
  over the canvas. The multi-selection requirement moves its controls into the
  bar.

## Impact

Code, all under `packages/web/src`:

- The change deletes `areas/studio/canvas/CanvasPalette.tsx`.
- The change adds `areas/studio/canvas/CanvasBar.tsx`.
- `areas/studio/screens/EditScreen.tsx` mounts the bar, places a pressed step,
  and drops the selection panel below the canvas.
- `areas/studio/draft/registerOrder.ts` exports the graph walk it keeps
  private today.
- `areas/studio/draft/guided-labels.ts` gains a note per step kind, beside
  `newStepPhrase`.
- `i18n/catalogs/studio.ts` gains the bar's strings and drops the palette's
  heading.

Docs and rules:

- `.claude/rules/ui-glossary.md` replaces its canvas palette row with a canvas
  bar row. The word palette stays for the form editor's field list, which the
  glossary never claimed. A rail in this project is a left column holding a
  list. The word therefore cannot name a horizontal bar.
- `docs/browser-checks.md` names the palette at lines 183 and 281, and gains
  the bar's own manual checks.
- `docs/current-state.md` names the palette at lines 1184, 1808, 1946, 1947
  and 1959.

Nothing touches the engine, the HTTP surface or the schema. The definition
contract stays as it is.
