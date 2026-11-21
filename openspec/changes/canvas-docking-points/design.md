# Design

## Context

See `proposal.md` for the motivation. This section states what the code does
today.

The module `canvas/geometry.ts` picks an anchor per path. Its function
`anchorsForEdge` turns the source toward the target's centre. The target gets
the opposing side. With waypoints, each end turns toward its nearest waypoint
instead. Each anchor is the midpoint of a side.

The function `routeEdge` draws one, three or five segments between two
opposing sides. It knows no other pair. Its five-segment branch runs only
where two boxes overlap on the leaving axis.

The canvas view draws one connect handle per node, a circle of radius 7 at
the right middle. A connect drag starts there, whichever side the new path
then takes. All routes compute inside one memo over committed positions. A
pointer move therefore redraws no route, and a node drag redraws none until
its release.

The draft's layout is an opaque JSON object, and the server stores it whole.
It holds one point per step id and three reserved keys. Those are
`canvasEdgeStyle`, `waypoints` and `groups`. The screen that owns the draft
reads each one defensively. A malformed value falls back, and the render goes
on. Those readers and writers are inline closures in `EditScreen.tsx`, and no
test covers them.

Every node measures 180 by 60. A collapsed group's box takes the same size.

The package `packages/web` has no DOM harness. A `bun:test` there sees static
markup and pure functions. A press, a drag and a hover need a real browser.

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
| End step's point | circle, radius 3.5, no fill, 1.25px dashed slate stroke |
| Snap target | circle, radius 5, accent fill, inside a 2px accent ring of radius 10 |
| End handle | circle, radius 5, accent fill, 1px accent stroke |
| Point press target | transparent, 12 units outward from the border and 6 inward |
| End handle press target | transparent circle, radius 12, above every point target |

A dashed stroke already means "not there yet" in the design language. It
gives an end step's points the distinct form the capability requires.

## Goals / Non-Goals

**Goals:**

- A path with no stored point draws byte for byte as it draws today.
- One stored shape covers both ends, and each end stands alone.
- No write happens on load, so an older draft opens clean.
- Most of a node still moves the step.

**Non-Goals:**

- Resizing a step. The counts of three and seven hold for the one node
  size. A later resize change states how the counts grow.
- Moving an end to another step. That retargets a path, which is a definition
  change with its own home on the step page.
- A keyboard or panel route to a docking point. Waypoints have none either.
  Both are drawing aids on the layout, and the delta spec says so.
- Routing around a third step. A route clears its own two boxes alone, as
  today.
- A live route during a node drag. Routes follow committed positions, as
  today.

## Decisions

### Approaches considered for a path nobody attached by hand

The owner chose the first.

1. **Store on the first step move.** A path keeps the automatic rule until a
   drag moves one of its steps. That drag stores the points the path held
   before it. An older draft stays as it is.
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

### Layout reads and writes move into pure functions

The new key gets four pure functions in `canvas/layout.ts`, beside `isPoint`.
One reads `dockingPoints` defensively. One writes one path's ends and drops
an empty entry. One returns the layout after an arrange, and one the layout
after an insert. The last two also carry the waypoint clearing those writes do
today. The screen that owns the draft calls them in place of its inline closures.

A fifth returns the layout after a step move. It takes the new positions and
the points to store. Each of the five gets cases in the canvas layout test.

### The automatic rule stays, per end

An end with no stored point takes today's rule. When neither end stores a
point, the canvas calls the functions it calls today, unchanged. When one end
stores a point, the other end turns toward the far box's centre, or toward its
nearest waypoint. With two boxes of one size, that gives the side today's rule
gives.

The alternative was to store a point for every path at creation. The way-out
menu and the step page add a path with no pointer position. A point stored
there would be the automatic one, frozen before the author placed the steps.

### A release computes the pin and writes it with the positions

A node drag redraws no route until release, as today. The release reads the
committed positions, which still hold the geometry before the move. A pure
function computes the points to store from them.

The release then writes positions and points in one layout write. Today the
node release and the group release each call `onMoveStep` once per moved
step. Both loops become one callback that takes every new position and every
new point. A release under the click threshold writes nothing.

An end on a collapsed group's box stores nothing. The other end of that path
stores the point it held, read against the box. A path between two members of
one collapsed group stores nothing, since it draws no point.

### The router searches a small set of candidates

A path with no stored point calls today's functions, unchanged. A path with a
stored point takes `routeEdge` only where its anchors sit on opposing sides
and face each other. That means the target anchor lies two grid steps or more
beyond the source anchor, along the leaving axis. Every other pair takes the
new function. An opposing pair that faces away takes it too. So does a path
whose two ends sit on one box.

The new function is pure. It receives both anchors, both sides and both
boxes. Each anchor first gets a stub: one grid step outward along its side.
The function then builds candidate middles between the two stub ends. A
candidate uses zero to three segments.

Its coordinates come from a fixed set. The set holds the two stub ends and a
channel between the boxes. The channel is the lattice line nearest to halfway
between them. The set also holds a line one grid step outside both boxes, on
each of the four sides. An anchor at an odd ten stays off the lattice by
construction, and every other corner sits on it.

The function drops a candidate that doubles back. It drops one that crosses
the inside of either box, or runs along a border of either. It takes the one
with the fewest segments. A tie goes to the shorter route, and a second tie to
the earlier candidate. That order never varies, so a route stays the same
between renders.

Two alternatives lost. A hand-written table of sixteen side pairs, each with
its own placements, repeats the three-case logic of `routeEdge` many times
over. A routing library is a dependency for a problem this small, and it
would route today's paths differently.

Two boxes can stand closer than two grid steps. The stubs then collide, and
every candidate may cross a box. The function returns the candidate with the
fewest crossings. It never returns one that revisits a point. A level opposing
pair that faces each other at any distance also offers the straight segment.
Every route between two boxes that do not overlap leaves outward. Two
overlapping boxes still get a route, and the outward rule yields there.

### A waypointed leg leaves a stored point outward

With waypoints, a stored end joins the chain in place of the turned anchor.
The first leg leads along the stored side's axis, as it leads along the
turned side's axis today.

Where the waypoint lies behind the side, the leg gets the stub first. It then
leads along the other axis. The waypoint's coordinate on that axis can lie
inside the node's span plus one grid step. The leg then first runs to one grid
step past the node's nearer corner, and takes its L from there. That leg holds
up to four segments, and it is the one leg with a gutter. The last leg into a
stored target point follows the same rule.

### Press targets reach outward more than inward

Neighbouring points stand 20 units apart. A point's press target reaches 12
units outward from the border and 6 units inward. Along the side, neighbouring
targets meet halfway, so the canvas resolves a press to the nearest point by
distance.

A full circle of radius 12 would cover a 12-unit band inside the whole border.
That leaves about half of a node for moving the step. The pointer always
rests on a node before it presses, so that band would always be live. A reach
of 6 units leaves 168 by 48 of the 180 by 60, about three quarters.

The cost is a target of 18 by 20 units, under the 24px floor on both axes.
The delta spec rewrites the connect handle's size rule to say so. An end
handle corrects a wrong pick.

A press on a target that travels less than the click threshold behaves as a
press on the node. It selects, Shift toggles, and a double-click opens the
step. The points then stay drawn, which is also the touch route.

### A release on a press target counts as a release over the step

A connect drop and the snap ring both test the node's box grown by 12 units.
The box itself wins where two grown boxes overlap. Without this, a release on
the outer half of the ringed point would count as empty canvas. A new step
would then land on top of the target. The drop gesture module takes the rule.

A drop on the source step takes the nearest point other than the pressed one.
The canvas keeps self paths, and two identical anchors have no route.

### Draw order

Docking points draw above the stamps and above every way-out sentence, as the
connect handle does today. The initial stamp and the end stamp sit across the
top edge, near its corners. A point under one stays pressable.

An end handle draws above the docking points, and its press target takes the
press inside its circle. The point under a selected path's end therefore
starts no connect drag until the author deselects the path. Docking points and
end handles draw before the group disclosure hosts, which stay last.

Every point's group and every end handle carries `panzoom-exclude`. A press
target reaches outside its node, and without the class that press pans.

### The old handle's obstacle goes, and the label keeps its inset

The sentence placement models the old handle as an obstacle a sentence
avoids. No handle stands there on a resting canvas. The function
`handleObstacle` and its call therefore go. The step label keeps its right inset. The three points on the right side
still stand there, and a label change is no part of this work.

### Hover is its own state

The pointed-at step lives in its own piece of state, outside the route memo.
A pointer crossing ten steps redraws ten sets of dots and no route. The canvas
capability requires that layout computation does not re-run on pointer
movement.

### Arrange and the insert follow waypoints

Arrange clears `dockingPoints` in the write that already clears `waypoints`.
The function `hasHandPlacedStep` in `arrange.ts` also reads the new key, so
the confirmation appears. It keeps its name, since `EditScreen.tsx` and
`studio-confirmation-wiring.test.ts` both read it. The dialog gets a second
note under its own catalog key, `arrangeDialog.points`.

The insert keeps the source end and drops the target end, in the write that
already clears that path's waypoints.

### A collapsed group's box has no points

A path onto a collapsed box takes the automatic rule on that box. The stored
entry stays in the layout untouched, and the expanded member reads it again.

### Gestures get an e2e flow, and decisions get pure tests

Every decision a gesture makes lives in a pure function with `bun:test`
cases. Those are the nearest point, the drop target, the points a move stores
and each layout write. Static markup covers what a selected step and a selected path
draw. One new flow, `e2e/canvas-docking-points.e2e.ts`, proves the gestures
themselves. A hover-only state goes to `docs/browser-checks.md`.

The alternative was a DOM harness in `packages/web`. That is a dependency and
a tooling switch, which needs a change of its own.

## Risks / Trade-offs

- [A press near the border starts a connect drag] → The target reaches 6 units
  inward. The browser check judges that reach, and one constant moves it.
- [Each point answers 18 by 20 units, under the 24px floor] → An end handle
  corrects a wrong pick. The accent rings the nearest point before release.
- [A click near a node's border selects the step] → Press targets cover a
  path's last 12 units. The rest of the route still selects the path, and its
  sentence does too.
- [A resting canvas shows no handle] → The points appear on the first pointer
  pass. The way-out menu and the canvas bar still add a way out with no drag.
  The browser check judges whether that is enough.
- [A stored point draws a long route after a far move] → The author hangs the
  end elsewhere. Arrange also resets it. The owner asked for a point that
  never moves by itself.
- [An auto-placed step moves when the graph changes] → A stored point stays,
  and the route redraws. The browser check covers a connect drag on a draft
  with an empty layout.
- [A path retargeted on the step page keeps its target point] → Accepted, as
  for waypoints. The panels write no layout. An end handle or Arrange corrects
  it.
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
