## Why

The Field matrix tab leaves a tall empty band below its grid. The example
`it_offboarding` carries 51 fields against 12 steps, and its grid runs past
2000px. The grid's scroll region stops at 32rem all the same, about 512px. On a
window 1200px tall the tab body offers about 1000px, and half of it stays
blank.

The 32rem ceiling dates from the canvas dock, where the grid shared a short
strip with the canvas. The dock is gone. The Canvas and Steps tabs already take
the height the tab body leaves. The field matrix never followed them.

## What Changes

- The field matrix's scroll region grows with its rows, up to the height the
  tab body leaves under the toolbar. Past that height it scrolls inside
  itself, and its sticky headers keep their place.
- A matrix with few rows ends after its last row, unless it runs shorter than
  the floor.
- The fixed 32rem ceiling goes away. A 24rem floor takes its place, the way
  the Canvas and Steps tabs hold a floor. Below it the tab body scrolls.
- A source assertion guards the two declarations, beside the steps rail's own.
- `docs/current-state.md` stops describing the 32rem ceiling.

The toolbar, the legend, the cells and the keyboard model stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: one ADDED requirement. The field matrix takes the height under
  its toolbar, above a 24rem floor. It scrolls inside that height.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx`: the scroll
  region's style trades its fixed maximum height for a floor. Its focus ring
  draws inside its frame, since the grid now reaches the tab body's clipping
  edge.
- `packages/web/src/areas/studio/panels/FieldMatrixPanel.tsx`: the wrapper
  column may shrink into the tab body.
- `packages/web/test/studio-guidedSurfaceStyle.test.ts`: one new `describe`
  block over both declarations and the focus ring.
- `docs/current-state.md`: the passage naming the ceiling.
- `docs/browser-checks.md`: one new entry, since a layout height needs a real
  browser.
- `docs/decisions.md`: MATRIX-1 and MATRIX-2, two open findings the browser
  check surfaced. Neither comes from this change.
- No engine code, no API, no definition contract, no i18n catalog key.
