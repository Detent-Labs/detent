## Why

The studio canvas holds one selected step at a time. `CanvasView` takes a
`selectedStepId: string | undefined`. An author who wants to move four steps
drags them one by one.

That single id is also the state every later canvas item builds on. Stage 34's
grouping needs a set. Stage 31 hangs anchors off a selected element, and stage
33 hangs control points off one. Each reads the selection as one id today.
Land the set after them and node dragging gets written twice.

The set pays for itself before any of that. A move of several steps and a
delete of several steps both come with it. Stage 34 needs neither to justify
the work.

## What Changes

- The canvas selection becomes a set of step ids. One selected step behaves as
  it does today.
- A shift-click on a step node adds it to the set, or drops it. A plain click
  still replaces the set with that one step.
- A shift-drag on empty canvas draws a marquee. It selects every step whose
  node the marquee touches. A plain drag still pans, unchanged.
- A drag on a node the set holds moves every step in the set. Each one moves
  by the same pointer delta, and each lands on the lattice. Stage 37's rule
  therefore holds for a group as it holds for one step.
- The third column shows a count and a delete control while the set holds more
  than one step. The inspector edits one step, and a group names no one step
  for it.
- A group delete takes out each step the way the inspector's own delete takes
  out one. A path that pointed at a deleted step stays as it is, and the checks
  rail reports it. That is what a single delete leaves today.

Path selection stays single. A path is reachable only under its source step.
Nothing in stages 31 to 34 asks for a set of paths yet.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the selection becomes a set of steps. The shift-click, the
  marquee, the group move and the group delete are new behaviour. The
  inspector requirement gains the case where the set holds several steps. The
  pure-function requirement gains two computations.
- `studio-checks-rail`: its collapsed summary docks under the group summary
  too, not under the inspector alone.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the selection prop,
  the node pointer handlers, the marquee gesture and its rendering.
- `packages/web/src/areas/studio/canvas/selection.ts`: new. It holds two pure
  functions. One toggles a step in the set. The other is the marquee overlap
  test. Both get a test file, as `geometry.ts` and `dropGesture.ts` already do.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: holds the id set,
  derives the one step the inspector takes, and renders the group summary in
  the third column.
- `packages/web/src/areas/studio/app.css`: the marquee rectangle and the group
  summary.
- `packages/web/src/i18n/catalogs/studio.ts`: the group summary's strings. That
  catalog carries EN alone, and `studio/catalog.ts` reads it at a fixed `"en"`.
- `packages/web/test/studio-canvas-selection.test.ts`: new.
- `docs/browser-checks.md`: the shift-click and marquee walk.
- `ROADMAP.md`: stage 34's first delivery.
- `docs/current-state.md`: the studio canvas subsystem.
- No engine change, no API change, no schema change. Nothing leaves
  `packages/web`.
