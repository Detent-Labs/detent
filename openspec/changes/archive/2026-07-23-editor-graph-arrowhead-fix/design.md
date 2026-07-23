## Context

`GraphView.tsx`'s `edges` mapping builds, for every edge:

```ts
const issueColor = issues.length > 0 ? "#c00" : undefined;
...
markerEnd: { type: MarkerType.ArrowClosed, color: issueColor },
```

For the overwhelming majority of edges (no validation issue), `issueColor`
is `undefined`, so the object is `{ type: MarkerType.ArrowClosed, color:
undefined }` — the `color` key is present, just empty.

Traced into the installed `@xyflow/system` (pulled in by `@xyflow/react`
12.11.2), `createMarkerIds`:

```js
markers.push({ id: markerId, color: marker.color || defaultColor, ...marker });
```

The intent is "use the edge's own color if it has one, else the theme
default." But `...marker` spreads *after* the computed `color` field, and
`marker` (our `markerEnd` object) has its own `color: undefined` key —
object spread copies own enumerable properties regardless of value, so it
overwrites the just-computed fallback back to `undefined`. `@xyflow/react`'s
`ArrowClosedSymbol` then destructures `color = 'none'` as its parameter
default (only triggers on an actual `undefined`, which is exactly what
arrives), producing:

```html
<polyline class="arrowclosed" style="stroke-width: 1; stroke: none; fill: none;" .../>
```

The marker element and the `marker-end` reference on every edge path both
exist in the live DOM. No automated test caught this: reading
`packages/editor/test/graph-view-rendering.test.tsx`'s own comments,
`editor-graph-edge-routing` originally intended a smoke test asserting a
`marker-end` reference was present, but discovered edge `<path>` elements
don't render at all under `renderToStaticMarkup` — React Flow paints an
edge only after each endpoint's handle bounds are measured via a
`ResizeObserver`-driven effect, which never fires under SSR — and fell back
to asserting node handle positions instead, leaving the arrowhead itself
manually-verified-only. That gap is exactly how this regression shipped
unnoticed.

Reproduced live: dev server running in the devcontainer, Chrome (via
Playwright) navigated to it, `examples/expense-approval.json` imported, and
the rendered SVG inspected directly — confirms the above `style` string on
every edge's arrowhead polyline.

## Goals / Non-Goals

**Goals:**
- Make the arrowhead actually visible, using react-flow's own
  `marker.color || defaultColor` fallback instead of fighting it.
- Add coverage that would have caught this — assert the marker polyline
  paints with a non-`none` fill/stroke. No such assertion exists today (see
  Context: the one prior attempt at marker coverage was abandoned for an
  SSR limitation and never replaced).

**Non-Goals:**
- No change to edge routing, handle positions, or `fitView` — untouched by
  `editor-graph-edge-routing` bug, not part of this fix.
- No change to which edges get `"#c00"` (the issue-flagged color) — that
  logic is correct today; only the *absence* of a color was mishandled.
- No upgrade or patch of `@xyflow/react`/`@xyflow/system` — the spread-order
  behavior in `createMarkerIds` is arguably its own footgun, but working
  around it in our own object construction is the smaller, local fix; not
  worth a dependency bump or override for one call site.

## Decisions

**Omit the `color` key entirely for a non-issue edge, rather than passing
`color: undefined` or a hardcoded default color.** Two alternatives
considered:
- *Pass an explicit default color ourselves* (e.g. `color: "#b1b1b7"`)
  instead of relying on react-flow's fallback. Rejected: duplicates a value
  react-flow already owns (its theme default), and would drift if the
  theme's default edge color ever changes elsewhere.
- *Pass `color: issueColor ?? undefined` unconditionally with a comment.*
  Rejected: this is exactly today's code — an explicitly-present `color`
  key with value `undefined` is precisely what triggers the spread-order
  bug, regardless of `??` vs `||` on the right-hand side. The key's
  *presence* is the problem, not the operator used to compute its value.

Concretely:

```ts
markerEnd: issueColor
  ? { type: MarkerType.ArrowClosed, color: issueColor }
  : { type: MarkerType.ArrowClosed },
```

When `issueColor` is `undefined`, the resulting object has no `color` key at
all, so `marker.color || defaultColor` in `createMarkerIds` correctly
evaluates its fallback, and nothing downstream overwrites it.

**New test: assert on the marker `<defs>` block's computed paint, not the
edge path.** `MarkerDefinitions` (the `<defs>` block holding the `<marker>`
and its polyline) is driven directly by the store's `edges` array — a plain
`useMemo`/`useStore` read, not a `ResizeObserver`-gated measurement — so
unlike the edge `<path>` itself, it does render under
`renderToStaticMarkup`. Add an assertion in
`graph-view-rendering.test.tsx` that the rendered markup's `<marker>`
polyline does not carry `fill: none` in its `style` (or, more directly,
does carry a real color token) for a non-issue edge. Stays within the same
`renderToStaticMarkup` convention already used in that file — no new test
dependency, no interactive/jsdom requirement, since this is a static-markup
property (the paint style is computed at render time from props, not from a
browser layout pass).

## Risks / Trade-offs

- [`createMarkerIds`'s spread-order behavior could resurface at a different
  call site later, e.g. if a future edge-styling change reintroduces an
  explicit `color: undefined`] → Mitigated by the new marker-paint
  assertion catching it at that site too, and by this design doc recording
  the root cause for future reference.
- [No automated coverage for the *visual* result — only for the computed
  inline style string] → Same accepted trade-off as
  `editor-graph-edge-routing`: interactive/rendered-pixel coverage would
  need a browser-based test runner, not justified for this fix. The
  static-markup assertion directly covers the actual defect (a paint style
  computed from props), which is enough here since the bug was in prop
  plumbing, not layout/rendering timing.

## Migration Plan

No data migration. Editor-only, client-side rendering fix; no schema, API,
or persisted-state changes. Ships as a normal editor package change;
rollback is a plain revert.
