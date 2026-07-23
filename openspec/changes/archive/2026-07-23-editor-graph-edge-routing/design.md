## Context

`GraphView.tsx` renders the read-only FSM graph (`editor-graph-view`
capability) with React Flow's default node type (handles fixed to
Top/Bottom) and default edge type (Bezier curve). `layout.ts` runs ELK with
`elk.direction: RIGHT`, laying the graph out horizontally. The mismatch means
every edge — including a simple forward `capture -> review` hop — leaves a
node from the bottom and re-enters from the top, producing wide, unnecessary
loops instead of short, direct connections. Verified in-browser against
`examples/expense-approval.json`.

A related bug, found while investigating the above: `fitView` fires on React
Flow mount, before the async ELK layout (`useDraftGraphLayout.ts`) has
resolved node positions. The graph does not fit the visible viewport on first
load; only a manual zoom-out reveals the full graph.

A second related gap, found during this analysis: `GraphView` is not
remounted when a different process is loaded/imported into an already-open
editor session — `FileToolbar` calls `replace()` inside the same
`DraftProvider` (`draft/store.tsx`). A naive one-shot `fitView` guard would
then stay permanently consumed after the first load, so a later Load/Import
would silently stop refitting. Load and Import are always-clickable buttons,
not a hypothetical edge case, so this is in scope alongside the fitView fix.

## Goals / Non-Goals

**Goals:**
- Make forward edges direct (no unnecessary loop) by aligning handle
  positions with the ELK horizontal layout direction.
- Disambiguate near-overlapping counter-edges (e.g. an automatic failure
  path and a manual retry path between the same two steps) with directional
  arrowheads.
- Fix `fitView` so it fits the graph after layout resolves, on first load
  and after every later Load/Import — including a reload of an unchanged
  process — without refitting on ordinary structural edits (zoom/pan should
  persist across those).
- Preserve the existing read-only guarantee (`editor-graph-view` requirement
  "Graph view is read-only in v1") exactly — no connect-by-drag affordance,
  no persisted drag-reposition.
- Get there with the smallest change React Flow's public API supports —
  prefer node/edge data fields over a custom component wherever the
  built-in component already does the job.

**Non-Goals:**
- A custom React Flow node or edge component. Ruled out during review (see
  Decisions) — the built-in default node already supports everything this
  change needs.
- Real obstacle-avoidance routing (edges routed around intervening nodes
  with waypoints). Evaluated and rejected for this change; revisit only if
  the fixed-handle approach proves inadequate on more complex graphs.
- Visual offset/separation of near-overlapping counter-edges (e.g. pulling
  `book <-> booking_error` apart). Arrowheads are judged sufficient for now;
  revisit if it proves confusing in practice.
- Any change to `layout.ts`'s ELK options or `NODE_WIDTH`/`NODE_HEIGHT` —
  routing changes stay entirely on the React Flow side.
- Any change to `draftToGraph` (Draft -> node/edge structure mapping) —
  `test/graph-mapping.test.ts` is unaffected.

## Decisions

**No new package for edge routing.** `@jalez/react-flow-smart-edge` is the
only fork of `@tisoap/react-flow-smart-edge` compatible with `@xyflow/react`
v12+, and would give true obstacle-avoidance routing. Rejected: a
single-person fork with one commit since creation (June 2025), 4 GitHub
stars, 0 forks, transitively pulling in a `pathfinding` dependency; the
upstream original has been archived for 3+ years. Doesn't fit this repo's
dependency discipline (CLAUDE.md: one CEL library, pinned tooling, no
incidental abstractions). Decision: build it with pieces `@xyflow/react`
already ships.

**Handle positions: node-level `sourcePosition`/`targetPosition`, no custom
node type.** The original brainstorming session proposed a custom node
component with hardcoded `Position.Left`/`Position.Right` handles. Review
found this unnecessary: `sourcePosition?: Position` and
`targetPosition?: Position` are first-class, typed fields on `NodeBase`
(`@xyflow/system/dist/esm/types/nodes.d.ts`), and `NodeWrapper` already
reads them off each node object and forwards them to whichever node
component renders it (`sourcePosition: node.sourcePosition, targetPosition:
node.targetPosition`, confirmed in the installed `@xyflow/react` bundle
v12.11.2, `dist/esm/index.js` ~line 2349). The built-in `DefaultNode` itself
consumes exactly these two props to place its handles:

```js
function DefaultNode({ data, isConnectable, targetPosition = Position.Top, sourcePosition = Position.Bottom }) {
  return [Handle(target, targetPosition, isConnectable), data?.label, Handle(source, sourcePosition, isConnectable)];
}
```
(`dist/esm/index.js` ~line 2003)

So the fix is two fields added to every node object `GraphView.tsx` already
produces — `sourcePosition: Position.Right, targetPosition: Position.Left`
— with `type` left unset (defaults to `"default"` → `DefaultNode`, as
today). This makes forward edges direct without any loop, with no
`nodeTypes` registration, no new component, and none of the risk below.

**Read-only guarantee needs no new attention.** Because the node stays the
built-in `DefaultNode`, the existing read-only guarantee
(`editor-graph-view` requirement "Graph view is read-only in v1") is
untouched by this change — no new component exists that could forget to
forward `isConnectable`. For completeness, the same bundle read that ruled
out a custom node also confirms `DefaultNode`'s two `<Handle>` elements
already receive `isConnectable` from `NodeWrapper`, which computes it from
each node's `connectable: false` (~line 2229) — unchanged, already correct
today, and unaffected by adding `sourcePosition`/`targetPosition`. (Had a
custom node been built, `HandleComponent` defaults `isConnectable` to
`true` and uses it to toggle the `connectionindicator` CSS class, which
flips `pointer-events` from `none` to `all` — the actual interaction
switch, not the downstream `isConnectableStart` check — so a hand-rolled
node that dropped the forward would have silently lifted the read-only
guarantee. Worth recording here in case a future change ever does introduce
a custom node for this graph.)

Also because the node type doesn't change: no `nodeTypes` prop is added to
`<ReactFlow>`, sidestepping the common React-Flow footgun of passing an
inline `nodeTypes={{...}}` (or `edgeTypes={{...}}`) object literal that gets
recreated on every render — React Flow warns about this and it can cause
avoidable re-renders. Not applicable here since neither is needed:
`"smoothstep"` is a pre-registered built-in edge type key
(`builtinEdgeTypes.smoothstep`, confirmed in the bundle), usable via
`edge.type` alone.

**Edge style: `smoothstep`.** Chosen over the default Bezier (which produces
the loops) and over `type: "straight"` (compared in-browser; less legible at
right-angle turns) — right-angle segments read clearly against the
horizontal ELK layout.

**Directional arrowheads (`markerEnd`).** Needed because a backward edge
between the same two nodes (e.g. `book` --automatic guard
`booking_status == 'failed'`--> `booking_error`, and `booking_error`
--manual `retry-booking`--> `book`) draws nearly on top of the forward edge
under fixed Left/Right handles. Without an arrowhead there is no way to tell
which line runs which direction. `markerEnd: { type: MarkerType.ArrowClosed }`
(both re-exported from `@xyflow/react`), colored to match the edge's own
`style.stroke` (`"#c00"` for an issue-flagged edge, the theme default
otherwise) — otherwise the arrowhead would render in the default color
while an issue edge's line is red, an avoidable visual mismatch.

**`fitView` signal: not `useNodesInitialized()`.** This is React Flow's own
documented standard hook for "fit after async layout," but it's wrong here.
Checked in the bundle (selector logic, `dist/esm/index.js` ~lines
4179-4192): the hook turns `true` once every node has **dimensions**
(width/height) — and `GraphView.tsx` already sets those statically from
`NODE_WIDTH`/`NODE_HEIGHT` on the very first render. The only thing that's
actually async here is the ELK **position**, not the dimension,  so
`useNodesInitialized()` would turn `true` almost immediately, before ELK
layout finishes, and `fitView()` would zoom to a stack of nodes at `(0,0)` —
the bug would persist, just more subtly.

The correct signal is the existing `useDraftGraphLayout` hook itself, which
already knows when `layoutGraph()` has resolved for the current `signature`:
- `useDraftGraphLayout` gains an additive `isLayouted: boolean` return value
  — `true` once `positions` matches the current `signature` (not leftover
  placeholder positions from a prior structure).
- `GraphView` keeps a ref to the React Flow instance via
  `onInit={(instance) => (instanceRef.current = instance)}` (no
  `ReactFlowProvider` needed — no other `useReactFlow()` consumer exists),
  and fires `instanceRef.current?.fitView()` in an effect gated by a
  `hasFitRef` flag — no refit on later structural changes (new step, new
  path). See below for exactly what that effect must depend on; `isLayouted`
  alone is not enough.

**Load/Import re-fit, and why the fit effect must depend on the load
counter too, not just `isLayouted`.** `DraftProvider`'s reducer
(`draft/store.tsx`) gains a monotonic counter — call it `loadGeneration` —
incremented only on `case "replace"` (not on `case "mutate"`), exposed via
`DraftContext`. This requires reshaping the reducer's state itself: today
`useReducer(reducer, initial ?? EMPTY_DRAFT)` uses the bare `Draft` as its
state (`draft` IS the reducer state, not a wrapper around it). Adding a
counter means the state becomes `{ draft: Draft; loadGeneration: number }`,
and every place in `store.tsx` that currently closes over the top-level
`draft` variable — the `usedLocales` and `validation` `useMemo` dependency
arrays, the `mutate`/`replace` dispatch bodies, and the context-value
`useMemo`'s own dependency array — has to read `state.draft` and list
`state.draft` (or the destructured equivalent) in its deps instead. This is
mechanical but easy to get subtly wrong (a missed dependency is a silent
stale-closure bug, not a type error), so it's called out as its own task
rather than folded into "expose a counter."

A naive implementation resets `hasFitRef.current = false` in one effect
keyed on `loadGeneration`, and fires `fitView()` in a *second* effect keyed
only on `isLayouted`. That is broken for one concrete, ordinary case:
reloading the same process. `useDraftGraphLayout`'s layout effect is keyed
on `signature` (node/edge ids), not on `loadGeneration` or draft identity —
reloading the identical file produces an identical `signature`, so that
effect does not even re-run, `positions` stays exactly as it was, and
`isLayouted` (already `true`) never changes value. A `useEffect` only
re-runs when a *value* in its dependency array changes, so the fit-firing
effect never re-fires, and the reload silently produces no refit — the same
class of bug this change sets out to fix, just for a different trigger.

The fix: the fit-firing effect must list `loadGeneration` in its own
dependency array as well, so a load event re-checks the fit condition on
its own, independent of whether `isLayouted`'s value actually flipped:

```ts
useEffect(() => { hasFitRef.current = false; }, [loadGeneration]);
useEffect(() => {
  if (isLayouted && !hasFitRef.current) {
    instanceRef.current?.fitView();
    hasFitRef.current = true;
  }
}, [isLayouted, loadGeneration]);
```

Effects in one component run in declaration order within a commit, so the
reset always lands before the check within the same render pass.

## Risks / Trade-offs

- [Fixed Left/Right handles produce visually overlapping counter-edges] →
  Mitigated by directional arrowheads for this change; full separation is
  out of scope, revisit if it proves confusing in practice.
- [No automated coverage for interactive behavior — drag-connect, fitView
  zoom/pan timing] → Mitigated by explicit manual verification steps (see
  below). Accepted trade-off: React Flow's pan/zoom/measurement runs through
  effects and browser APIs (e.g. `ResizeObserver`) that don't fire under
  `react-dom/server`'s `renderToStaticMarkup`, the one rendering convention
  this package already has (`content-locale-rendering.test.tsx`,
  `i18n-rendering.test.tsx`) — so interactive coverage would need a new
  jsdom/testing-library dependency, which isn't justified for this one
  change (same dependency-discipline reasoning that ruled out
  `react-flow-smart-edge`). Static, non-interactive properties (e.g. the
  arrowhead marker being present in the rendered SVG) are covered by a smoke
  test using that existing convention (see Manual Verification below) —
  coverage isn't literally zero, just scoped to what static markup can show.
- [`isLayouted` could be computed wrong and never flip `true`, permanently
  breaking fitView] → Mitigated by deriving it the same way
  `useDraftGraphLayout` already tracks staleness (comparing `positions`
  against the current `signature`), not a new independent mechanism.
- [Reloading an unchanged process silently skips the refit] → This was a
  real gap in an earlier draft of this design, not a hypothetical: fixed by
  keying the fit-firing effect on `loadGeneration` as well as `isLayouted`
  (see the fitView decision above), rather than relying on `isLayouted`
  alone to notice a reload.
- [Reshaping `DraftProvider`'s reducer state risks a missed dependency
  array update, causing a stale-closure bug] → Mitigated by treating the
  reshape as its own explicit task (see tasks.md) rather than an incidental
  part of "add a counter," and by adding a plain unit test directly against
  the exported `reducer` function (pure, no React/DOM needed) asserting the
  counter increments only on `replace`.

## Migration Plan

No data migration. Editor-only, client-side rendering change behind the
existing `editor-graph-view` capability; no schema, API, or persisted-state
changes. Ships as a normal editor package change; rollback is a plain revert.

## Manual Verification

Handle position, edge style, and fitView timing have no automated coverage
(see Risks); verify visually in-browser against
`examples/expense-approval.json`, plus targeted checks beyond appearance:
- **Read-only:** attempt to drag-connect between two handles — must not
  create a new edge or invoke `onConnect` (spec scenario "No connect-by-drag
  affordance exists"). Since the node stays `DefaultNode`, this is
  effectively re-confirming existing, unchanged behavior rather than
  covering new risk — but worth the one check given it's the requirement
  most easily broken by *any* graph-view change.
- **fitView:** (1) first load fits the whole graph in view; (2) a structural
  change afterward (add step/path) triggers no refit — zoom/pan persist; (3)
  a Load/Import mid-session triggers a refit again; (4) reloading the *same*
  file mid-session also triggers a refit (the case the naive
  `isLayouted`-only implementation would have missed).

Additionally, one static-markup smoke test using the package's existing
`renderToStaticMarkup` convention (no new dependency): render `GraphView`
with a two-step, one-path draft and assert the produced HTML/SVG contains a
`marker-end` reference, so a future edit that drops `markerEnd` fails CI
instead of only being caught by a human looking at the graph. This doesn't
attempt to cover handle position or fitView — those are genuinely
interaction/timing-dependent and stay manual.

## Open Questions

None outstanding. Decisions were settled during the 2026-07-23
brainstorming session, then revised during a subsequent review pass the
same day that read the installed `@xyflow/react` bundle and `store.tsx`
directly: the custom-node-type decision was dropped in favor of node-level
`sourcePosition`/`targetPosition`, and the fitView fix's dependency array
was corrected to also key on `loadGeneration`.
