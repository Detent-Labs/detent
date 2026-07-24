## Why

The graph view's rendering stack (`@xyflow/react` + `elkjs`) is an interactive
canvas framework applied to a view that is strictly read-only. The last three
archived changes against `editor-graph-view` (`editor-graph-view`,
`editor-graph-arrowhead-fix`, `editor-graph-edge-routing`) spent most of their
effort fighting React Flow's interactive-canvas API for behavior the spec
explicitly forbids or doesn't need: working around fixed handle positions to
avoid edge loops, chasing an `@xyflow/system` marker-color bug, and
synchronizing `fitView` against elkjs's async layout. A text-DSL diagramming
tool (Mermaid) fits a static, auto-laid-out process diagram more directly, and
is a more suitable base for the custom BPS display module this editor will
likely need eventually anyway.

## What Changes

- **BREAKING** (internal only, no external contract change): replace
  `@xyflow/react` (React Flow) and `elkjs` with `mermaid` as the graph view's
  rendering and layout engine. `draftToGraph` (`mapping.ts`) is unchanged;
  `GraphView.tsx`, `layout.ts`, and `useDraftGraphLayout.ts` are rewritten.
- Generate a Mermaid `flowchart LR` DSL string from `DraftGraph` instead of
  computing node positions via elkjs and rendering React Flow node/edge
  objects. Layout is Mermaid's own default (dagre) — the `@mermaid-js/layout-elk`
  plugin is deliberately not adopted.
- Add `@panzoom/panzoom` to restore pan/zoom interaction on the rendered SVG,
  wired to explicitly capture and reapply the current pan/zoom transform
  across every re-render (Mermaid regenerates the full SVG from text on each
  render, unlike React Flow's incremental node/edge diffing).
- Add `mermaid-isomorphic` as a dev dependency so the existing static-markup
  smoke-test convention (`test/graph-view-rendering.test.tsx`) keeps working
  without a full manual/browser-only verification step.
- Remove `@xyflow/react` and `elkjs` from `packages/editor/package.json`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `editor-graph-view`: requirements are unchanged in substance (same
  node/edge/read-only/issue/locale/arrowhead/fit-viewport behavior), but the
  "fits the viewport" requirement gains one new scenario: pan/zoom state must
  also survive a non-structural re-render (e.g. a content-locale switch),
  since Mermaid regenerates the full SVG on every render rather than only on
  structural changes — a distinction the current React-Flow-based
  implementation doesn't have to make.

## Impact

- `packages/editor/src/graph/GraphView.tsx`, `layout.ts`,
  `useDraftGraphLayout.ts` — rewritten. `mapping.ts` — unchanged.
- `packages/editor/package.json` — remove `@xyflow/react`, `elkjs`; add
  `mermaid`, `@panzoom/panzoom`, `mermaid-isomorphic` (dev).
- `packages/editor/test/graph-view-rendering.test.tsx` and any other test
  depending on React-Flow-shaped node/edge output — rewritten against the
  Mermaid-generated SVG.
- Editor dev/test environment: `mermaid-isomorphic` likely drives a real
  headless browser (Playwright) for correct text-measurement during
  rendering — the devcontainer/CI environment may need a Playwright browser
  install. Accepted cost, not an open question.
- No engine, schema, or Runtime API changes; purely an editor-package,
  client-side rendering swap.
