## Why

The `studio-canvas` spec promises that "fit to view" frames every step. The
canvas breaks that promise. GitHub #3 reports three symptoms. Steps sit
outside the visible area. Other steps clip at the top edge. The "Fit to view"
button covers a step.

Four defects produce those symptoms. Three sit in `fitToView`, at
`packages/web/src/areas/studio/canvas/CanvasView.tsx:100`. The fourth sits in
the canvas CSS, and it is the one that holds the others hostage.

The fourth defect defeats the control on its own. A browser check found it,
after the three below already read as fixed. The UA stylesheet gives an inline
`<svg>` `overflow: hidden`, so the element clips its content at its own
viewport. Panzoom transforms that same element, so the clip window travels
with the content. No zoom level brings an off-viewport step into view.

Measured on the seeded `expense_approval` draft, in a canvas column 240px
wide. The draft holds six steps. One renders. After "fit to view" the graph
shrinks, and one still renders.

The first defect is arithmetic. `fitToView` computes its pan value in screen
pixels. `@panzoom/panzoom` 4.6.2 writes `transform: scale(s) translate(x, y)`.
The browser scales that translation a second time. The library also sets
`transform-origin: 50% 50%` on an `<svg>` root. The browser therefore measures
the translation from the center.

The formula assumes the corner instead. At scale 1 both terms cancel. That is
why a wide canvas looks correct. Below scale 1 the content shifts by
`(1 - scale) * (minX + maxX) / 2`.

The second defect makes the control non-idempotent. `fitToView` reads the
viewport size from `svg.getBoundingClientRect()`. Panzoom transforms that same
`<svg>` element. A bounding client rect reports the transformed box, so at
zoom level 0.5 it reports half the true width. A second click therefore
computes a smaller zoom level than the first.

The third defect survives both corrections. The framed box covers the bare
step rectangles. Three things sit outside it.

The start arrow reaches 24px left of the first step. The terminal stamp
reaches 28px above a step's top edge. The toolbar covers the canvas's top left
corner. The fit puts content under all three.

## What Changes

- Correct the pan computation. The pan equals the viewport center minus the
  content center. The scale no longer enters it.
- Read the viewport size from the layout box rather than the transformed one.
  Two clicks in a row then produce the same result.
- Frame the drawn content rather than the bare step rectangles, and pad it.
  The padding keeps the toolbar off the graph.
- Give `.canvas-svg` `overflow: visible`, so the element stops clipping the
  graph. `.canvas-wrap` is the same size and already clips.
- Move the dot grid from `.canvas-svg` to `.canvas-wrap`. A grid on the
  transformed element shrinks with the zoom and leaves the canvas bare.
- Move the computation into a pure module beside `layout.ts`, `geometry.ts`
  and `connection.ts`.
- Cover that module with `bun:test` cases. The current formula fails them.

No contract change. No engine change. No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the fit-to-view requirement gains two properties. The
  framing holds at every scale, not only at scale 1. The framed area accounts
  for the step decorations and the toolbar. The pure-module requirement gains
  the fit computation.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`. `fitToView` shrinks
  to one call into the new module plus the two `panzoom` calls.
- `packages/web/src/areas/studio/canvas/fit.ts`. New pure module.
- `packages/web/test/studio-canvas-fit.test.ts`. New test file.
- `packages/web/src/areas/studio/app.css`. `.canvas-svg` stops clipping.
  `.canvas-wrap` takes the dot grid.
- `openspec/specs/studio-canvas/spec.md`. Two requirements change wording.
- `docs/browser-checks.md`. The browser steps land here when the
  `development-toolchain` split rule keeps them manual.

The change stays inside the studio area of `packages/web`. Nothing in `src/`,
the HTTP wrapper or the JSON definition changes. The `Panzoom` call already
sets the minimum scale 0.25 and the maximum 2. Those bounds stay.
