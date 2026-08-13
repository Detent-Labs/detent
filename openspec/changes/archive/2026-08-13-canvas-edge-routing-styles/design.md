## Context

See proposal.md - Why.

This `design.md` is the design of record for four canvas stages, 30 to 33. It
does not cover stage 30 alone. Item 7 in `tmp/open-work-priority.md` asked for
one design pass over the four. The geometry question in stage 30 sets what the
other three cost.

It sits here rather than under `docs/superpowers/specs/`, on purpose. Git
ignores that path. Stage 24's design doc went missing there. The
`multi-tenancy` change recorded the repair. A change's own `design.md` is the
design of record. It stays self-contained, so the trap does not close twice.

Three facts about the canvas today shape all four stages.

An edge is a straight `<line>` between two fixed anchors. The source anchor is
`{ x: source.x + NODE_WIDTH, y: source.y + NODE_HEIGHT / 2 }`. The target
anchor is `{ x: target.x, y: target.y + NODE_HEIGHT / 2 }`. A second `<line>`
with class `canvas-edge-hitarea` lies over it and carries the pointer.

The `layout` blob is opaque to the engine. `drafts.ts` checks only that it is a
JSON object. In the browser, `positionOf` guards each value with `isPoint`, and
`autoPlaceSteps` reads it by step id alone. Every step id carries a `step_`
prefix. A reserved key without one therefore cannot collide with a position.

Nodes sit on a 20-unit lattice. `COLUMN_WIDTH` is 240 and `ROW_HEIGHT` is 120.
A gutter that is a whole multiple of `GRID_STEP` keeps a route's own corners on
that lattice.

## Goals / Non-Goals

**Goals:**

- One routing computation the other three stages build on.
- A canvas-wide style, with no per-path style state.
- Stage 30 shipped. Stages 31 to 33 specified well enough to propose, with no
  question left open.

**Non-Goals:**

- Obstacle avoidance. An edge crosses a node that sits in its way.
- A straight style. Two styles ship, and neither reproduces today's rendering.
- Any change to the JSON definition. A route is presentation.

## Decisions

### The geometry is hand-rolled, and no router goes in

`routeEdge(source, target, style): Point[]` returns the route's corner points.
It lives in `canvas/geometry.ts`, pure and tested. It runs to about forty
lines.

The alternative was a connector-routing library. `libavoid-js` was the
candidate, and the user decided against it. The facts behind that call are
worth keeping. The question returns whenever an edge crosses a node.

`libavoid-js` sits at `0.5.0-beta.5`. Its last publish was 2026-02-23. It
unpacks to 813 KB of WASM. The whole `packages/web` bundle is 712 KB today, and
the studio chunk is 13.7 KB. Its licence is LGPL-2.1-or-later, which this
repository's AGPL-3.0 accepts. The licence was therefore not the objection.

A router buys obstacle avoidance, and nothing else. The roadmap's premise does
not survive a reading. It held that the library choice decides how much of
stages 31 and 33 comes free. Stage 31's anchors are trigonometry between two
centres. Stage 33's control points are drag state either way. Neither one
reaches the router.

No seam goes in for a router either. A boundary for a replacement nobody chose
is speculative. `routeEdge` is a function because the computation is pure and
testable.

### The route is three segments, or five when the target sits behind

The anchors stay fixed in this change. Three cases follow from the two anchors,
and the count reads off both axes rather than one.

A target ahead and on the same row takes ONE segment. That case is the common
one, not an exception. `autoPlaceSteps` writes `y: row * ROW_HEIGHT`, and
`rowByDepth` starts at 0 for every depth. A linear chain of steps therefore
sits on one row, and every edge in it is straight.

A target ahead and on another row takes three segments. The route leaves the
source anchor by the gutter, crosses to the target's row, then enters.

A target that is not ahead takes five. The route has to reach the target's left
edge from the left of it. It leaves by the gutter and moves to a row between
the two nodes. It passes the target's left edge by the gutter. It then moves to
the target's row and enters.

The gutter is `GRID_STEP`, not a constant of its own. A later stage that needs
a different gutter introduces the constant then.

The gutter puts a turn a whole grid step clear of the node it leaves. That
holds on the axis the anchor leaves on, and only there. An anchor sits at the
node's vertical middle, `node.y + NODE_HEIGHT / 2`, which is 30. A turn's y
therefore follows the anchor off the lattice, and the browser check confirmed
that it does. The route still reads square, because the clearance is what an
author sees.

`smoothstep` returns the same points. Only the rendering differs. Each corner
draws as a quarter-arc of one fixed radius. A one-segment route has no corner,
so it carries no arc under either style. The radius clamps to half the
shorter of the two segments a corner joins. A short segment therefore cannot
carry an arc that overshoots its own corner.

### The style is canvas-wide, and lives at `layout.canvasEdgeStyle`

One toolbar control sits beside "Fit to view". `EditScreen` holds the value in
`saveState.layout`, which the draft already round-trips.

An absent value reads as `step`. So does a value this version does not know. A
draft saved before this change carries no key at all. A draft saved by a later
version could carry a style this one has never seen. Both take the default
rather than throwing.

The roadmap's own brainstorm rejected a per-path style. It stays rejected.
Stage 33 below keeps that true.

### Stage 31: the anchor snaps to the side that faces the target

React Flow's floating-edge example computes a free-angle point on the node
border, from the angle between the two node centres. That suits a straight
edge. It fights an orthogonal one. A segment that leaves at 37 degrees has no
clean turn.

The anchor therefore snaps to the midpoint of the side that faces the target.
The larger of the two centre offsets picks the side, horizontal against
vertical. The edge still leaves the side facing the other node, which is the
property stage 31 exists for. Every segment stays axis-aligned.

`routeEdge` takes the two anchors and the axis each one leaves on. Stage 30
passes right and left, today's fixed pair. Stage 31 passes what the side choice
returns. The routing itself does not change.

Stage 31's second half is the affordances drawn on the edge. This design defers
that half rather than settling it. The inspector deletes a path already. A delete
control on the edge is a second way to do one thing. It returns to the queue
when an author asks for it.

### Stage 32: only the subprocess step lacks a marker

The stage reads as four asks and reduces to one gap. An initial step carries a
stamp already, and so does a terminal step. An automatic path draws solid
against a manual path's dashed stroke already. A subprocess step draws exactly
as a task step does.

It gains an inset second rule inside its rectangle. Radius 0, no new colour
role, and nothing that reads as a card.

### Stage 33: waypoints layer on the style, and never replace it

The roadmap flagged a tension. Stage 30 picks one style for the whole canvas,
to avoid per-path state. A dragged control point is per-path by nature.

The tension dissolves when a waypoint feeds the route rather than escaping it.
`routeEdge` runs once per consecutive pair. It runs from the source to the
first waypoint. It runs from waypoint to waypoint. It runs from the last
waypoint to the target.

The style governs every one of those segments. A bent edge is still a `step`
edge. Switching the canvas control re-routes it between the same waypoints.

No path carries a style, so stage 30's decision stands. What a path may carry
is a list of points, at `layout.waypoints[pathId]`.

Reset deletes that list. The edge then returns to the direct route. That is the
whole of reset, and it stores no memory of the earlier route.

## Risks / Trade-offs

- An edge crosses a node in its way. Nothing warns the author. → No router
  ships, and that is the cost. Stage 33's control points answer it, because an
  author bends the edge. The browser check names a crossing edge as expected,
  not as a defect.
- A five-segment route between two close nodes doubles back. It can read as a
  knot. → The gutter is a whole grid step. The doubling-back therefore clears
  both nodes by at least one lattice cell. The browser check drives a path that
  points backwards.
- `layout.canvasEdgeStyle` shares a namespace with node positions. → Step ids
  carry a `step_` prefix. `positionOf` admits only a point, and
  `autoPlaceSteps` reads by step id. A reserved key is invisible to all three.
- Routes reach past the nodes by a gutter, so `getBBox()` grows. "Fit to view"
  then frames a little wider. → That is correct, not a regression. The fit test
  passes its own box in by hand, so it does not see the change.
- A `<path>` replaces a `<line>`, so the hit area changes shape. → The hit area
  takes the same `d`, at today's stroke width. The pointer target then follows
  the route, not the old straight line. It also needs `fill: none`, which
  `.canvas-edge` declares and `.canvas-edge-hitarea` does not. A line cannot
  fill. A five-segment path encloses area, and SVG fills it black by default.

## Migration Plan

None. A draft that carries no `canvasEdgeStyle` renders as `step`. No stored
data changes shape, and the engine reads none of it.

One visible change reaches an existing draft. Its edges now turn corners. That
needs no author action, and it loses nothing. The anchors do not move, so every
edge still joins the two points it joined before.

## Open Questions

None that would change the specs, the approach or the tasks.
