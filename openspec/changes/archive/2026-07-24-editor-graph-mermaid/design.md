## Context

`GraphView.tsx` renders the read-only FSM graph (`editor-graph-view`
capability) via `@xyflow/react` (React Flow), with `layout.ts` running
`elkjs` (`elk.direction: RIGHT`, layered) to compute node positions and
`useDraftGraphLayout.ts` re-running that layout only when a structural
signature (node/edge ids) changes. Three archived changes
(`editor-graph-view`, `editor-graph-arrowhead-fix`, `editor-graph-edge-routing`)
already had to work around React Flow being an interactive-canvas framework
applied to a strictly read-only view: fixed `sourcePosition`/`targetPosition`
handles to avoid edge loops under ELK's horizontal layout, an
`@xyflow/system` marker-color spread-clobber bug that silently made
non-issue arrowheads invisible, and `fitView` timing that had to be
re-derived against ELK's async layout resolution rather than React Flow's
own (wrong, for this case) `useNodesInitialized()` signal.

Decided (in an explore-mode session preceding this proposal, not re-litigated
here): replace the stack with `mermaid`, generating a `flowchart LR` DSL
string from the existing `DraftGraph` shape and letting Mermaid own both
layout and rendering, plus `@panzoom/panzoom` for interaction and
`mermaid-isomorphic` for static/test rendering.

## Goals / Non-Goals

**Goals:**
- Replace `@xyflow/react` + `elkjs` with `mermaid` as the sole layout +
  rendering engine for the graph view, with `draftToGraph` (`mapping.ts`)
  unchanged.
- Preserve every existing `editor-graph-view` requirement's observable
  behavior: auto-layout, read-only, issue reflection, locale-resolved
  labels, direct edges with a visible arrowhead, fit-once-per-load/import.
- Restore pan/zoom via `@panzoom/panzoom`, including across Mermaid's
  full-SVG-regeneration render model (not just on structural changes).
- Keep the existing static-markup smoke-test convention alive via
  `mermaid-isomorphic`, rather than downgrading graph-view coverage to
  purely manual verification.

**Non-Goals:**
- Adopting `@mermaid-js/layout-elk` to keep ELK-quality layout. Declined:
  it's an extra dependency on top of `mermaid` itself, and `elkjs` is being
  removed outright, not kept under a different renderer.
- A custom hand-rolled SVG renderer directly over `elkjs`'s computed
  positions. Seriously considered during exploration (zero new
  dependencies, full control over BPS notation) but not the path chosen —
  the user opted for Mermaid.
- Any BPMN-style notation extensions (swimlanes, gateway diamonds, etc.).
  Out of scope; this change is a like-for-like rendering-stack swap of the
  existing FSM step/path graph.
- Any change to `draftToGraph`'s Draft → `{nodes, edges}` mapping, or to any
  non-graph editor panel.

## Decisions

**Mermaid over React Flow + elkjs.** The graph view is read-only by spec; a
text-DSL-to-static-SVG renderer matches that requirement directly instead of
requiring an interactive canvas library's built-in interactivity to be
explicitly disabled (`nodesDraggable={false}`, `nodesConnectable={false}`,
`deleteKeyCode={null}`, etc., as `GraphView.tsx` does today). It also removes
the exact class of bug the last three archived changes had to fight (handle
positions, marker-color clobbering, `fitView` timing against a second async
layout system) by eliminating the interactive-canvas layer entirely.

**Mermaid's own (dagre) layout, not `@mermaid-js/layout-elk`.** Keeping ELK
was evaluated and declined: it would mean depending on both `mermaid` and a
separate ELK-integration package to reproduce a layout algorithm
(`elkjs`) that's being removed as a direct dependency anyway. `flowchart LR`
with Mermaid's default renderer is accepted as visually "good enough";
verify against `examples/expense-approval.json` during implementation
(structural node/edge count is small — 3-6 steps in existing examples — so
dagre's layered layout is expected to look comparable, not necessarily
pixel-identical, to the current ELK output).

**`mermaid-isomorphic` over `isomorphic-mermaid` for static/test rendering.**
Both wrap Mermaid for non-browser rendering. `mermaid-isomorphic` (v3.x,
~13 known dependents, maintained by an active contributor to the
`rehype`/`unified` ecosystem) has materially wider adoption than
`isomorphic-mermaid` (v0.1.1, ~4 dependents). The likely reason
`isomorphic-mermaid`'s pure-JS `svgdom`+`jsdom`+`dompurify` approach hasn't
gained traction: `jsdom` doesn't implement `SVGTextElement.getBBox()`, which
Mermaid's layout algorithm calls to measure text for node sizing — the same
wall the Mermaid project itself hit before settling on Puppeteer
(`mermaid-cli`) for official server-side rendering. `mermaid-isomorphic`
most plausibly gets correctness by driving a real headless browser
(Playwright) internally rather than simulating one. Accepted consequence:
the editor's test/build environment likely needs a Playwright browser
install, a real but bounded one-time environment cost, not an ongoing
maintenance risk. This mirrors the reasoning the `editor-graph-edge-routing`
design doc applied when rejecting `@jalez/react-flow-smart-edge` (a
single-maintainer, low-adoption fork) — adoption and maintenance signal is a
real selection criterion in this repo, not just API fit.

**`@panzoom/panzoom` over `svg-pan-zoom`.** `svg-pan-zoom` (bumbu) has far
more existing dependents but its last release is roughly two years old.
`@panzoom/panzoom` is SVG-native, CSS-transform-based (GPU-accelerated),
~3.7kB, and actively maintained. Chosen for maintenance recency over raw
adoption count, since the API surface needed here (pan, zoom, programmatic
reset/fit) is small enough that either would technically work.

**Pan/zoom transform must be explicitly preserved across every Mermaid
re-render, not just structural ones.** React Flow keeps DOM node identity
across renders (its node/edge arrays are diffed by id), so pan/zoom state
naturally sits above whatever the nodes/edges currently are.  Mermaid instead
regenerates a full SVG string from the DSL text on every render — including
a render triggered by a pure content-locale switch, which changes no
structure at all. The replacement `GraphView` must therefore, on every
re-render: read `@panzoom/panzoom`'s current pan/zoom transform from the
outgoing SVG element (if one exists) before replacing it, mount the new SVG,
and reapply that transform (or, on first load / a `loadGeneration` change,
fit-to-viewport instead) — generalizing the `hasFitRef`/`loadGeneration`
gating the old `useDraftGraphLayout.ts` used from "only re-layout matters"
to "every re-render needs a transform decision: preserve, or refit."

**Implemented inline in `GraphView.tsx`, not as a separate hook.**
`useDraftGraphLayout.ts` and `layout.ts` are deleted outright rather than
repurposed: their reason to exist as separate files was gating an
expensive, genuinely asynchronous ELK layout pass behind a structural
signature so it didn't re-run on every keystroke. Mermaid's `render()` call
already only re-runs when `dsl` (a plain string) actually changes — React's
own dependency comparison provides that gating for free, no manual
signature-hashing needed — so the async-gating complexity that justified a
separate hook is gone. The remaining logic (capture transform, swap SVG,
reapply-or-fit) is ~30 lines with a single consumer, so it stays inline in
`GraphView.tsx` rather than behind a `usePanzoomPreservation` abstraction
with no second caller to justify it.

**Issue highlighting via generated `style`/`classDef`/`linkStyle`
directives.** `validation.issues` is filtered by `entityId` per node/edge
today (`GraphView.tsx`'s `.filter((i) => i.entityId === n.id)` pattern). The
Mermaid DSL generator reproduces this by emitting a `style <nodeId>
stroke:#c00,stroke-width:2px` line per flagged node and a `linkStyle <edgeIndex>
stroke:#c00` line per flagged edge (Mermaid indexes links positionally, so
the generator must track each edge's emission index, not just its id).
Tooltip-style issue detail (currently a `title` attribute on the React node)
has no direct Mermaid equivalent for hover text; deferred — see Open
Questions.

**Locale-resolved labels embedded directly into the generated DSL string.**
`resolveLocalizedText(step.label, contentLocale, baseLocale)` is called at
DSL-generation time (same as `draftToGraph` does today via `mapping.ts`,
unchanged) and the resolved string is interpolated into the node's Mermaid
label text. Mermaid node text needs quoting/escaping for characters that
collide with its own syntax (`"`, `[`, `]`, `|`); the generator must escape
resolved label text, not just interpolate it raw.

**Fit-to-viewport computed explicitly from the diagram's own bounds, not
relied on implicitly via Mermaid's responsive SVG sizing.** Mermaid's root
`<svg>` ships `width="100%"` plus a `viewBox` sized to its content, so the
browser already scales the diagram to fill the container's width on its
own — but that's width-only, and the container has a fixed height with
`overflow: hidden`, so a diagram whose natural aspect ratio renders taller
than the container would be vertically clipped rather than fitted.
`computeFitTransform` (`GraphView.tsx`) instead reads the diagram's actual
`viewBox` and the container's `getBoundingClientRect()`, scales to the
smaller of the two axis ratios (capped at 1, so a small diagram isn't
blown up to fill the container), and centers it via `panzoom.pan()` — a
real 2D fit rather than leaning on the browser's own layout. Kept as a
pure function (content/container dimensions in, `{scale, x, y} | null`
out) separate from the DOM access around it specifically so it's
unit-testable without a browser (`test/graph-fit-transform.test.ts`),
matching this repo's convention of giving non-trivial branching logic one
direct runnable check.

## Risks / Trade-offs

- [`mermaid-isomorphic` needing a real headless browser weighs down the
  devcontainer/CI test environment] → Accepted explicitly by the user;
  bounded to a one-time browser install, not an ongoing per-run cost beyond
  normal headless-browser startup time.
- [Mermaid may render all arrowheads through one shared `<marker>` def,
  reintroducing a version of the exact "recolor an issue edge's arrowhead"
  problem `editor-graph-arrowhead-fix` had to solve for React Flow] →
  Unverified until implementation; the DSL-based `linkStyle` mechanism styles
  the line stroke but arrowhead-marker recoloring in Mermaid's default theme
  needs a concrete check (does per-edge `linkStyle` affect the marker, or
  only the path?) before this requirement can be marked satisfied. Flag as an
  explicit verification task, not an assumption.
- [Dagre's layout output looks meaningfully different from ELK's for larger
  graphs] → Low risk given current example sizes (single-digit step counts);
  verify visually against all three `examples/*.json` files during
  implementation. Revisit `@mermaid-js/layout-elk` only if this proves
  materially worse in practice.
- [Panzoom transform-preservation logic has a gap — e.g. a re-render that is
  neither "first load" nor "pure locale switch" but something in between —
  silently resets or freezes the viewport] → Mitigate by modeling it as one
  explicit state machine (fit-once / preserve / refit-on-load) analogous to
  today's `isLayouted`/`loadGeneration` gating, with the same kind of manual
  verification checklist `editor-graph-edge-routing`'s design doc used
  (first load, structural edit, Load/Import, reload of unchanged file — plus
  the new case: locale switch preserves viewport).
- [No automated coverage for interactive pan/zoom behavior] → Same accepted
  trade-off the existing `editor-graph-edge-routing` design doc already made
  for React Flow's interactive behavior: static markup smoke tests
  (now via `mermaid-isomorphic`) cover structural output; pan/zoom
  interaction stays manually verified.

## Migration Plan

No data migration. Editor-only, client-side rendering change behind the
existing `editor-graph-view` capability; no schema, API, or persisted-state
changes. Ships as a normal editor-package change. Rollback is a plain revert
of the package.json dependency changes and the rewritten `graph/` files.

## Open Questions

Both resolved during implementation:

- **Arrowhead-marker recoloring**: confirmed empirically (rendered a sample
  diagram via `mermaid-isomorphic` and inspected the output SVG) that Mermaid
  handles this natively — a `linkStyle <index> stroke:#c00` line makes
  Mermaid auto-generate a distinct, colored marker variant (id suffixed
  `__c00`, with matching `stroke`/`fill`) and point that edge's `marker-end`
  at it, rather than the shared default marker. No themeVariables override or
  post-render DOM patch was needed; `test/graph-view-rendering.test.tsx`
  asserts this directly.
- **Validation-issue tooltip text**: dropped for this change rather than
  given an `<svg><title>` equivalent. The spec requirement ("node displays an
  indicator that it has issues") is satisfied by the visible `⚠ N` label
  badge and the red stroke `generateMermaidDsl` already emits; hover-only
  detail text was a bonus in the React Flow implementation, not a scenario
  the `editor-graph-view` spec itself requires. Revisit only if this proves
  to matter in practice.
