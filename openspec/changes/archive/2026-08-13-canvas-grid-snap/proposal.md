## Why

A dragged step lands wherever the pointer stopped. Two steps an author meant
to align sit two pixels apart, and nothing in the canvas helps them line up.

The canvas already paints a lattice. `.canvas-wrap` carries a radial-gradient
at 20px. An author sees dots, and reasonably expects a node to meet them.
Stage 37 asks for exactly that.

## What Changes

- A dragged step lands on a 20-unit lattice. The rounding happens on release.
  The in-flight preview draws the rounded position, so nothing jumps.
- A step dropped from the creation palette lands on the same lattice.
- The painted grid follows the canvas transform. `.canvas-wrap` reads its
  `background-size` and `background-position` from the live Panzoom scale and
  pan. A node dropped on a dot therefore lands on that dot, at every zoom and
  every pan.
- Two constants move onto the lattice. `ROW_HEIGHT` goes from 110 to 120, and
  `NODE_HEIGHT` from 64 to 60. Every auto-laid-out step then starts on the
  lattice, and none shifts on its first drag.

The grid is what makes this more than a rounding call. Panzoom transforms the
SVG and not the wrap. A node rounded in SVG coordinates therefore meets the
drawn dots at zoom 1 and pan 0 alone. An author works at the fit scale, which
is rarely 1. A snap nobody can see against the dots in front of them is not
the feature stage 37 asked for.

No **BREAKING** change. Position stays in the opaque `layout` blob. No
schema moves, no hash moves, and no published body notices.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: a dragged or dropped step lands on the lattice, and the
  painted grid tracks the canvas transform.

## Impact

Browser only. No engine file changes.

- `packages/web/src/areas/studio/canvas/geometry.ts`: the snap helper, and
  `NODE_HEIGHT`.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the release, the
  preview, and the transform subscription.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: the palette drop.
- `packages/web/src/areas/studio/canvas/layout.ts`: `ROW_HEIGHT`.
- `packages/web/src/areas/studio/app.css`: the two background properties.

Docs: `ROADMAP.md` and `docs/current-state.md` record the stage.
`docs/browser-checks.md` carries the walk. Most of this change's evidence lives
there. A lattice meeting painted dots across several zoom levels is a visual
judgment, and no assertion sees it.

No dependency changes. No API changes.
