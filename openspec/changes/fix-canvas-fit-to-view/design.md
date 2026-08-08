## Context

See proposal.md for the three defects and their measurements.

Two facts about the canvas shape every decision below. Panzoom binds to the
`<svg>` root element itself, not to an inner group. The `<svg>` carries no
`viewBox`, so one user unit equals one CSS pixel.

Panzoom 4.6.2 writes `transform: scale(s) translate(x, y)`. It sets
`transform-origin: 50% 50%`, because `isSVGElement` excludes an `<svg>` root
(`panzoom.es.js:298`). A point `p` in user space therefore lands at
`C + s * (p + t - C)` on screen. `C` is the element center. `t` is the pan
value Panzoom holds.

## Goals / Non-Goals

**Goals:**

- One pure function computes the scale and the pan from plain numbers.
- The component keeps every DOM read. The function reads nothing.
- The arithmetic follows from the transform above, not from guesswork.

**Non-Goals:**

- Automatic framing on load, or on a change to the draft. The control stays
  manual, as today.
- A change to drag, wheel zoom, or any other canvas gesture.
- A replacement for Panzoom.

## Decisions

### The arithmetic moves to `canvas/fit.ts`

The module exports one function. It takes a content box, an element size, and
four insets. It returns `{ scale, x, y }`. `CanvasView` reads the DOM, calls
it, and hands the result to `panzoom.zoom` and `panzoom.pan`.

This follows `layout.ts`, `geometry.ts` and `connection.ts`, which the spec
already names. The alternative keeps the arithmetic inside the component and
tests it through a rendered canvas. That needs a DOM, and neither `getBBox`
nor a layout box works under a test DOM.

### The pan follows from the transform, and the scale enters it once

Solve `T = C + s * (m + t - C)` for `t`, where `m` is the content center and
`T` is the target point on screen. The result is
`t = (T - C) / s + C - m`.

Two special cases explain the current behaviour. At `s = 1` the division
disappears. With `T = C` the division disappears as well. The old formula
matched both cases and no other.

The alternative replaces Panzoom's `setTransform` option with
`translate(x, y) scale(s)` and an origin at `0 0`. That composition needs no
division. It also changes what `zoomToPoint` computes on every wheel event,
because Panzoom derives that from its own composition. The wheel gesture works
today, so leave it alone.

### The content box comes from `getBBox()`

`SVGGraphicsElement.getBBox()` returns the union of everything the canvas
draws, in user units. That covers the start arrow, the terminal stamp and the
guard labels, none of which the node rectangles contain.

The alternative expands the node bounding box by the known overhangs, 24px to
the left and 28px above. Those two numbers live in the render code
(`CanvasView.tsx:378` and `CanvasView.tsx:412`). A copy of them in the fit
code drifts the first time somebody moves a decoration.

`getBBox()` stays in the component, so the pure function still takes plain
numbers.

### The element size comes from `clientWidth` and `clientHeight`

Panzoom transforms the `<svg>` element itself. `getBoundingClientRect()`
therefore reports the transformed box. It shrinks as the canvas zooms out.
`clientWidth` and
`clientHeight` report the layout box. The transform does not touch it.

This is what makes two activations agree. The alternative reads the parent
element's rect. The parent carries a 1px border. Its rect therefore overstates
the usable width by 2px.

### The insets run asymmetric, and the top one measures the toolbar

The toolbar overlays the canvas at the top left. The fit insets the top edge
by the toolbar's height plus a gutter. The other three edges take the gutter
alone.

A symmetric inset would keep the pan formula free of the division, since `T`
would equal `C`. It also costs the same space at the bottom, which nothing
overlays. On a 576px canvas that wastes about a fifth of the height.

The gutter is 16px. `design-language.md` puts every gap on a 4-point scale,
and 16px is `--space-4` on that scale. The module names it as a constant with
that reason beside it.

The component measures the toolbar height rather than naming a second
constant. The `.btn` rule derives its height from a 14px font and `--space-2`
of padding. A change to either token moves that height. A hardcoded number does
not follow it. A measurement costs no more code than the constant it
replaces.

The studio catalog ships English alone today
(`packages/web/src/i18n/catalogs/studio.ts`). German is the second locale the
product ships, and German labels run up to 40% longer. A two-line button then
breaks a hardcoded number. That case argues for the measurement as well, but
it is a future case, not a current one.

### The scale cap stays at 1

`fitToView` never magnifies. A two-step draft keeps its size instead of
filling the canvas. This matches the current behaviour. Nothing in GitHub #3
asks to change it.

The function floors the scale at `MIN_SCALE`, the same 0.25 the `Panzoom` call
sets. It does not clamp against `MAX_SCALE`. The cap at 1 already sits below
that bound, so such a clamp would be dead code. Both constants live in
`fit.ts`. The `Panzoom` call reads them from there, so the two agree. The pan
does not depend on the floor, because `t` uses the scale the caller applies.

## Risks / Trade-offs

- A future `viewBox` on the `<svg>` breaks the unit equality between
  `getBBox()` and `clientWidth`. → The function documents the assumption. The
  caller converts before it calls. Nothing in the canvas needs a `viewBox`
  today.
- `getBBox()` reports zero on an empty canvas. Firefox throws on a detached
  element. → The caller returns early on an empty draft, as it does today. The
  canvas stays attached while the button accepts a click.
- A wide draft still exceeds the canvas at the 0.25 floor. → The fit centers
  it and the author pans. The floor predates this change.
- `clientWidth` is not free of the transform in every layout. A transform
  grows an ancestor's scrollable overflow. A classic scrollbar then appears.
  It re-lays out a `width: 100%` child. → Our `.canvas-wrap` sets
  `overflow: hidden`. That rules the case out. `CanvasView` records the
  dependency beside the reading.
- `clientWidth` is the padding box. An SVG with no `viewBox` anchors user
  space to the content box. → `.canvas-svg` carries no padding, so the two
  agree. Padding on that rule would offset the origin and overstate the
  viewport.
- `clientWidth` rounds to a whole pixel. A flex child rarely lands on one. →
  The framing sits up to a pixel off. The gutter is 16px, so no author sees
  it.
- `getBBox()` measures text, so a long step label widens the box. → That is
  the wanted behaviour. A label that runs off the canvas is the defect this
  change removes.

## Migration Plan

Nothing to migrate. The change adds no column, no table, no event kind and no
persisted field. It writes no draft and no definition. `layout` keeps the
shape `process-drafts` states, and the fit still reads it without writing it.

The deploy is the next `packages/web` build. An author with the old bundle
open keeps the old behaviour until a reload. The two bundles share no state.

Rollback is a revert of the commit. No data written under the new code needs
a backward step, because the change writes none.

## Open Questions

None. The three defects and their corrections all rest on measurements. The
design records each one. A later stage that adds a `viewBox` or a wrapper
group to the canvas would revisit the unit assumption above. No stage in
`ROADMAP.md` plans one.
