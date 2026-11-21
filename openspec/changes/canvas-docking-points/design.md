# Design

## Context

See `proposal.md` for the motivation. This section states what the code does
today.

The module `canvas/geometry.ts` picks an anchor per path. Its function
`anchorsForEdge` turns the source toward the target's centre. The target gets
the opposing side. With waypoints, each end turns toward its nearest waypoint
instead. Each anchor is the midpoint of a side.

The function `routeEdge` draws one, three or five segments between two
opposing sides. It knows no other pair.

The canvas view draws one connect handle per node, a circle of radius 7 at
the right middle. A connect drag starts there, whichever side the new path
then takes. All routes compute inside one memo. A pointer move therefore
redraws no route.

The draft's layout is an opaque JSON object, and the server stores it whole.
It holds one point per step id and three reserved keys. Those are
`canvasEdgeStyle`, `waypoints` and `groups`. The screen that owns the draft reads each one
defensively. A malformed value falls back, and the render goes on.

Every node measures 180 by 60. A collapsed group's box takes the same size.

## Shape brief

The owner settled the behavior in conversation, with a mockup of the four
states. This is the `/impeccable shape` result for the canvas.

- **Job and audience.** A process author arranges a drawing on the Map tab.
  The mode is Operate. The author wants a path to stay where the author put it.
- **Outcome.** An author picks where a path leaves and where it arrives. The
  drawing survives every later step move.
- **Direction.** The points are part of the canvas's own SVG geometry, so they
  may curve. They draw in slate, since a point marks no state. The accent
  marks one thing alone: the point a drag will land on.
- **States.** A resting canvas draws no point. A pointed-at or selected step
  draws twenty. A held point draws filled, and a free point draws as an
  outline. During a drag, the step under the pointer draws its points and
  rings the nearest one in the accent.
- **Feedback.** Nothing fades in or out. The design language allows no
  transition, and a point appears in the frame the pointer arrives.
- **Touch.** A touch screen has no hover. A tap selects the step, and a
  selected step draws its points.
- **Anti-goals.** No point carries a label, an arrow or a direction. No side
  inspector lists the points. A resting canvas stays as quiet as it is today.

Drawn values, which `DESIGN.md` takes in this change:

| Part | Form |
|---|---|
| Free docking point | circle, radius 3.5, paper fill, 1.25px slate stroke |
| Held docking point | circle, radius 3.5, slate fill |
| Snap target | circle, radius 5, accent fill, inside a 2px accent ring of radius 10 |
| End handle | circle, radius 5, accent fill, 1px accent stroke |
| Press target | transparent circle, radius 12, on every drawn point |

## Goals / Non-Goals

**Goals:**

- A path with no stored point draws exactly as it draws today.
- One stored shape covers both ends, and each end stands alone.
- No write happens on load, so an older draft opens clean.
- The router keeps today's output for opposing sides, byte for byte.

**Non-Goals:**

- Resizing a step. The counts of three and seven hold for the one node
  size. A later resize change states how the counts grow.
- Moving an end to another step. That retargets a path, which is a definition
  change with its own home on the step page.
- A keyboard or panel route to a docking point. Waypoints have none either.
  Both are drawing aids on the layout, and neither is an authoring operation.
- Routing around a third step. A route clears its own two boxes alone, as
  today.

## Decisions

### Approaches considered for a path nobody attached by hand

The owner chose the first.

1. **Store on the first step move.** A path keeps the automatic rule until a
   drag moves one of its steps. That drag stores the points the path held
   before it. No visible path ever changes its side, and an older draft needs
   no upkeep.
2. **Fix hand-attached paths alone.** This is the smallest build. The canvas
   then holds two kinds of path that look alike and behave differently.
3. **Store everything on load.** Every older draft would read Unsaved changes
   the moment it opens. The canvas already refuses that for auto-placed steps.

### A docking point is a side and a position

A stored end reads `{ "side": "right", "at": 0 }`. The side is one of `top`,
`right`, `bottom` and `left`. The position `at` is a whole number counted from
the side's middle point, in grid steps. It grows to the right on a level side
and downward on an upright one. An upright side holds −1 to 1, and a level
side holds −3 to 3.

Counting from the middle keeps a stored point valid if a node ever grows. An
offset in canvas units would not, and neither would an index from a corner.

An entry reads:

```json
{ "dockingPoints": { "path_…": { "source": { "side": "bottom", "at": 0 },
                                 "target": { "side": "left", "at": -1 } } } }
```

Either end may be absent. A drag to empty canvas stores a source alone, and
the insert gesture clears a target alone.

### The automatic rule stays, per end

An end with no stored point takes today's rule. When neither end stores a
point, the canvas calls the functions it calls today, unchanged. When one end
stores a point, the other end turns toward the far box's centre, or toward its
nearest waypoint. With two boxes of one size, that gives the side today's rule
gives.

The alternative was to store a point for every path at creation. The way-out
menu and the step page add a path with no pointer position. A point stored
there would be the automatic one, frozen before the author placed the steps.

### A drag computes the pin at its start and writes it at release

A node drag reads its paths when it starts. For each end with no stored point
it records the current anchor's side and position. The drag preview routes
with those recorded points, so no path changes its side under the pointer.

The release writes positions and points in one layout write. Today
`onNodePointerUp` calls `onMoveStep` once per moved step. That loop becomes
one callback that takes every new position and every new point. A group drag
uses the same callback. A release under the click threshold writes nothing.

A path between two members of one collapsed group draws no route. The pin
still stores its points, from the members' own positions.

### The router searches a small set of candidates

`routeEdge` keeps the opposing pair, so every route of today stays the same.
A new pure function takes the other pairs. It receives both anchors, both
sides and both boxes.

Each anchor first gets a stub: one grid step outward along its side. The
function then builds candidate middles between the two stub ends. A candidate
uses zero to three segments. Its coordinates come from a fixed set. The set
holds the two stub ends and the channel halfway between the boxes. It also
holds a line one grid step outside both boxes, on each of the four sides.

The function drops a candidate that doubles back or crosses the inside of
either box. It takes the one with the fewest segments. A tie goes to the
shorter route, and a second tie to the earlier candidate. That order never
varies, so a route stays the same between renders.

Two alternatives lost. A hand-written table of sixteen side pairs, each with
its own placements, repeats the three-case logic of `routeEdge` many times
over. A routing library is a dependency for a problem this small, and it
would route today's paths differently.

Two boxes can stand closer than two grid steps. The stubs then collide, and
every candidate may cross a box. The function returns the candidate with the
fewest crossings. A route always draws.

### A waypointed leg leaves a stored point outward

With waypoints, a stored end joins the chain in place of the turned anchor.
The first leg leads along the stored side's axis, as it leads along the
turned side's axis today. Where the waypoint lies behind the side, the leg
gets the stub first. That is the one leg with a gutter.

### Press targets overlap, and the nearer point wins

Neighbouring points stand 20 units apart. A press target of radius 12 on each
therefore overlaps the next. The canvas resolves a press to the nearest point
by distance, instead of trusting the topmost circle.

The alternative was a smaller target with no overlap. It would measure 20px,
under the 24px floor that `spa-accessibility` sets. The spacing route that
floor allows needs 24px between centres.

A press on a target that moves less than the click threshold selects the
step. The points then stay drawn, which is also the touch route.

### Draw order

Docking points draw above the stamps and above every way-out sentence, as the
connect handle does today. The initial stamp and the end stamp sit across the
top edge, near its corners. A point under one stays pressable. An end
handle draws above the docking points, so a selected path's end takes the
press where the two coincide.

### Hover is its own state

The pointed-at step lives in its own piece of state, outside the route memo.
A pointer crossing ten steps redraws ten sets of dots and no route. The canvas
capability requires that layout computation does not re-run on pointer
movement.

### Arrange and the insert follow waypoints

Arrange clears `dockingPoints` in the write that already clears `waypoints`.
`hasHandPlacedLayout` in `arrange.ts` also reads the new key, so the
confirmation appears. The insert keeps the source end and drops the target
end, in the write that already clears that path's waypoints.

### A collapsed group's box has no points

A path onto a collapsed box takes the automatic rule on that box. The stored
entry stays in the layout untouched, and the expanded member reads it again.

## Risks / Trade-offs

- [A click near a node's border selects the step] → Press targets cover a
  path's last 12 units. The rest of the route still selects the path, and its
  sentence does too.
- [A resting canvas shows no handle] → The points appear on the first pointer
  pass. The way-out menu and the canvas bar still add a way out with no drag.
  The browser check judges whether that is enough.
- [A stored point draws a long route after a far move] → The author hangs the
  end elsewhere. Arrange also resets it. The owner asked for a point that
  never moves by itself.
- [A press picks a neighbouring point by mistake] → The accent rings the
  nearest point before release. An end handle corrects a wrong pick.
- [The search returns an odd route somewhere untested] → One test walks
  sixteen side pairs. It covers eight placements for each, and asserts every
  invariant the spec states.
- [The branch `spike/ui-sdk-canvas` rewrites the connect code] → This change
  lands first. A later change that adopts the spike carries the docking points
  over.

## Migration Plan

Nothing migrates. A draft with no `dockingPoints` key draws as it draws
today. The first step move adds entries for the paths on that step. The
published body never holds the key, so no instance and no version changes.

Rolling back means reverting the commits. An older build ignores the key and
draws every path by the automatic rule.

## Open Questions

None.
