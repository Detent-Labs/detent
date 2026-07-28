## Context

`packages/studio`'s edit screen currently stacks the editor's carried-over
panels (`StepsPanel`, `PathsPanel`, …) in a single column over the Draft
model — no spatial layout, no drag-to-connect. `packages/editor` has a
read-only graph view (`GraphView.tsx`) built on Mermaid + `@panzoom/panzoom`
for pan/zoom, but Mermaid is a declarative renderer driven by a generated DSL
string; it re-lays-out from scratch on every render and has no concept of
"drag this node" or "drag from this handle to that node" — it's the wrong
tool for direct manipulation, only for display. This change needs an
authoring surface, not a nicer viewer.

The draft's persistence contract is already fully specified and unaffected:
`process-drafts` already stores `layout` (`{ [stepId]: { x, y } }`) beside
`body`, excluded from `definitionHash`, tolerant of stale/orphaned keys, and
round-tripped through the existing `GET`/`PUT /drafts/:processId` with OCC on
`revision`. `studio-app` already has an explicit Save action (not autosave) —
edits accumulate in local state and persist on save, with a 409 handled by
reload-not-merge.

That local state is split into two pieces today, and the canvas must respect
the split rather than paper over it. `EditorArea` (`EditScreen.tsx`) holds
the Draft model's `body` behind `useDraft()`/`mutate()` — the context every
panel already reads and writes — and, separately, a sibling
`useState<DraftSaveState>` (`saveState`/`setSaveState`, `draftSaveLogic.ts`)
carrying `{ revision, layout, conflict }`. `DraftToolbar`'s save call sends
`{ body: draft, layout: saveState.layout, revision: saveState.revision }` —
`layout` already round-trips end-to-end today, but as an opaque value no UI
mutates; nothing named `updateLayout` exists on the Draft model, because
layout was never part of it. The canvas has to introduce that missing write
path (into `saveState`, via a new callback threaded down like
`onSaveState`/`setSaveState` already is), not "reuse" one that isn't there.
Path creation is different: `PathsPanel`'s existing "add path" action already
goes through `useDraft()`/`mutate()` (via the shared `updateInDraftArray`
helper), so drag-to-connect can call the identical path.

## Goals / Non-Goals

**Goals:**
- Direct-manipulation editing of step position and path connections on
  `/processes/:id/edit`, replacing panel-only authoring for those two
  operations.
- No new state ownership: the canvas writes path changes through the same
  `useDraft()`/`mutate()` surface panels already use, and layout changes
  through the same `saveState`/`setSaveState` surface `DraftToolbar` already
  reads for save — no third, canvas-owned copy of either.
- Reuse the existing structural validity rules (all-manual-or-all-automatic)
  from wherever they're already enforced, instead of re-encoding them.
- No new external dependency beyond what's already used elsewhere in this
  workspace for the same job (`@panzoom/panzoom`, already in
  `packages/editor`, for canvas pan/zoom).

**Non-Goals:**
- Multi-select / bulk drag of nodes.
- Edge routing around obstructing nodes — v1 edges are straight lines;
  crossing is a known limitation on dense graphs, not solved here.
- A general-purpose graph-editing capability beyond this engine's FSM shape
  (no nesting, no parallel regions — the schema doesn't have them either).
- Any new authoring operation the panels can't already do. The canvas adds a
  faster way to position and connect; deletion and every field edit stay in
  their panel.
- Minimap, keyboard-driven node creation/connection, or any other canvas
  affordance beyond drag-position and drag-connect.

## Decisions

**Hand-rolled SVG + Pointer Events, not a graph-editing library or Mermaid.**
The interaction surface is small and fixed (drag a node, drag from a handle
to a node) and the domain graph is deliberately simple (no parallelism, no
nesting — see `CLAUDE.md`'s v1 boundaries). A library like React Flow would
pull in a rendering model, its own state store, and features (minimap,
multi-select, custom node types beyond what's needed) this project doesn't
use elsewhere and doesn't need here. Plain SVG `<g>` elements per node/edge,
positioned via the Draft's `layout`, dragged via native
`onPointerDown/Move/Up`, is a few hundred lines and matches the repo's
existing low-dependency posture (plain CSS, hand-written routing hook, no
CSS-in-JS). `@panzoom/panzoom` is reused for the canvas's own pan/zoom (same
job it already does in the editor's `GraphView`) — added to `packages/studio`'s
`package.json`, not reinvented.

Found during implementation, not anticipated in the original sketch: Panzoom
binds its own down-handler directly on the SVG element via native
`addEventListener` and calls `stopPropagation()` on the first pointer event
of a gesture — *before* React's synthetic event system (delegated higher up
the tree) ever sees it, so a React-level `e.stopPropagation()` inside a
node/handle's own `onPointerDown` is too late to stop Panzoom from also
starting a pan. Confirmed live (see Risks): without a fix, every node drag
and every drag-to-connect silently became a canvas pan instead. Fixed with
Panzoom's own sanctioned escape hatch — its default `excludeClass`,
`panzoom-exclude` — added to every node and edge group, which short-circuits
Panzoom's down-handler before it touches the event at all.

**Connection validity is one shared predicate, called from two places.**
The all-manual-or-all-automatic rule (and priority-uniqueness among automatic
paths) already exists as a structural Zod refinement that live validation
runs today. Extract the pure check `canAddPath(existingPaths, candidate):
{ok:true} | {ok:false, reason}` so the canvas can call it synchronously
*before* creating an edge (inline rejection at drop time, per the proposal)
and live validation continues to run the same rule over the full draft after
the fact. One rule, two call sites — never two implementations that could
drift.

**Node drag writes to `saveState.layout`; drag-to-connect writes to the Draft
model — two different existing surfaces, not one.** Position is not body, so
it was never going to live in `useDraft()`; the canvas's layout-update
callback sets `saveState.layout[stepId]` through the same `setSaveState`
`EditorArea` already owns, keeping `layout` exactly where `DraftToolbar`
already reads it from for save. Drag-to-connect, by contrast, creates a real
schema entity (a `Path` nested under its source `Step`), so it goes through
`useDraft()`/`mutate()` the same way `PathsPanel`'s "add path" action does —
append to `step.paths` via `updateInDraftArray`, the shared helper
`array-crud-by-index-consolidation` already introduced for exactly this
shape of update. Neither path is new plumbing invented for the canvas; both
reuse whichever of the two existing surfaces already owns that kind of data.

**`StepsPanel` stays permanently mounted in the inspector; selection only
drives its accordion.** The first sketch of this decision had the inspector
swap between mounting `StepsPanel` and mounting `PathsPanel` standalone
depending on what's selected — that breaks on the very first use: with
nothing selected yet (a brand-new process, or after deselecting),
`StepsPanel`'s own list and its "+ Add step" action would be nowhere on
screen, and creating the first step would have no path in the UI at all.
Corrected shape: `StepsPanel` renders in the inspector column *unconditionally*,
list and add-action always reachable; canvas selection only controls which
step's row is expanded. That requires lifting `StepsPanel`'s currently-internal
`expanded` `useState` to an optional controlled prop
(`selectedStepId`/`onSelectStep`, falling back to today's internal behavior
when unset) — a small, real change to `StepsPanel`, not a pure re-parenting.
Selecting a path edge resolves to its *source step* and expands that step's
row the same way a direct step-click does — `PathsPanel` is already nested
inside that row, so it needs no standalone mount and no change of its own;
a path isn't an independently addressable Draft entity, it only exists
nested under its step.

**Missing/partial layout is filled by a one-time, in-memory-only auto-place,
not persisted until touched.** A draft with `layout: {}` (a new process, or
one authored entirely through panels so far) needs *some* starting position
per step or every node stacks at the origin. On load, any step absent from
`layout` gets a deterministic position from a simple BFS-depth-from-
`initialStep` pass (depth → column, sibling order → row) — computed
client-side, not written back until the user drags that node or the layout
otherwise changes, consistent with `process-drafts`' existing tolerance for
partial/stale layout. This is intentionally not a general graph-layout
algorithm (no edge-crossing minimization, no cycle handling beyond "already
visited, stop") — good enough for a one-time initial placement on the FSM
shapes this engine models, and the user can always drag to fix it.

**Accessibility parity is structural, not an add-on.** Since the canvas adds
no operation the panels can't already do (per the proposal), every canvas
action has a keyboard-reachable panel equivalent by construction. This
change does not add canvas-specific keyboard interaction for dragging; a
keyboard-only author uses the panels, same as today.

## Risks / Trade-offs

- **[Risk, materialized] Panzoom's native down-handler races React's
  synthetic dispatch and wins → [Mitigation, verified]** confirmed live in a
  real browser (`bun:test` alone could not have caught this — it's a DOM
  event-ordering interaction, not a unit of logic): every drag silently
  became a pan until every node/edge group was given Panzoom's
  `panzoom-exclude` class (see Decisions). Retested afterward — node drag
  and drag-to-connect both work, `layout` persists only the dragged step,
  and a created path round-trips through save/reload with the correct shape.
- **[Risk] Hand-rolled drag/hit-testing has more edge cases than a maintained
  library (touch support, drag-cancel on Escape, pointer capture across
  fast moves) → [Mitigation]** scope is deliberately narrow (rectangle nodes,
  single-node drag, drop-target = "pointer inside another node's bounding
  box"); `setPointerCapture` on drag start handles fast-move loss; each
  interaction gets a pure-function core (hit-testing, drag delta, connection
  validity) covered by `bun:test`, with the SVG/React wiring itself untested
  per this repo's existing convention (`packages/app/src/screens/
  inboxLogic.ts`).
- **[Risk] BFS-depth auto-layout produces poor placement on graphs with many
  back-edges or a step reachable by multiple long paths → [Mitigation]** it's
  a one-time default, not a persisted algorithm — a dragged position is
  never overwritten (same "tolerate stale/absent layout" contract
  `process-drafts` already specifies), so a bad initial placement costs one
  manual adjustment, not a recurring problem.
- **[Risk] Two authors editing the same draft concurrently could each drag
  the same node and only one save wins → [Mitigation]** already covered by
  the existing OCC/409-reload-not-merge contract; the canvas introduces no
  new conflict shape, layout changes ride the same `revision` as body
  changes.
- **[Trade-off] No edge routing means paths can visually cross on dense
  graphs.** Accepted for v1 — the engine's v1 boundary (no parallelism, one
  active step) keeps real process graphs small; revisit only if a real
  process proves this matters.

## Migration Plan

Purely additive UI change — no schema, route, or data migration. `layout`
storage already exists and is already tolerant of the shapes this change
reads and writes. Rollout is `EditScreen.tsx` restructuring its top-level
layout (stacked panels → canvas + inspector aside) in one change; panel
components are re-parented, not rewritten, with one small exception —
`StepsPanel` gains an optional controlled-selection prop (see Decisions) —
so their fields, validation, and mutation behavior are otherwise unaffected.
No feature flag — this replaces the panel-only layout outright, matching how
`studio-shell-and-drafts` replaced file persistence outright rather than
running both paths.

## Open Questions

None blocking. Two deliberately deferred, noted here so they aren't
rediscovered as oversights: multi-select/bulk-drag and edge auto-routing
(both listed under Non-Goals) — revisit if a real process's graph size makes
single-node dragging or straight-line edge crossing a genuine friction point.
