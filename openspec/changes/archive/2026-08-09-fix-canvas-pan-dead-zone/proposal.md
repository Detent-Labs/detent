## Why

`CanvasView`'s pan-drag and wheel-zoom bind directly to the `<svg
class="canvas-svg">` root. Panzoom treats that root as HTML, not SVG, so it
applies `transform-origin: 50% 50%` when it sets `transform: scale
translate` on it. A non-identity pan or zoom then moves the SVG's own layout
box away from the canvas's visible area. The box shrinks toward its center
on zoom and slides in whatever direction the pan translates. The drawn
content still renders in the right place, since `overflow: visible` paints
it there regardless of the box.

The result is a dead zone. Part of the visible canvas no longer sits under
the element that Panzoom's pointerdown and wheel listeners bind to. A drag
or scroll started there does nothing. Live testing confirms this. After the
automatic fit-to-view lands a non-identity transform, a pan-drag started in
the calculated dead margin leaves the transform unchanged. The identical
drag started inside the shifted box pans normally.

`studio-canvas` already requires the automatic fit (every draft with steps
centers on open, no author action needed). That requirement puts the dead
zone on the first frame of every session. An author no longer needs to click
"Fit to view" first to hit it.

## What Changes

- Bind Panzoom's pan-drag detection to `.canvas-wrap` instead of
  `.canvas-svg`. Use the library's own `canvas: true` option for this.
  `.canvas-wrap` is never transformed. Its box always matches the full
  visible canvas, at any pan or zoom state.
- Move the manual `wheel` listener (`panzoom.zoomWithWheel`) from the SVG to
  the same `.canvas-wrap` element. Guard it to ignore a wheel event whose
  target sits inside `.canvas-toolbar`. Wheel carries no exclusion of its
  own, unlike Panzoom's pointerdown handling.
- Add the `panzoom-exclude` class to `.canvas-toolbar`. This becomes
  required once `.canvas-wrap`, an ancestor of the toolbar, is Panzoom's
  bind target. Without it, a pointerdown on "Fit to view" reaches Panzoom's
  native-level handler first. React's synthetic `onClick` never fires.
  `panzoom-exclude` already prevents that same failure for step nodes and
  edges.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: the pan-and-zoom requirement gains an invariant. The
  entire visible canvas area stays interactive for panning and zooming, at
  any pan or zoom state. Today it covers only the region the transformed SVG
  element still happens to sit under.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the `Panzoom(...)`
  call, the manual wheel-listener wiring in its mount effect, and the
  `panzoom-exclude` class on the toolbar's JSX className.
- `docs/browser-checks.md` and `docs/current-state.md`: both describe the
  current Panzoom binding and need updating to match. See design.md -
  Migration Plan.
- No schema, engine, or API surface changes. `fit.ts`'s scale/pan arithmetic
  does not change. The visual framing is already correct; this change only
  moves what receives the gesture.
- Node-drag, connect-drag, and the palette's drag-to-place all stay
  independent of this change. Live testing and a code read both confirmed
  this. Each already uses per-element `setPointerCapture` or `.closest(
  ".canvas-wrap")` resolution, not Panzoom's root-level listeners. The dead
  zone does not affect any of them today, and this fix does not touch them.
