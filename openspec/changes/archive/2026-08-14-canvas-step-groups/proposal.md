## Why

A process with thirty steps reads as thirty rectangles. An author may know
that eight of them are "the credit checks". There is no way to say so on the
canvas. There is no way to fold them away either.

Roadmap stage 34 asked for that. Its prerequisite, the selection set, shipped
on 2026-08-13 as `canvas-multi-select`. Grouping is the second delivery, and
the last open item on the queue.

## What Changes

- An author groups the selected steps. The group takes a name, and it draws as
  a labelled box around its members.
- Dragging the box moves every member. Each one lands on the lattice, the rule
  a multi-step drag already applies.
- A group collapses to one box the size of a step node. Its members stop
  drawing, and so does any path between two of them.
- A path from outside a collapsed group to a member draws to the box instead.
  The box is the anchor, so the path still reads as an entry into the group.
- Expanding restores every member at the position it held.
- Ungrouping drops the group and leaves every member where it is.
- The group list persists at `layout.groups`, the third reserved key in the
  same opaque blob that already carries node positions, `canvasEdgeStyle` and
  `waypoints`.

A group is an organizational device on the canvas. It is not a runtime
concept. It never reaches `ProcessBody`, and no v1 boundary moves. One
instance still holds one active step.

## Capabilities

### Modified Capabilities

- `studio-canvas`: a group of steps, its box, its collapse, and the anchor rule
  reading a size rather than assuming a node's. The selection summary gains the
  group controls beside the count and the delete it already shows.

`studio-checks-rail` needs no delta. It already states that the third column
shows a selection summary for a set of several. It already docks the collapsed
checks summary at that summary's bottom edge. Neither rule moves.

## Impact

- `packages/web/src/areas/studio/canvas/groups.ts`: the group rules, as pure
  functions.
- `packages/web/src/areas/studio/canvas/geometry.ts`: `anchorSideToward` takes
  a size.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the box, the collapse,
  the drag, and the edge rerouting.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: reading and writing
  `layout.groups`.
- The selection summary's controls, which sit inline in `EditScreen.tsx`
  rather than in a panel.
- `packages/web/src/areas/studio/app.css` and the studio i18n catalogs: the box
  and its labels.
- `packages/web/test/`: the group rules, and the anchor rule against a size.
- `docs/browser-checks.md`: the drag and the collapse.
