## Context

See `proposal.md` for motivation. This section covers only what the
approach needs.

`canvas/layout.ts`'s `autoPlaceSteps(steps, initialStepId, existingLayout)`
already computes a depth-ordered position for a step absent from
`existingLayout`, through a breadth-first walk from `initialStepId`. It
skips a step already present. It is a rendering default: `CanvasView.tsx`
calls it inside a `useMemo`, and nothing persists its output until an
author drags the step. Arrange is a different operation. It overwrites
every step's position at once, on explicit invocation, and it persists
immediately.

`saveState.layout` (`EditScreen.tsx`) is `Record<string, unknown>`, where
a step id key holds a `Point`. Three reserved sibling keys share the
object: `canvasEdgeStyle` (`EdgeStyle`), `waypoints` (`Record<pathId,
Point[]>`, from `canvas/geometry.ts`'s `WaypointRoute` machinery), and
`groups` (`StepGroup[]`, from `canvas/groups.ts`).

Each of those three keys already has its own reader and writer in
`EditScreen.tsx`, named `onEdgeStyleChange`, `onWaypointsChange` and
`onGroupsChange`. All three follow one pattern:
`setSaveState((s) => ({ ...s, layout: { ...s.layout, <key>: next } }))`.
This is a separate channel from the `Draft` model's `mutate()`, since
position, like edge style and waypoints, is presentation. None of the
three reach `ProcessBody`.

`canvas/groups.ts`'s `StepGroup` is `{ id, stepIds, name, collapsed? }`.
Its `groupBox(group, positions)` returns the bounding `Box` around a
group's present members, plus `GROUP_MARGIN` (20). It returns
`undefined` under two members. A sibling function, `drawnBox`, returns
that box, collapsed to `NODE_SIZE` (`{ width: 180, height: 60 }`) at its
own corner, whenever `collapsed` is `true`.

`geometry.ts`'s `GRID_STEP` is 20, and `snapToGrid(point)` rounds to the
nearest multiple. In `layout.ts`, `COLUMN_WIDTH` (240) and `ROW_HEIGHT`
(120) are already whole multiples, so `autoPlaceSteps`'s own output
needs no snap. Three write sites already snap explicitly: `onMoveStep`,
the drag-release write, and the palette-drop write. So a position enters
`layout` pre-rounded at every existing write site.

The canvas toolbar (`.canvas-toolbar` in `CanvasView.tsx`) already holds
"Fit to view" and the edge-style toggle. Both are plain
`<button type="button" className="btn btn-secondary">` elements, each
wired through a prop `CanvasView` receives and `EditScreen.tsx` supplies.
Elsewhere, `panels/DraftToolbar.tsx` guards Publish and Discard with the
native `confirm(t(key))`, gated `if (!confirm(t(key))) return;`.

This change cites its own research in `proposal.md`. Two libraries ran
against the real cyclic edge lists, `d3-dag@1.2.2` and
`@dagrejs/dagre@3.1.1`. Both runs used edges taken from
`expense-approval.json` (one back edge) and `purchase-requisition.json`
(four back edges). Both ran inside an isolated scratch package outside
this repo's workspace glob.

Neither run threw. Both `graphConnect`/`sugiyama()` and `dagre.layout()`
accepted the cyclic lists as input. Inside `dagre.layout()`, an acyclic
pass runs automatically as one step of that single call. Neither library
needed caller-side back-edge detection.

A follow-up probe checked `dagre.layout()`'s own coordinate convention,
with two same-size nodes and a generous separation. The first node in a
two-node chain centered at `x = 90`. Its `width` was 180, and its
`marginx` sat at the default of 0. That means the node's left edge sits
at exactly 0. So a returned `{x, y}` is a node's CENTER, not its
top-left corner.

This codebase's own `Point` convention, from `canvas/geometry.ts`, is
top-left throughout: `hitTestNode`'s bounds check and `onMoveStep`'s
write both use it. Then `arrange.ts` converts it on the way out.

## Goals / Non-Goals

**Goals:**
- One pure function computes a position for every step in a draft. It
  takes the draft's current groups and its current stored positions as
  input. The stored positions matter only for a group's pre-arrange box
  size, never as a floor for the new result.
- The result already sits on the canvas lattice.
- A collapsed or an expanded group moves as one rigid unit. Every member
  keeps its position relative to the group's own box, unchanged.
- An author invokes this from the canvas toolbar, behind a confirmation
  step that names what an arrange discards.

**Non-Goals:**
- No manual rank constraint forces `initialStepId` into column 0. A
  true source step, one with no incoming path, already lands at the
  lowest reachable rank on its own. That comes from `dagre.layout()`'s
  own network-simplex ranker. The probe against `purchase-requisition.json`
  placed its actual initial step at the smallest `x` of all 13.
- No new persisted flag records whether a draft's positions came from an
  arrange, a drag, or the rendering default. One existing rule already
  answers what this change needs to ask. An author's explicit action,
  and only that, writes `layout[stepId]`.
- No change to how a collapsed group's box computes today. Both
  `groupBox` and `drawnBox` stay as they are; arrange only adds a
  caller of them.
- No undo stack. The confirm dialog is this stage's whole answer to "an
  arrange overwrote my layout," per the roadmap item's own framing.

## Decisions

### 1. `@dagrejs/dagre`, not `d3-dag`

The roadmap entry's own branch condition is whether `graphConnect`
throws on a cycle. That condition does not hold: neither library throws,
on either example file's real back edges. That removed the entry's
stated reason to favor `dagre`. Three measured properties decided it
instead.

Bundle weight: an `esbuild --bundle --minify --format=esm` pass measured
everything each library exports. That pass found `d3-dag` at 37.7kb
gzipped, against `dagre` at 16.9kb. That `d3-dag` weight comes from
three extra runtime dependencies this canvas has no use for. Each backs
an optimizer-based layout operator: `d3-array`, `javascript-lp-solver`
and `quadprog`. By contrast, `dagre` carries one dependency,
`@dagrejs/graphlib`.

Coordinate convention: `dagre`'s `rankdir: "LR"` returns rank on `x`
and lane on `y`. Those are pixel-scale units, matching `nodesep`/
`ranksep` directly. That is the same axis assignment `autoPlaceSteps`
already uses: depth to column, same-depth order to row. By contrast,
`d3-dag`'s `sugiyama()` defaults to rank on `y`, top-to-bottom, in
unitless coordinates. Fitting this canvas would need both an axis swap
and a scale step.

Types: `@dagrejs/dagre` ships its own `dist/types/index.d.ts` through its
package `exports` map. That means the codebase needs no separate
`@types` package. Its types also carry none of the drift risk a
community-maintained `@types` package carries.

Both are MIT-licensed, and this repository's own `license` field
(`AGPL-3.0-or-later`) confirms both are compatible.

**Alternative considered:** `d3-dag@1`. The three properties above rule
it out, not cycle safety.

### 2. Arrange clears every stored waypoint

A waypoint (`layout.waypoints[pathId]`) is an absolute point. An author
drags it into place, relative to its path's two endpoints as they stood
at drag time. Arrange moves both endpoints. A stale waypoint then draws
the route through empty space. That is the risk the roadmap item names.

Arrange sets `layout.waypoints` to `{}`, matching `onWaypointsChange`'s
own empty-list convention. Whenever the draft carries at least one
waypoint, the confirm dialog's copy names that loss. It names the loss
of positions too.

**Alternative considered:** re-project each waypoint by the same delta
its nearer endpoint moved. Rejected: a waypoint's two endpoints tend to
move by different deltas, along different axes, after a re-rank. So no
single transform keeps a multi-segment route looking intentional. A
cleared waypoint draws correctly, if plainly, until the author bends it
again.

### 3. A group arranges as one rigid node, sized from RESOLVED positions

`groupBox`/`drawnBox` need a real `Point` for at least two members, or
they return `undefined`. A member can lack an entry in `existingLayout`
for three reasons. It was never dragged, or it loaded from JSON through
the JSON view. It can also belong to a group created right after
grouping two never-dragged steps. That member is exactly the state
`existingLayout` alone cannot size.

So `arrangeSteps` first builds a RESOLVED position map, one entry per
step. Each entry is `existingLayout`'s own entry where one exists, and
`autoPlaceSteps(steps, initialStepId, existingLayout)`'s computed
default otherwise. This is the same fallback `CanvasView.tsx`'s own
`positionOf` already applies for rendering; arrange reuses it rather
than inventing a second one.

Every group, collapsed or expanded, becomes one synthetic node in the
graph `dagre` positions, against those resolved positions. That node's
size comes from `drawnBox(group, resolvedPositions)`: `NODE_SIZE` when
collapsed, the live bounding box when expanded. It never returns
`undefined`, since every member now resolves to a real point. An edge
between two members of the same group drops before the graph reaches
`dagre`. So no self-loop reaches it. An edge between a member and
anything outside the group becomes an edge on the group's own
synthetic node instead.

Here, `dagre.graphlib.Graph` is not a multigraph. So two members with
edges to the same outside step collapse to one edge automatically.

Once `dagre.layout()` returns, arrange computes each group's new
top-left corner. That corner is its returned center, minus half its own
`drawnBox` width and height. Arrange compares that new corner against
the group's OLD top-left corner. That OLD corner comes from the same
`drawnBox` call, against `resolvedPositions`, taken before arrange ran.

Every member's stored position then moves by that one delta. It starts
from its own entry in `resolvedPositions`, not from a possibly-absent
`existingLayout` entry. A step outside any group gets its own computed
position directly. That conversion, center minus half `NODE_SIZE`, is
the same one `arrange.ts` applies to every ordinary node.

This answers an open question `tmp/open-work-priority.md`'s item 15
raises in its own step 3. That is a planning note, not `ROADMAP.md`'s
stage 38 entry itself. The stage 38 entry never mentions groups at all.
The question: whether to feed the group to `dagre` as one node, or to
expand every group before arranging. This design picks the first
approach.

The delta-translate step makes an expanded group's pre-arrange size
usable as an input. That works because `dagre` never sees the group's
members individually, and it never needs to re-flow them.

**Alternative considered:** expand every group before arranging, and lay
out every step individually. Then let a group's box re-derive from
wherever its members land. Rejected: `groupBox` reads whichever members
`positions` holds, with no ordering hint. So if `dagre` places two
members on opposite sides of the graph, their box would span the space
between them. That would defeat the reason a group exists.

### 4. Every written position passes through `snapToGrid` at the write boundary

`arrange.ts` stays a pure geometry module. That is the same rule
`autoPlaceSteps`, `geometry.ts`'s route functions, and `groups.ts`'s box
functions already keep. None of them import from React, and none import
from `EditScreen.tsx`. So `arrangeSteps`'s own return value is not
itself snapped.

The caller in `EditScreen.tsx` runs every returned point through
`snapToGrid` before the `setSaveState` write. That is the same boundary
`onMoveStep` and the palette-drop handler already snap at. Two concerns
stay separate this way: computing a point, and rounding it onto the
lattice. That is the line `geometry.ts`'s own doc comment on
`snapToGrid` already draws.

### 5. The confirm dialog gates on whether an arrange has anything to discard

An explicit author action, and only that action, writes `layout[stepId]`.
That action is a drag's release, a palette drop, or, once this change
ships, an arrange. A step still on the rendering default carries no key
at all. But a waypoint reaches `layout.waypoints` on its own: dragging a
path's midpoint handle needs no step ever hand-placed first.

So the gate checks two independent things, not one. It evaluates
`steps.some((s) => s.id && layout[s.id] !== undefined) ||
Object.keys(layout.waypoints ?? {}).length > 0`. Either alone is enough
for an arrange to discard something.

A brand-new canvas, with nothing yet dragged and no waypoint bent into
any path, arranges at once. Any other draft confirms first, through the
same `confirm(t(key))` pattern `DraftToolbar` already uses for Publish
and Discard. Its copy names positions and, per Decision 2, waypoints.

### 6. The Arrange control sits in the existing canvas toolbar

A new `<button type="button" className="btn btn-secondary">` joins Fit
to view and the edge-style toggle in `.canvas-toolbar`. It wires through
a new `onArrange` prop on `CanvasView` that `EditScreen.tsx` supplies,
mirroring `onEdgeStyleChange`'s own wiring exactly.

It stays a secondary button. Save, Discard and Publish already hold
this screen's one accent-styled primary action, per
`design-language.md`'s "one primary action per screen" rule. Two new
keys join `packages/web/src/i18n/catalogs/studio.ts`: `canvas.arrange`
for the button label, and `canvas.arrangeConfirm` for the confirm copy.
Both stay EN only, matching this catalog's existing single-locale scope.

### 7. `arrangeSteps` lives in a new module, not inside `layout.ts`

`layout.ts`'s own doc comment describes `autoPlaceSteps` specifically as
the missing-only rendering default. A second function would blur that
boundary if it lived in the same file. That second function has the
opposite completeness contract: every step, always.

`canvas/arrange.ts` exports two functions. The first is
`arrangeSteps(steps: LayoutStep[], groups: StepGroup[], initialStepId:
string | undefined, existingLayout: Record<string, unknown>):
Record<string, Point>`. It returns a position for every step id,
unconditionally. Its `initialStepId` parameter is what lets it build
the resolved position map Decision 3 needs.

The second function is `hasHandPlacedStep(steps: LayoutStep[], layout:
Record<string, unknown>): boolean`. It is Decision 5's gate predicate.
It lives in its own function rather than staying inline. That module,
`draftToolbarState.ts`, extracts `isDirty` the same way, and tests it
for Publish's own confirm gate.

Their own test file, `packages/web/test/studio-canvas-arrange.test.ts`,
covers both in isolation, before any React wiring. That mirrors how
`packages/web/test/studio-canvas-layout.test.ts` already covers
`autoPlaceSteps`, and `packages/web/test/studio-canvas-fit.test.ts`
covers the fit-to-view arithmetic.

### 8. Flow order exempts a path that closes a cycle

Every layered graph algorithm has a name for this kind of path: a back
edge. A back edge is a path whose target already precedes its own
source, once ranking runs. That same acyclic pass inside
`dagre.layout()` exists to find one. The Context section above already
cited it.

This platform calls the same thing a rework loop: a path back to a step
the process already passed through. Two example processes confirm it:
`expense-approval.json` carries one back edge, and
`purchase-requisition.json` carries four back edges. The Context
section above already confirmed both counts.

A two-step cycle makes both directions of the flow-order rule
impossible to satisfy at once. Satisfying it would need each step's
column to exceed the other's. So the delta spec's flow-order
requirement exempts a path that closes a cycle. It does not state an
unconditional rule the platform's own example processes would violate.
Instead, `arrangeSteps` still gives both steps in a rework loop a
position on the lattice. It only stops asserting which one sits in the
later column.

**Alternative considered:** state the flow-order rule as unconditional,
and treat a back edge's violation as an accepted, undocumented gap.
Rejected: an unconditional SHALL that a requirement's own reference
data violates is a contradicted invariant. It is not a rounding error
to shrug off silently.

## Risks / Trade-offs

- **A disconnected step, with no path in or out, lands somewhere
  `dagre` chooses, not somewhere this design names**. That is
  `dagre.layout()`'s own tested behavior: it places a disconnected
  component predictably, not a gap this change introduces. The test file
  `packages/web/test/studio-canvas-arrange.test.ts` asserts on that
  instead: an
  isolated step's presence, and its lattice alignment. It does not
  assert on a coordinate no requirement promises.
- **A large graph could build up a rank spacing wide enough to push a
  step off-canvas**. This is no different from today: a hand-placed
  graph already has no bound on canvas extent. Its existing "Fit to
  view" control, in `CanvasView`, already answers both cases.
- **`@dagrejs/dagre`'s next major version could change its coordinate
  convention or its cycle-handling behavior**. The dependency carries
  a caret range (`^3.1.1`), not a pin. That matches this package's other
  UI-only dependencies. Nothing here reaches `definitionHash` or an
  immutable published body, the way `@marcbachmann/cel-js`'s exact-pin
  reasoning requires.

## Migration Plan

Additive only. No stored draft, and no published version, references
anything this change adds. A draft saved before this change ships opens
exactly as it does today. The Arrange control writes into a blob every
draft already carries. It adds no field a reader must expect.

## Open Questions

None. The Decisions above answer every question `ROADMAP.md`'s stage 38
entry raised. They also answer every question
`tmp/open-work-priority.md`'s item 15 planning steps raised. That
includes the group-handling question the planning note raises on its
own. The roadmap entry itself never raises that question.
