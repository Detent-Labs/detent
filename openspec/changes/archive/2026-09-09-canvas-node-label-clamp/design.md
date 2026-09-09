## Context

See `proposal.md` for the motivation. The constraint that shapes everything
here is one line of `CanvasView.tsx`:

```jsx
<text x={10} y={34} {...stylex.props(styles.nodeLabel)}>{label}</text>
```

SVG `<text>` neither wraps nor truncates. It draws one run at one baseline and
paints past any box around it.

Two neighbours in the same file already solved the same problem. The edge's
guard label is a `<foreignObject>` holding a `<div>` with `overflow: hidden`
and `text-overflow: ellipsis` (`CanvasView.tsx:310`). The node's own inline
rename field is a `<foreignObject>` too, sitting inside the node group. This
change reaches for that mechanism a third time.

## Goals / Non-Goals

**Goals:**

- Keep every label inside its node's four edges.
- Keep `NODE_WIDTH` and `NODE_HEIGHT` constants, so the geometry, the routing,
  auto-arrange and fit-to-screen stay untouched.

**Non-Goals:**

- A node that resizes itself. The author asked for the fixed-size variant.
- Any change to the edge guard label, the stamps or the connect handle.
- A tooltip component. Hover reads the `title` attribute instead.

## Decisions

### The label body becomes a `<foreignObject>`

Wrapping and the ellipsis both come from CSS, on one element: `display:
-webkit-box`, `-webkit-box-orient: vertical`, `-webkit-line-clamp: 2`,
`overflow: hidden`. That element is the inner of the two the next decision
nests. Every browser this project checks reads that group of four. The
`-webkit-` prefixes are the standard spelling here, not a vendor fallback.

Alternatives weighed:

- **Split into two `<tspan>` runs in JS.** It needs a text run's pixel width.
  That needs `getComputedTextLength` or a canvas 2D context. Neither exists
  under `renderToStaticMarkup`, which is how the node tests draw their markup.
  The measurement would also have to guess the ellipsis's own width.
- **A `<clipPath>` over the node rect.** It stops the overflow. What it gives
  is a hard cut through a glyph, with no wrap and no ellipsis. That reads as a
  broken glyph rather than as truncation.

### Two nested `<div>`s, because one cannot carry both jobs

The clamp needs `display: -webkit-box`. Positioning needs a flex or a grid
container. No element is both, and `align-items` does nothing on a
`-webkit-box`. So the box splits in two.

The outer `<div>` is `height: 100%`, `display: flex`,
`align-items: flex-start`, `padding-top: 20`. The inner one carries the clamp.

`flex-start` and not `center`. Centring gives a one-line label and a two-line
one different first baselines, about 9.75 units apart. A row of nodes is the
strongest alignment the canvas has. The 20 puts the shared first baseline back
on 34, where `<text y={34}>` drew it. A one-line label then lands exactly where
it always did. Two clamped lines measure 39 and close at 59, inside the 60-unit
box.

The legacy `-webkit-box-pack: center` would centre inside the clamped element
itself, saving the outer `<div>`. No specification says what it does beside
`-webkit-line-clamp`, so this design spends the element instead.

### The `<foreignObject>` clears the connect handle

The handle is a circle at `cx=NODE_WIDTH` with `r=7` (`CanvasView.tsx:39` and
`:1266`). It covers x 173 to 187, across the node's vertical middle, which a
wrapped second line runs straight into.

So the box is inset by 10 on the left and by 26 on the right, over the node's
whole height: `x={10} y={0} width={NODE_WIDTH - 36} height={NODE_HEIGHT}`. Its
right edge lands at 154, so the handle keeps 19 units to itself. The old
`x={10}` had no right bound to clear.

The element needs all four. A `<foreignObject>` with no `height` draws
nothing, and the outer `<div>`'s `height: 100%` resolves against this rect.
Both other `<foreignObject>`s in the file set all four, at
`CanvasView.tsx:1222` and `:1583`.

### The outer `<div>` carries `aria-hidden` and `title`

It carries `aria-hidden="true"`, the way the guard label's own `<div>` does
(`studio-canvas-node-a11y.test.tsx:223`). The node group is the `role="button"`.
Its composed `aria-label` already names the label, the key, the kind and the
outgoing-path count. Leaving the visible text exposed underneath would offer a
screen reader the label a second time, unlabelled.

The `title` sits on the outer `<div>` too, and it appears only where the
clamp cut something. A tooltip on every node, cut or not, stops saying that
more text is hiding. It is also the only reveal a sighted pointer user has.
The outer element spans the whole node body, so hover answers anywhere inside.

That costs a measurement, in a `NodeLabel` component holding its own state.
The state opens `true`. Server-rendered markup and the first paint both carry
the title, and the effect clears it on a label that fits. The reverse default
renders SSR markup the browser then contradicts.

## Risks / Trade-offs

**A `<foreignObject>` child could swallow a press meant for the node.**
→ The node's handlers sit on the `<g>`. A press inside either `<div>` bubbles
up to them. The `<foreignObject>` carries `panzoom-exclude`, as the rename field's
does, so Panzoom keeps its hands off. Drag-to-move, double-click-to-rename and
selection are the three gestures the browser check exercises on a node.

**`-webkit-line-clamp` has no non-prefixed spelling, and this repository has
no other vendor-prefixed property.**
→ StyleX 0.19 declares all three by name. `WebkitBoxOrient` sits at
`packages/web/node_modules/@stylexjs/stylex/lib/es/types/StyleXCSSTypes.d.ts:962`,
`WebkitLineClamp` at `:968`, and `:278` lists `'-webkit-box'` among the
`display` values. Chromium, Firefox and WebKit all implement the property.

**The label test reads markup that stops existing.** → `<text
class="nodeLabel">` and its `y` attribute are what
`studio-canvas-node-label.test.tsx` asserts on. That file moves to the two
nested `<div>`s, keeping every behavior it pins today: label over key, the
locale switch, and the key fallback. Its no-second-line case turns around,
since the node body then draws no `<text>` at all.

## Migration Plan

Nothing migrates. No definition, no stored row and no persisted layout changes
shape, and `definitionHash` never sees the canvas. The node's markup is the
whole delta, so rollback is reverting the commit.

## Open Questions

None.
