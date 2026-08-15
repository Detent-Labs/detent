## Context

See `proposal.md` for the motivation, and `specs/studio-canvas/spec.md` for the
rules. This section holds the code the design has to fit.

<!-- Why: "edit rail" is the glossary's one word for the creation palette. -->
<!-- antislop: allow synonym-rotation -->

The edit rail drags a step kind. It reports the release alone. `EditRail`
captures the pointer, tracks its own ghost, and calls `onDrop(kind, clientX,
clientY)`.

`EditScreen.onPaletteDrop` then runs four steps. It calls
`document.elementFromPoint` and resolves `.canvas-wrap`. It converts the point
through the SVG transform. It snaps that point to the grid. It creates the step
and selects it.

Each path renders as a `<g class="canvas-edge-group">` holding two `<path>`
elements. The visible stroke draws the route. `.canvas-edge-hitarea` draws the
same `d` with a wide transparent stroke. The group has a React `key`, and names
its path nowhere in the DOM.

Three things already sit at the route midpoint. The priority badge draws at
`midY - 6`. The guard label draws at `midY + 4`. A selected path puts its
new-waypoint handle at the midpoint itself.

Two existing `studio-canvas` requirements bind this design. One forbids a
canvas-only authoring operation. The other forbids layout computation on
pointer movement.

## Goals / Non-Goals

**Goals:**

- One gesture that inserts a step into a path, over the drag the rail already
  has.
- A rendered signal on the path that names the drop before the author releases.
- A pure, tested transform for the draft mutation.

**Non-Goals:**

- A delete control on an edge. See `proposal.md`.
- Any control that stays on the canvas after the drag ends.
- Any change to `routeEdge`, `anchorsForEdge` or `routeThroughWaypoints`. The
  geometry of an edge does not move here.
- A keyboard equivalent on the canvas. No canvas gesture has one, and the
  panels carry that role.

## Decisions

### The gesture is a drop, not a control on the edge

A permanent control per edge fills a busy graph with buttons. A control on the
selected path alone lands at the route midpoint. Three things already sit
there.

The rail's drag already ends in `onPaletteDrop`. That function gains one
branch. The author learns no new gesture, and the canvas grows no new pixel
that stays.

### The hit test runs through the DOM, not through geometry

`onPaletteDrop` calls `document.elementFromPoint` already. The edge group gains
`data-path-id` and `data-step-id`. Then `target.closest("[data-path-id]")`
answers which path the pointer holds. `.canvas-edge-hitarea` supplies the
tolerance, since the browser tests its wide transparent stroke.

The alternative is a pure `hitTestRoute` over the routes. It has to recompute
every route. The render computes them inside its own map and keeps none.

Running that per pointer move takes the shape the "layout computation does not
re-run on pointer movement" requirement rejects. The DOM hit test is native and
reads no route at all.

### The mutation is the pure part, and it lives in `draft/`

The decision layer here is two predicates. Is a path under the pointer, and is
the dragged kind `end`. Neither earns a module.

The transform does. `draft/insertOnPath.ts` takes the step list, the source
step id, the path id and the new step. It returns the new list. `bun:test`
covers the retarget, the trigger inheritance, the guard staying put, and the
new path's shape.

That file sits in `draft/` beside `createStep.ts` and `createPath.ts`. It calls
`newPath` rather than building a path itself.

The eleven pure computations `studio-canvas` enumerates are canvas geometry.
This one is a draft transform, so it does not join that list.

### The new path inherits the trigger, and nothing else

Always-manual stalls an automatic chain. The author inserts a step into a
branch that ran by itself, and gets a step waiting for a person.

Always-automatic skips the new step. An automatic path evaluates on entry. A
person-driven flow would pass straight through the form the author just added.

Inheriting keeps the character of the flow. Guard and priority stay behind, on
the path that still owns them.

### The guard stays on the retargeted path

The guard decides whether the flow takes this branch, and the branch starts at
the source step. Moving the guard to the new path inverts that.

The instance would enter the new step, evaluate a false guard, and park there
with no exit.

### The insert clears that path's waypoints

Splitting them needs a projection of the drop point onto a leg boundary. The
drop point is not one. `routeThroughWaypoints` works in leg order, and nothing
asked for that arithmetic.

`Arrange` discards every stored waypoint already, for the same reason. The
route they shaped no longer exists.

### The rail reports its moving position

`EditRail` gains `onDragMove(kind, clientX, clientY)` beside `onDrop`. Its
`onPointerMove` already fires, since the pressed button holds the pointer
capture.

`EditScreen` resolves that point the way the drop does. It holds the answer as
`insertTargetPathId` and passes it to `CanvasView`.

The alternative is a `document` listener inside `CanvasView`. The rail owns the
drag and the capture, so the rail is the honest source.

An `end` drag resolves to no target, so the state never draws for one.

### The drop-target state is a stroke, so it needs no catalog key

`CanvasView` adds `.canvas-edge-insert-target` to the group whose path id
matches. `app.css` gives that class a heavier stroke in the accent.

The design language reads the accent as a stamp that marks state, and this
marks one. The weight changes with the color, so the signal survives without
color.

A label at the midpoint would need a catalog key and a German string 40%
longer. It would also need room where the badge and the guard label already
sit.

## Risks / Trade-offs

- The gesture stays invisible until an author tries it → the drop-target state
  is the affordance. It draws as soon as the drag crosses a path, and the panel
  route stays for anyone who never drags.
- A keyboard author cannot insert on the canvas → the panels compose the same
  end state. The modified requirement names the three operations.
- An edge under a node loses the drop → the topmost element decides. That is
  the element the author sees. A release there places a free-standing step, as
  it does today.
- `elementFromPoint` runs on every pointer move → it is a native hit test. No
  route recomputes, so the pointer-movement requirement holds.
- The source step may sit in a collapsed group → the route ends on the group
  box. The retarget still names the real path. The new step joins no group and
  stays visible.
- Clearing waypoints discards hand placement → the insert is one gesture on one
  path. The `Arrange` control sets that precedent. A confirm dialog on a drag
  release costs more than it saves.

## Migration Plan

No data migration. The draft shape does not change. The insert writes the same
`steps` and `paths` an author writes by hand. Stored waypoints clear for one
path, and only where an author inserts.

Rollback is a revert of the commit. A draft saved after an insert stays valid
under the reverted code, since it holds nothing new.
