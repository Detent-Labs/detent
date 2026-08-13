## Context

See `proposal.md` for motivation. What follows is the state the code is in.

The canvas is hand-drawn SVG, not React Flow. No `snapToGrid` prop exists to
set. `onNodePointerUp` in `canvas/CanvasView.tsx` adds the drag delta to the
start position. It hands the result to `onMoveStep`, and `EditScreen.tsx`
writes that into `saveState.layout`.

`nodeDrag` state holds `{ stepId, startPointer, startPos, current }`. The node
render computes its drawn position from that same sum. The preview and the
release therefore share one expression today.

`onPaletteDrop` in `EditScreen.tsx` maps a client point through
`svgPointFromClient` and calls the same `onMoveStep`.

`panzoomRef` holds a live `PanzoomObject`. Nothing subscribes to its changes
yet. Panzoom emits a `panzoomchange` event on its element, carrying the scale
and the pan.

`.canvas-wrap` paints the grid as a `radial-gradient` at `background-size: 20px
20px`. Its comment states why the grid sits there and not on the SVG. Panzoom
transforms the SVG, so a grid drawn there shrinks with the zoom. It also leaves
the rest of the canvas bare.

`COLUMN_WIDTH` is 240 and `ROW_HEIGHT` is 110 in `canvas/layout.ts`.
`NODE_WIDTH` is 180 and `NODE_HEIGHT` is 64 in `canvas/geometry.ts`.

## Goals / Non-Goals

**Goals:**

- A node lands on the lattice the author can see, at any zoom.
- One expression rounds, and all three write sites call it.
- No jump between the preview and the release.
- Every layout constant on the lattice, so no auto-placed step shifts.

**Non-Goals:**

- No schema change. Position stays in the opaque `layout` blob.
- No snap for an edge, a waypoint or a control point. Stages 30 to 33 own
  those, and none exists yet. `GRID_STEP` lands in `geometry.ts` for them.
  Stage 33's waypoints call that helper rather than round their own way.
- No author-facing toggle. One step size, always on.
- No move for the grid itself. It stays on `.canvas-wrap`.

## Decisions

### One `snapToGrid` in `geometry.ts`, called from three sites

`geometry.ts` already owns `dragDelta`, `hitTestNode` and the node box. It
measures rectangles and knows nothing about steps, which is exactly the right
altitude for a rounding function.

The alternative rounds inside `onMoveStep` in `EditScreen.tsx`, which is the
single write path and looks tempting for that reason. It fails the preview.
The preview never calls `onMoveStep`, so the node would sit unrounded under the
pointer and jump on release. That jump is the defect the requirement names.

Rounding at the three read sites keeps the preview and the release computing
one number. That makes the jump impossible, rather than merely unlikely.

### The grid tracks the transform through two CSS custom properties

A `panzoomchange` listener writes `--canvas-grid-size` and
`--canvas-grid-offset` onto the wrap. The stylesheet reads both.

Two alternatives lose. Drawing the grid on the SVG lets the transform carry it
for free, and the existing comment already rejects that. The grid then shrinks
with the zoom, and stops short of the wrap's edges. Rebuilding a gradient in
JavaScript per frame does the same work with more string building.

Custom properties keep the gradient itself in the stylesheet, where the design
language's color roles already live. They hand JavaScript two numbers. The
listener sets one style property per change event. Panzoom's own transform
write already does that on the same element tree.

`background-position` takes the pan directly. The wrap is the pan's own
reference frame, so nothing converts between them. The SVG's transform origin
and the wrap's top-left agree.

### `ROW_HEIGHT` 110 to 120, `NODE_HEIGHT` 64 to 60

Four constants, two of them off a 20-unit lattice. Three options existed, and
two of them fail.

Accepting the shift is the cheapest. It also means every auto-laid-out step
jumps up to 10px on its first drag. That reads as the canvas losing a position,
rather than correcting one. Nobody authored those positions, so an author
cannot tell the jump from a defect.

Picking a step that divides all four fails on arithmetic. 10 divides 240, 180
and 110, but not 64. 2 divides everything and snaps to nothing. No step both
matches the drawn 20px dots and divides the current four.

So the constants move. 110 to 120 gives slightly taller rows. 64 to 60 gives a
slightly shorter node box. Both stay within a few pixels of today, and both are
presentation with no reference anywhere outside `canvas/`.

`NODE_HEIGHT` is the wider of the two. It sets the node rect, the edge anchors
at `NODE_HEIGHT / 2`, the initial-step arrow and the connect handle. All four
read the constant rather than repeating the number, so one change moves them
together.

## Risks / Trade-offs

- **The grid rewrites on every transform change.** → It sets two custom
  properties on one element. Panzoom already sets a transform on the SVG for
  that same event. This adds one style write to a path that has one.
- **A stored position predating this change sits off the lattice.** → Nothing
  rewrites it, and nothing needs to. The first drag rounds it. A migration over
  the `layout` blob would touch every draft to fix a cosmetic offset.
- **`NODE_HEIGHT` moving alters how a graph reads.** → It is presentation
  inside `canvas/`. The UI glossary's rule holds: a node is the canvas's own
  word. No spec outside `studio-canvas` names either constant.
- **One test repeats the constants rather than reading them.**
  `studio-canvas-fit.test.ts:39` fixes `GRAPH` as a hand-derived box. Its
  comment takes the 174 height from two rows of 110 and a 64-tall node. The box
  is an input to `computeFit`, so the suite stays green either way. →
  Green is the hazard here, not red. The fixture would quietly stop describing
  the layout it names, so this change corrects it.

`studio-canvas-geometry.test.ts` imports both constants instead, and follows
on its own.
- **A third transform would put the dots and the lattice back out of step.** →
  Only Panzoom transforms the canvas today. A second one joins the same
  listener. The requirement names the canvas transform, not Panzoom.

## Migration Plan

None needed. No persisted shape changes, and no stored value becomes invalid.
An existing draft opens with its steps where they were. Each lands on the
lattice the first time an author drags it.

Rollback is a code revert. Positions written on the lattice stay valid under
the reverted code, because a lattice point is an ordinary point.

## Open Questions

- Should a modifier key bypass the snap for one drag? Every drawing tool
  offers one, and nobody has asked for it here. The answer alters no
  requirement in this change. It would add one, and the rounding helper already
  sits at the right seam to take a flag. Worth deciding after an author has
  used the snap.
