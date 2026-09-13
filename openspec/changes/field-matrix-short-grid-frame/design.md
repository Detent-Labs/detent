## Context

See proposal.md for the motivation. This section names the current layout.

`FieldMatrixPanel` draws one flex column, its `matrix` style, with
`minHeight: 0`. The column holds the toolbar and what `FieldMatrixGrid`
returns: a status line that collapses to zero height while idle, then the
scroll region. The column has no flex growth of its own, so it measures its
content, capped by the tab body.

The scroll region's style, `matrixScroll`, carries `overflow: "auto"`, a 1px
frame, a `:focus-visible` ring at `outlineOffset: "-2px"`, and
`minHeight: "24rem"`. That floor is the fault. It applies to the frame the
author sees, so a grid whose rows need 244px still draws a 384px frame.

The test file `studio-guidedSurfaceStyle.test.ts` asserts those declarations
in its "the field matrix grid takes the tab body's height" block. The entry
"The field matrix's height" in `docs/browser-checks.md` walks the laid-out
heights.

## Goals / Non-Goals

**Goals:**

- A grid shorter than the floor ends under its last row, with no band inside
  its frame.
- Every measured behaviour of a long grid stays the same.

**Non-Goals:**

- MATRIX-1 and MATRIX-2 in `docs/decisions.md`. Each keeps its own change.
- The toolbar, the legend, the cells, the keyboard model and the focus ring.
- The empty catalog state, which draws words and no grid.

## Shape brief

This section holds the `/impeccable shape` result for the Field matrix tab.

- **Job and audience.** A process author, in Operate mode, reads a small
  process's field matrix. They see two or three rows at a glance.
- **Outcome.** The frame outlines the table and nothing else. A long grid
  still fills the height and scrolls.
- **Direction.** The incumbent world stays. DESIGN.md's "The Field Matrix" and
  "Layout" sections hold unchanged. An empty frame reads as missing content in
  this register, so the frame follows its rows.
- **States and ranges.** Measured grids span 244px (`laptop_inventory`, 2
  fields), 409px (`access_request`, 4 fields) and 5511px (`it_offboarding`, 51
  fields). A window from 600px to 1200px tall covers the checked range.
- **Constraints.** No token, no i18n key, no motion and no JavaScript height
  measurement.

## Decisions

### An invisible space holds the floor; the frame follows its rows

Three declarations and one element carry the layout.

1. The `matrix` column gains `flexGrow: 1`. It then fills the tab body
   instead of measuring its content, and keeps `minHeight: 0`.
2. A new style, `matrixScrollSpace`, sits on a plain `div` wrapped around the
   scroll region inside `FieldMatrixGrid`. It declares `display: "flex"`,
   `flexDirection: "column"`, `flex: "1 1 0"` and `minHeight: "24rem"`. The
   space takes what the column leaves under the toolbar, and never less than
   the floor. It draws no border, fill or focus stop.
3. `matrixScroll` drops `minHeight`. As a scroll container its automatic
   minimum is zero, and its `auto` basis is its content height. Inside the
   space's column it measures its rows, shrinking to the space when the rows
   need more.

The status line stays outside the space. The empty state therefore returns the
status line alone, as today, and draws no space.

### A spike measured the approach before the design

On 2026-09-13 a throwaway script applied exactly those three declarations as
inline styles in headed Chrome with 15px scrollbars. The spike committed
nothing.

| Grid | Window | Frame | Band in frame | Tab body |
|---|---|---|---|---|
| `laptop_inventory` | 1440x900 | 246px | 0 | 659 = 659, no scroll |
| `laptop_inventory` | 1440x600 | 246px | 0 | 515 > 359, scrolls |
| `it_offboarding` | 1440x900 | 528px, bottom 876 | 0 | 659 = 659, bottom 876 |
| `it_offboarding` | 1440x600 | 384px | 0 | 515 > 359, scrolls |
| `it_offboarding` | 1440x1200 | 828px, bottom 1176 | 0 | 959 = 959, bottom 1176 |

The long grid matches the shipped measurements from `field-matrix-fill-height`
at every size. The short grid lost its 138px band.

Alternatives considered:

- A floor of `min(24rem, max-content)` on the frame. CSS `min()` rejects an
  intrinsic keyword, so no browser parses it. Rejected.
- `maxHeight: "100%"` on the frame inside a definite wrapper. The percentage
  needs a definite height through `.shell`, which sets only `min-height`.
  Flex shrinking reaches the same result without that dependency. Rejected.
- No floor at all. The owner chose a floor for a short window. Rejected.
- The wrapper in `FieldMatrixPanel` around the whole grid. It would also wrap
  the empty state's words in a 24rem space. Rejected.

### Assertions follow the new declarations

The block in `studio-guidedSurfaceStyle.test.ts` keeps its precedent and
reads each style with `styleBlock` after `stripComments`. It asserts
`flexGrow: 1` and `minHeight: 0` on `matrix`. It asserts the four declarations
on `matrixScrollSpace`. On `matrixScroll` it asserts `overflow: "auto"` and
`outlineOffset: "-2px"`. The same style declares neither `minHeight` nor
`maxHeight`, and the block asserts that too. The browser entry proves the
heights, as before.

## Risks / Trade-offs

- Risk: on a window too short for the floor, a short grid's tab body scrolls
  past blank space. At 1440x600 `laptop_inventory` scrolls 156px under its
  frame. Mitigation: accepted. It needs three fields or fewer and a window
  under about 620px, and no frame outlines the space.
- Risk: `FieldMatrixGrid`'s space fills only inside a flex column. Mitigation:
  `FieldMatrixPanel` is the grid's one mount, per `ui-glossary.md`. A bare
  test render lays nothing out and draws one more plain `div`. No test counts
  it: `studio-fieldMatrixTabStops` counts `tabindex="0"` alone.
- Risk: a test or a selector expects the scroll region as the fragment's
  direct child. Mitigation: the full suite runs after the change, and the
  browser check reads the region by its label.

## Migration Plan

None. The change touches browser styles, one element and one test file.
Reverting the commit restores the floor on the frame.

## Open Questions

None.
