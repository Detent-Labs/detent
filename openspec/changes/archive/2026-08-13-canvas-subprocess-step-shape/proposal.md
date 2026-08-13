## Why

The canvas draws a subprocess step and a task step as the same rectangle. A
subprocess step is a wait-state that calls another process and returns, and
nothing on the node says so. An author reads the step type from the inspector,
one step at a time, or from the JSON.

Roadmap stage 32 asked for a shape per step kind and per path kind. Three of its
four asks already ship. An initial step carries a stamp, and a terminal step
carries an outcome stamp. An automatic path draws solid against a manual path's
dashed stroke. The subprocess step is the one gap.

## What Changes

- A subprocess step's node draws a second rule inside its rectangle, inset from
  the outer one. A task step's node keeps today's single rectangle.
- The inset rule takes radius 0 and the border colour role the node rectangle
  already reads. No new colour role, and no fill.
- The marker follows the step's `type` field, so it appears and disappears as
  the author switches the identity section's type control.

No schema change and no API change. The step type this reads is already in the
draft.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: a new requirement that a subprocess step's node is distinct
  from a task step's node on the canvas.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the node group draws
  one more `<rect>` when the step is a subprocess.
- `packages/web/src/areas/studio/app.css`: one class for that rule.
- `docs/browser-checks.md`: the walk that confirms the marker, since no test
  in this repository reads a rendered node.

No engine file, no route, and no catalog string. The marker carries no text, so
it needs no translation.
