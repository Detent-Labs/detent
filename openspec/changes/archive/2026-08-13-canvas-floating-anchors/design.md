## Context

See `proposal.md` for motivation. The design of record for roadmap stages 30
to 33 is the `design.md` of
`openspec/changes/archive/2026-08-13-canvas-edge-routing-styles`. Its "Stage
31" section settles this one. The anchor snaps to the midpoint of the side
facing the target. The larger centre offset picks that side. `routeEdge` gains
the axis each anchor leaves on.

What the code does today:

- `CanvasView.tsx:537` computes `sourceAnchor` as `{ x: source.x + NODE_WIDTH,
  y: source.y + NODE_HEIGHT / 2 }`, the right-middle, for every path.
- `CanvasView.tsx:547` computes `targetAnchor` as `{ x: target.x, y: target.y +
  NODE_HEIGHT / 2 }`, the left-middle.
- `routeEdge` (`geometry.ts:105`) reads those two points and assumes the pair.
  `ahead` is `target.x > source.x`. The gutter runs `source.x + GRID_STEP` out
  and `target.x - GRID_STEP` back. The one-segment case tests `source.y ===
  target.y`.
- `routePath`, `midpointOfRoute` and `segmentLength` take the route's points
  and know nothing about direction. They need no change.

## Goals / Non-Goals

**Goals:**

- An edge leaves the side of the node that faces the other node.
- Every segment stays on one axis, and the route reads square.
- `routeEdge`'s own arithmetic stays one implementation, not four.

**Non-Goals:**

- A free-angle border point. React Flow's floating-edge example computes one
  from the centre-to-centre angle. It suits a straight edge and fights an
  orthogonal one, and the design of record rejects it.
- The affordances drawn on the edge, which is stage 31's second half. The
  inspector deletes a path already.
- Moving the connect handle. It is a control, and a control that moves under
  the pointer is harder to press.
- Obstacle avoidance. Stage 30 decided that, and stage 33's control points are
  the answer.

## Decisions

### The design pass added one constraint: no anchor dot

The direction here is geometry, and `.claude/rules/design-language.md` already
governs it. An edge is a ruled tie-line between two rows of a register. It
meets a node's side at a right angle, at that side's midpoint. One rule
therefore meets another rule squarely.

The constraint the pass added is restraint. The anchor draws nothing of its
own. React Flow paints a handle at each anchor. This canvas already has one
circle per node, the connect handle. A second circle that moved with the
target would read as a second control.

### The side rule is one comparison, and both anchors read it

`|dx| >= |dy|` between the two node centres picks the horizontal pair.
Otherwise the vertical pair. The tie goes horizontal. On an equal-offset
diagonal with the target to the right, that keeps today's rendering. To the
left it does not: the source leaves its left side.

A zero offset on the chosen axis puts the source anchor on the right side.
A zero `dx` under `|dx| >= |dy|` forces `dy` to zero too. The only state that
reaches this rule is two steps stacked on one position. A drag can leave them
there, and a rule that returned nothing would draw no edge at all.

Both anchors read the one comparison, so they always sit on opposing sides.
That is what keeps every segment on one axis. A route leaving a bottom side
and entering a left side needs a turn the segment count does not describe.

The alternative was a per-anchor side choice, which gives eight leaving-and-
entering combinations rather than four. It buys a shorter route on a diagonal
and costs a routing rule per combination.

### The vertical case transposes rather than duplicates

`routeEdge`'s arithmetic already covers "leave along an axis, cross, enter".
A second copy for the vertical pair duplicates the gutter rule and the
not-ahead rule.

The route therefore runs in a canonical space. A transform maps the two
anchors into "leaves rightward, enters leftward". The body of `routeEdge` runs
against that space, unchanged. The same transform maps every returned point
back.

The transform lives INSIDE `routeEdge`, which gains the leaving direction as a
parameter. It does not live in the caller. `CanvasView.tsx` is the only
caller. Routing arithmetic in a component contradicts `studio-canvas`'s own
requirement that this logic sits in tested pure modules.

The parameter defaults to rightward, which is today's fixed pair.
`studio-canvas-geometry.test.ts` calls `routeEdge` with two arguments in eight
places. That default keeps every one of them green.

Four transforms cover the four cases:

| Case | Transform |
|---|---|
| leaves right | identity |
| leaves left | negate x |
| leaves down | swap x and y |
| leaves up | swap x and y, then negate both |

Each one composes with itself to the identity. That is why the mapping back
needs no second table, and it is worth checking rather than assuming. Swap
followed by a negated x reaches the canonical space too, and it composes to a
180-degree rotation. Every upward edge would return drawn on the far side of
the canvas.

The alternative was a `routeEdge` branching inside on every coordinate. It
reads as the same arithmetic written twice with the letters swapped, which is
what a transform states once.

### The anchor rule is a pure function beside the others

`anchorsForEdge` takes two node positions and returns both anchors and the
axis. It sits in `geometry.ts` with `routeEdge`, and it earns a test. The side
choice is a rule with a tie case, four outcomes and a boundary.

That makes nine computations, and `studio-canvas` states the count and names
each one. The delta modifies that requirement rather than adding a second one
beside it.

### The connect handle and the drag preview stay where they are

The handle sits at the right-middle and keeps its position. An author presses
it, and a control that moves when a neighbouring node moves is harder to
press. A drag in flight has no target, so it has no side to face either.

That leaves one visible seam: a path leaving a node's bottom side starts away
from that node's handle. The author sees the handle as the place a path
starts, and sees a path that starts elsewhere. The browser check reads that
seam, since a test cannot.

## Risks / Trade-offs

- **A route flips its side when a drag crosses the diagonal.** → It does, and
  that is the feature. The flip lands at `|dx| == |dy|`, which is where the
  facing side genuinely changes. Any rule with a facing side has a boundary.
- **Two steps on one row with a backward path.** → `routeEdge`'s `midY` case
  dips three grid steps below for a same-row pair. Under the transform, that
  dip runs along the transposed axis, so a vertical pair dips sideways. The
  route still clears both nodes.
- **More guard labels land on a vertical run.** → Five-segment routes already
  do. The segment index `midpointOfRoute` returns exists for this reason, and
  the label bounds its width to that segment.
- **Stage 34 draws an edge to a collapsed group.** → The anchor rule takes two
  rectangles and reads their centres. A group's own box substitutes for a
  node's, and the rule needs no change.
- **Stage 33 attaches waypoints to moving ends.** → A waypoint feeds the route
  rather than replacing it, and `routeEdge` runs per consecutive pair. The
  first pair's source anchor moves. A dragged node already causes that same
  recomputation.

## Migration Plan

None. Anchors are a render-time computation, and no draft stores one. A draft
saved before this change draws the new anchors the moment it loads.

Rollback is the revert of one commit.

## Open Questions

None.
