## Context

See `proposal.md` - Why for the root cause. In short: Panzoom binds its
pan-drag, and this codebase's manual wheel listener, to `.canvas-svg`
itself. A non-identity transform on that element moves its own
hit-testable box away from part of the visible `.canvas-wrap` area. The
drawn content still paints in the right place, through `overflow: visible`.

Live browser testing, recorded in this change's originating exploration,
confirmed this. A drag started in the resulting margin leaves Panzoom's
transform state unchanged. The same drag started inside the shifted box
pans normally.

`fit.ts`'s scale and pan arithmetic already accounts for Panzoom's
`transform-origin: 50% 50%` on the SVG root. It already produces the
correct visual framing. That part is not in question here. This design only
changes which DOM element receives the pan and wheel gestures.

## Goals / Non-Goals

**Goals:**
- The full visible `.canvas-wrap` area stays interactive for pan-drag and
  wheel-zoom, at any pan or zoom state.
- The toolbar's own click and wheel behavior stays exactly as it is today.
- No change to `fit.ts`, or to the visual framing it produces.
- No change to node-drag, connect-drag, or the palette's drag-to-place
  (`EditScreen.tsx`'s `onPaletteDrop`). None of the three goes through the
  code this change touches. Node-drag and connect-drag each capture the
  pointer on their own SVG element, via `setPointerCapture`.
- `onPaletteDrop` resolves its drop target through
  `.closest(".canvas-wrap")` instead, never through Panzoom's own binding.

**Non-Goals:**
- `onBackgroundPointerUp` (the click-empty-space-to-deselect gesture) stays
  scoped to `.canvas-svg`'s own box, the same scope it has today. See Open
  Questions.
- No change to `computeFit`'s scale or translate formulas.
- No DOM restructuring. No new wrapper element around the SVG. The fix stays
  inside the existing mount effect and the toolbar's class list.

## Decisions

**Bind Panzoom's pan-drag to `.canvas-wrap` via `canvas: true`.** The
alternative was wrapping the SVG in a new element instead. Panzoom ships
`canvas: true` for exactly this case. It binds the pointerdown listener to
`elem.parentNode`, while leaving the transform on `elem` unchanged.

That keeps `fit.ts`'s math untouched. It keeps `svgPointFromClient`'s
`getScreenCTM()` read untouched. It keeps every existing `panzoom-exclude`
class untouched too, since `isExcluded()` walks up from `event.target`
regardless of which ancestor Panzoom's own listener binds to.

The alternative, wrapping `.canvas-svg` in a plain `<div>` and panning that
instead, would also work. But it adds a DOM layer. Every place that reads
`svgRef.current` for coordinate math would need re-auditing against the
new indirection. That is work for no behavior gain over the option the
library already exposes.

**Move the manual `wheel` listener to `.canvas-wrap`, with an explicit
toolbar guard.** `canvas: true` only changes Panzoom's own pointerdown
binding. The `wheel` listener is this codebase's own
(`el.addEventListener("wheel", panzoom.zoomWithWheel)`), so it needs the
same retarget by hand. Unlike pointerdown, `zoomWithWheel` carries no
`isExcluded()` check of its own. The retargeted listener needs its own
guard against a wheel event whose target sits inside `.canvas-toolbar`.
Without that guard, scrolling while hovering the toolbar would zoom the
canvas underneath it. Today's binding cannot reach that case, since it sits
as a sibling of the toolbar, never its ancestor.

The guard checks `.canvas-toolbar` by name, not the general
`.closest(".panzoom-exclude")` walk pointerdown uses. That generalization
looks tempting, but it is the wrong fix here. Every step node and edge
already carries that class, for the pointerdown reason above. Each already
receives wheel-zoom today too. Routing the wheel guard through the
same class would newly suppress zoom over every node and edge. That is a
behavior change this proposal never asked for.

**Add `panzoom-exclude` to `.canvas-toolbar`.** `.canvas-wrap` becomes
Panzoom's bind target. It also becomes an ancestor of the toolbar. A pointerdown
on "Fit to view" would otherwise reach Panzoom's native-level `handleDown`
before React's synthetic `onClick` fires. The existing code comment in
`CanvasView.tsx` already documents this exact failure mode for step nodes
and edges. This change makes it reachable through a new ancestor path, so
the same class needs to cover it too.

## Risks / Trade-offs

- [A future canvas control skips `panzoom-exclude` or the wheel guard] ->
  the wheel handler sits next to the `Panzoom(...)` call. A comment there
  should name the requirement, for the next control to follow.
- [`canvas: true` also moves where `parent.style.overflow` and
  `parent.style.touchAction` get set] -> confirmed from the Panzoom source.
  Both already run unconditionally in the constructor, regardless of the
  `canvas` option. Both values already match `.canvas-wrap`'s existing CSS.
  No behavior change follows from this.

## Migration Plan

Client-side only. No data or schema migration. Deploy as a normal
`packages/web` build. Rollback is reverting the single-file diff in
`CanvasView.tsx`, plus the one class addition on the toolbar. No persisted
state depends on either.

Verify before merge with `bun run typecheck`, then `bun run build`, then a
browser check. The browser check repeats the drag sequence from this
change's originating exploration, plus two cases that exploration did not
cover:
- A background pan-drag started in the dead margin now moves the graph.
- "Fit to view" still activates on click.
- A wheel scroll over the toolbar still does not zoom the canvas.
- A wheel scroll over the dead margin, away from the toolbar, zooms the
  canvas too. The original exploration did not cover this case.
- Node-drag and connect-drag still work unchanged.
- A palette drag released in what was the dead margin still places a step
  (not covered by the original exploration).

Two standing docs describe the binding this change moves. Both need a
matching change: `docs/browser-checks.md`'s "Studio canvas: 'Fit to view'
frames every step" section, and `docs/current-state.md`'s canvas paragraph.
Both already document the sibling failure the palette-drop fix
(`fix-canvas-fit-to-view`) closed for `onPaletteDrop`. This change closes
the matching one for Panzoom's own binding. Tasks 4.1 and 4.2 carry these.

## Open Questions

- Should `onBackgroundPointerUp`'s deselect-on-click-empty-space gesture
  move to `.canvas-wrap` too, so it covers the same full area this change
  gives pan and zoom? Left open for now. It is a separate, smaller gap that
  already exists today: deselect only fires inside the SVG's own box. This
  change does not widen that gap. Closing it would not change this change's
  specs, approach, or tasks. A follow-up change can pick it up on its own.
