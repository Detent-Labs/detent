## Why

The just-archived `editor-graph-edge-routing` change added directional
arrowheads to graph edges, but they render invisibly: every edge shows only a
plain line with a dot at each end, no triangle. Verified in-browser (Chrome,
via Playwright) against `examples/expense-approval.json` on the running
editor dev server. The requirement this change added
(`editor-graph-view`, "Graph edges display a directional arrowhead") is
currently unmet in practice, even though the code that was supposed to
satisfy it is present.

## What Changes

- Fix `packages/editor/src/graph/GraphView.tsx`: stop passing an explicit
  `color: undefined` key inside a non-issue edge's `markerEnd` object. Build
  `markerEnd` conditionally so the `color` key is present only for an
  issue-flagged edge, letting `@xyflow/system`'s own
  `marker.color || defaultColor` fallback apply instead of being overwritten
  back to `undefined` by a later object spread of the same key
  (`createMarkerIds`: `{ color: marker.color || defaultColor, ...marker }` —
  `...marker` re-adds `marker`'s own `color: undefined`, clobbering the
  fallback it just computed). `ArrowClosedSymbol` then defaults `color` to
  the literal string `'none'`, so the marker's polyline paints with
  `stroke: none; fill: none` — present in the DOM, fully transparent.
- Add a static-markup assertion (extending
  `packages/editor/test/graph-view-rendering.test.tsx`, the existing
  `renderToStaticMarkup` convention) covering this exact class of defect.
  No test today checks the arrowhead's rendered paint at all: that file's
  own comments record that `editor-graph-edge-routing` tried to assert on
  `marker-end`, discovered edge `<path>` elements don't render under
  `renderToStaticMarkup` (React Flow measures handles via a
  `ResizeObserver`-driven effect that never fires under SSR), and fell back
  to asserting handle positions instead — leaving the marker's visual
  correctness manually-verified-only, which is exactly how this regression
  shipped unnoticed. The marker `<defs>` block itself, unlike the edge path,
  is driven directly by the `edges` array and does render under SSR — so a
  new assertion on the `<marker>`'s polyline paint is addable within the
  same static convention, no new test dependency.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `editor-graph-view`: the existing requirement "Graph edges display a
  directional arrowhead" is clarified to state the arrowhead must be
  visually rendered (non-transparent), not merely present as a marker
  reference in the SVG — closing the gap that let this regression ship with
  no automated coverage of the arrowhead at all.

## Impact

- `packages/editor/src/graph/GraphView.tsx` — `markerEnd` construction in the
  `edges` mapping only. No other file changes; no schema, engine, or ELK
  layout changes.
- `packages/editor/test/graph-view-rendering.test.tsx` — new assertion on
  the marker `<defs>` block's polyline paint (the existing
  `renderToStaticMarkup` convention, no new dependency).
