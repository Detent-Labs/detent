## Context

See proposal.md - Why.

The canvas holds one id in two places. `EditorArea` holds `selectedStepId` and
`selectedPathId` as two `useState` hooks. It passes both into `CanvasView` and
into `StepsPanel`. `onSelectStep(stepId, pathId)` writes both at once.
Twenty-five sites across five files read one of the two names.

Three properties of the canvas shape every decision below.

Panzoom binds its own pointer-down handler to `.canvas-wrap`, as a native
listener rather than through React. A drag on empty canvas therefore pans
before any React handler sees the event. `.panzoom-exclude` opts an element
out. Every node and edge group already carries that class. The bare SVG
background does not, which is what makes a background drag pan at all.

`snapToGrid` in `canvas/geometry.ts` rounds a position to `GRID_STEP`. A drag's
release calls it. So do the drag preview and the palette drop.
`ROW_HEIGHT`, `COLUMN_WIDTH`, `NODE_WIDTH` and `NODE_HEIGHT` are whole
multiples of it. An auto-placed step therefore sits on the lattice already.

`EditorArea.onMoveStep` writes one step's position. It uses a functional
`setSaveState` updater.

## Goals / Non-Goals

**Goals:**

- One selection state that later canvas stages read. None of them rewrites
  node dragging to get it.
- A move and a delete over several steps, from that same state.
- Stage 37's lattice rule, unchanged for a group.

**Non-Goals:**

- Grouping. That is stage 34, item 8b, and it needs this first.
- A set of selected paths. Nothing asks for one yet.
- Keyboard selection, or a select-all shortcut.
- Any change to `StepsPanel`, `PathsPanel` or the inspector's own editors.

## Decisions

### The set is a `string[]`, and `CanvasView` takes it whole

`selectedStepId: string | undefined` becomes `selectedStepIds: string[]`.
`selectedPathId` stays as it is.

An array, not a `Set`. A `Set` needs a fresh instance on every write to pass
React's identity check. That costs what a fresh array costs. The array also
prints in React DevTools. Membership is an `includes` over a handful of ids.

Alternative rejected: one `Selection` object holding the step ids and the path
id together. It reads well. It also turns each of the twenty-five read
sites into a property access on a new type. It buys no behaviour.

### `EditorArea` derives the one step the inspector takes

`StepsPanel` keeps its `selectedStepId: string | undefined` prop, and changes
in no other way. `EditorArea` computes that prop:

```ts
const inspectedStepId = selectedStepIds.length === 1 ? selectedStepIds[0] : undefined;
```

The third column then has three states rather than two. No selection shows the
checks rail. One step, or a path, shows the inspector. Several steps show the
group summary.

Alternative rejected: an anchor step, so the inspector shows the last-clicked
member of a group. It saves the summary. It also invites an author to work on
one step while four look selected.

### Shift is the selection modifier, and the marquee suppresses panning

A shift-click on a node toggles it. A shift-drag on the background draws the
marquee. One modifier covers both gestures.

Three facts about Panzoom decide the shape here.

Its down-handler binds to `.canvas-wrap` in the bubble phase. Its default
`handleStartEvent` then calls `e.stopPropagation()`. React binds its own
listeners at the root container, which is an ancestor of `.canvas-wrap`. A
bubble-phase `onPointerDown` there therefore never runs. Node presses run today
only because `isExcluded` returns before `handleStartEvent` does, and every
node carries `panzoom-exclude`.

So the marquee starts on `onPointerDownCapture`. React dispatches its capture
handlers when the event passes the root going down. `.canvas-wrap`'s bubble
listener has not run at that point, and nothing has stopped the event. The
handler ignores any target inside `.panzoom-exclude`, the same guard the wheel
listener already applies.

It binds to `.canvas-wrap`, not to the SVG. Panzoom scales the SVG element
itself. Most of the visible canvas then sits outside the SVG's own box, at any
zoom under 1. The palette drop already resolves through the wrap for the same
reason. The browser check found this one. A shift-drag on visible grid started
no band, and panned instead.

The band itself is an HTML overlay in the wrap, beside `.canvas-reject-message`
rather than inside the SVG. An SVG rect clips at that same shrunken viewport.
The overlay also holds a one-pixel outline at every zoom, with no
`non-scaling-stroke` to arrange. The hit test still runs in user space, so the
gesture carries its press point in both.

Panzoom's down-handler still runs after that, and still sets `isPanning`. The
pan dies one level lower. `constrainXY` reads `disablePan` off a fresh
`{ ...options }` spread on every call. So `panzoom.setOptions({ disablePan:
true })` in the capture handler kills a pan that has already started.

The marquee takes pointer capture on the SVG at its start, through the
`capturePointer` helper the node drag already uses. Panzoom binds `move` and
`up` on `document`. A release outside the SVG would otherwise never restore
`disablePan`. The canvas would then stop panning for the life of the screen.
`onPointerUp` and `onLostPointerCapture` both restore it.

One alternative loses. A toolbar toggle between a pan mode and a select mode
costs more. It adds a control, a state, and a mode an author has to hold in
mind.

### The marquee selects on overlap, not on containment

A step joins the set when the marquee rectangle overlaps its node rectangle at
all. Containment would ask an author to draw around a 180-by-60 node. At the
fit scale that is most of the visible canvas.

The test is a rectangle-overlap predicate in the new `canvas/selection.ts`. A
`toggleSelection(ids, id)` rule sits beside it. Both are pure. Both get a test
file. `geometry.ts`, `dropGesture.ts`, `connection.ts` and `layout.ts`
already sit that way. The capability requires that shape.

The marquee normalizes its two corners. A drag up and left therefore selects
what a drag down and right selects.

### A group move rounds each step's own position

The drag applies one raw pointer delta to every member's start position. It
then rounds each result with `snapToGrid`. It does not round the delta.

Stage 37's rule says that in the same words for one step and for many. Every
layout constant is a whole multiple of `GRID_STEP`. A group already on the
lattice therefore keeps its relative offsets under that rounding. Rounding the
delta instead would keep the offsets of a group that sits off the lattice. It
would also leave each member off it.

The write goes through the existing `onMoveStep`, once per member.
`setSaveState`'s updater is functional, so the calls compose into one layout
object. The prop list stays as it is.

`nodeDrag` grows one field: the ids the gesture moves. Pointer-down computes
them and writes no selection:

```ts
const dragIds = selectedStepIds.includes(id) && !e.shiftKey ? selectedStepIds : [id];
```

Every selection write stays at pointer-up, where it sits today. Past the click
threshold the gesture moves `dragIds`, and replaces the set with `[id]` when
that node sat outside it. Under the threshold a shift toggles, and a plain
release replaces the set with that one step. Writing the selection at
pointer-down instead would replace the set under a shift-press. The second
shift-click of a pair would then leave one step selected.

### The group summary lives in `EditScreen`, not in a component of its own

It is a count line and one button in the third column. Its delete walks the
`mutate` shape `StepsPanel.removeStep` uses, over a list of ids rather than
one. It leaves inbound paths as they are. The single delete does that today,
and the checks rail already reports them.

The summary docks the collapsed checks rail at its bottom edge, through the
same `<ChecksRail validation={validation} collapsed />` call `StepsPanel`
already makes. An author keeps the issue count in all three states of the
column. `studio-checks-rail` requires that dock beside the inspector. The delta
widens it to this state, rather than carving an exception out of it.

The delete control stays outlined. The screen's one primary action sits in the
header bar. This repo's design language also keeps a destructive action
outlined, and never red.

The marquee rectangle carries `pointer-events: none`. `onBackgroundPointerUp`
clears the selection when the pointer-up target is the SVG itself. A rect that
took the event would clear the set the marquee had just built. The marquee
branch also returns before that deselect branch runs.

Skipped: pruning inbound paths on delete. Add it when somebody asks for it for
the single delete too, so the two stay one rule.

### No keyboard Delete

The canvas owns no focus. Its inline rename input sits inside a
`foreignObject`, and its key events bubble through the same tree. A
document-level Delete handler would need a guard against that input, and
against every other field on the screen. The button carries the affordance
instead.

## Risks / Trade-offs

- Two Panzoom behaviours here read off its source, not off a documented
  promise. Those are `disablePan` reaching a running gesture, and
  `handleStartEvent` stopping propagation. → `package.json` pins the version.
  The browser check drives a marquee over a panned, zoomed canvas. A break
  shows as the canvas panning under the marquee, which nobody will miss.
- A shift-drag on a node is a node drag, not a marquee. → Its pointer-down
  stops propagation, so no marquee starts. The handler reads the shift at
  pointer-up, where it toggles.
- Twenty-five read sites make a missed one plausible. → `tsc` catches every
  one. The change renames the prop rather than widening it, so an old read
  fails to compile.
- An author who pans with shift held out of habit gets a marquee. → The
  gesture is new. The plain drag beside it still pans.

## Migration Plan

None. The selection is component state, and it lives for the life of one
screen. No stored data carries it, and no route carries it. The draft's
`layout` blob keeps its current shape. A reload starts with an empty set, as it
does today.

## Open Questions

None that would change the specs, the approach or the tasks.
