## Why

ROADMAP stage 31 has two halves. The anchors shipped 2026-08-13 as
`canvas-floating-anchors`. The second half stayed open: the affordances an edge
draws. An objection stands against it, recorded in the stage. "The inspector
deletes a path already, and a control on the edge is a second way to do one
thing."

That objection holds, and `studio-canvas` already carries it. "The canvas
introduces no authoring operation unavailable through the panels" says deletion
"SHALL remain panel-only". Its scenario forbids a canvas-only deletion
affordance. This change builds no delete control on an edge. It weakens no part
of that requirement.

The objection covers delete. It does not cover insert. Neither a panel nor a
canvas gesture puts a step onto a path today.

Take an author who wants a review step between "Submit" and "Approve". They add
a step from the rail. They open the source step's inspector. They retarget its
path to the new step. They add a second path back to the old target. Four
operations over two surfaces, for one idea the author can point at.

The stage names a second framing: content along an edge rather than a stroke.
That much is already true here. The guard label is a `foreignObject` carrying
HTML. The priority badge is a `<text>` at the route midpoint. The open question
was never whether an edge can carry content. It was which affordance earns one.

## What Changes

- A step dropped from the rail onto a path lands inside that path. The source
  step's path retargets to the new step. The new step takes a path to the old
  target.
- The retargeted path keeps its guard and its priority. The condition deciding
  whether the flow enters the branch still decides it. The new path inherits
  the trigger alone. An automatic chain stays automatic, and a manual one stays
  manual.
- The insert clears the retargeted path's stored waypoints. The author placed
  them for a route that no longer exists. `Arrange` discards waypoints for that
  same reason.
- The path under the pointer draws as the drop target while a rail drag runs.
  That drag-over state is the whole affordance. The canvas gains no permanent
  control on an edge. Nothing new sits at the route midpoint beside the
  priority badge and the guard label.
- An `end` step draws no such state and never lands inside a path. A terminal
  step has no outgoing paths, so it cannot stand between two steps. It drops as
  a free-standing step, which is what it does today.
- No delete affordance on an edge. Not built, on purpose, for the reason above.

## Capabilities

### New Capabilities

None. The change adds requirements to a capability that exists.

### Modified Capabilities

- `studio-canvas`: two added requirements, one for the insert gesture and one
  for the drop-target rendering. One modified requirement, the one holding that
  the canvas introduces no authoring operation the panels lack. It gains a
  scenario naming the panel operations the insert composes. A later reader then
  sees that the rule still holds. Without it, the new gesture reads as a breach.

## Impact

- `packages/web/src/areas/studio/screens/EditScreen.tsx`: `onPaletteDrop`
  resolves a path under the drop point before it places a free step. The screen
  also holds the hovered path id for the length of a rail drag.
- `packages/web/src/areas/studio/canvas/EditRail.tsx`: the drag reports its
  moving position, not its release alone.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the edge group carries
  its path id and its source step id as data attributes. It takes the
  drop-target class from a new prop.
- `packages/web/src/areas/studio/draft/`: one new module. It holds the insert as
  a pure transform over a step list, with a `bun:test` suite.
- `packages/web/src/app.css`: one class, for the drop-target stroke.
- No engine change, and no definition contract change. The insert produces the
  JSON any author could have typed by hand. It runs through `newStep` and
  `newPath`, the two functions every other add-a-step and add-a-path entry
  point already shares.
- No new i18n key. The drop-target state is a stroke, not a label.
- `ROADMAP.md` and `docs/roadmap-history.md`: stage 31 closes and moves to the
  table.
