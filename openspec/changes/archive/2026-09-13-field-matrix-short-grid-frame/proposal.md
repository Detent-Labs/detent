## Why

The example `laptop_inventory` carries 2 fields against 2 steps. Its Field matrix
grid needs 244px, yet its frame measures 384px at 1440x900. A 138px empty band
sits inside the frame, under the last row. Measured 2026-09-13 in Chrome with
real scrollbars.

The previous change, `field-matrix-fill-height`, set the grid's 24rem floor on
the visible frame itself. Its design expected a small band for one row and
short step keys. The band shows on every process with up to about three fields.
Before that change, such a frame ended under its last row.

## What Changes

- The 24rem floor moves off the grid's frame, onto an invisible space around
  the grid. The frame grows with its rows up to that space and scrolls past it.
- A grid shorter than the floor ends under its last row again, with no empty
  band inside its frame.
- A long grid keeps every measured behaviour. It fills the height under the
  toolbar. On a short window it holds 384px, and the tab body scrolls.
- The matrix column grows to fill the tab body, so the space has height to take.
- The source assertion, `docs/current-state.md` and the browser-check entry
  follow the new declarations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: one MODIFIED requirement, "The field matrix takes the height
  the tab body leaves". Its floor moves from the grid onto the space under the
  toolbar. A grid shorter than the floor then ends under its last row.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx`: a new style and
  one wrapping element around the scroll region; the scroll region drops its
  floor.
- `packages/web/src/areas/studio/panels/FieldMatrixPanel.tsx`: the matrix
  column grows into the tab body.
- `packages/web/test/studio-guidedSurfaceStyle.test.ts`: the field matrix
  `describe` block asserts the new declarations.
- `docs/current-state.md`: the sentence naming the floor.
- `docs/browser-checks.md`: the entry "The field matrix's height" gains a short
  grid step.
- `docs/decisions.md`: MATRIX-1's unmeasured bullet, since a short grid now
  leaves blank tab body a wheel can scroll.
- No engine code, no API, no definition contract, no i18n catalog key.
