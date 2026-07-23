## Why

`GraphView.tsx` uses React Flow's default node (Top/Bottom handles) and default
edge type (Bezier), but the ELK layout (`layout.ts`) lays the graph out
horizontally (`elk.direction: RIGHT`). Every edge — even a simple
`capture -> review` — leaves Top/Bottom instead of Left/Right, producing wide,
looping curves instead of short, direct connections. A related bug: `fitView`
fires on React Flow mount, before the async ELK layout
(`useDraftGraphLayout.ts`) delivers positions, so the graph does not fit the
visible area on first load. Both were verified in-browser against
`examples/expense-approval.json`.

## What Changes

- Set `sourcePosition: Position.Right` / `targetPosition: Position.Left` on
  every node `GraphView.tsx` produces, matching the ELK horizontal layout
  direction. React Flow's built-in default node already reads these two
  fields off the node object and already forwards `isConnectable` to both
  its handles — confirmed by reading the installed `@xyflow/react` bundle —
  so no custom node type, no `nodeTypes` registration, and no rendering
  change is needed to fix the routing; the node stays the default node
  throughout.
- Switch edges to `type: "smoothstep"` (right-angle segments) instead of the
  default Bezier curve.
- Add `markerEnd` (arrowhead) to every edge, needed to disambiguate
  near-overlapping counter-edges between the same two nodes under fixed
  Left/Right handles (e.g. an automatic-guard failure path and a manual retry
  path between the same two steps). An issue-flagged edge's marker is
  colored to match its red stroke, so the two stay visually consistent.
- Fix `fitView` firing before layout resolves: `useDraftGraphLayout` gains an
  additive `isLayouted: boolean` return value; `GraphView` captures the React
  Flow instance via `onInit` and fires `fitView()` when `isLayouted` is true
  and a `hasFitRef` gate hasn't already been consumed, so later structural
  changes don't trigger a refit.
- Fix a related gap found during analysis: importing/loading a different
  process into an already-open session does not remount `GraphView` (it calls
  `replace()` in the same `DraftProvider`), so the one-shot fit ref would stay
  permanently consumed. `DraftProvider`'s reducer state changes shape (from a
  bare `Draft` to `{ draft: Draft; loadGeneration: number }`) with the counter
  incremented only on `case "replace"`, exposed via `DraftContext`; `GraphView`
  resets its fit-ref when the counter changes. That reset alone is not
  sufficient — see design.md's note on the fit-effect's own dependencies —
  the effect that calls `fitView()` must also depend on the counter, not
  only on `isLayouted`, or a reload of an unchanged structure (same process,
  reloaded) would silently skip the refit.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `editor-graph-view`: adds requirements for direct (non-looping) edge
  routing via fixed Left/Right handles, directional arrowheads on edges, and
  correct `fitView` behavior (fits after layout resolves on first load and on
  every subsequent load/import, does not refit on ordinary structural edits).
  The existing read-only requirement is unaffected — the node stays the
  default node type, so no new scenario is needed for it.

## Impact

- `packages/editor/src/graph/GraphView.tsx` — per-node `sourcePosition`/
  `targetPosition`, edge `type`/`markerEnd`, `onInit` instance ref, `fitView`
  trigger effect.
- `packages/editor/src/graph/useDraftGraphLayout.ts` — new `isLayouted`
  return value.
- `packages/editor/src/draft/store.tsx` — reducer state reshaped to carry a
  monotonic load-generation counter alongside the `Draft`, incremented only
  on `case "replace"`; every internal reference to the bare `draft` state
  (mutate, the `usedLocales`/`validation` memo deps, the context-value memo)
  updated accordingly. Exposed via `DraftContext`.
- No schema, engine, or ELK layout-option changes. No new dependencies (no
  package for real obstacle-avoidance routing — evaluated and rejected, see
  design.md). No custom React Flow node/edge component of any kind.
- No automated test today covers interactive graph behavior (drag, fitView
  timing) — that stays manually verified in-browser (see design.md
  verification section). A static-markup smoke test (existing
  `renderToStaticMarkup` convention, see design.md) covers the arrowhead's
  presence, and the new reducer counter logic gets a plain unit test.
