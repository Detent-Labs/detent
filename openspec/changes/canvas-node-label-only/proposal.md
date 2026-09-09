## Why

A canvas step node prints two lines today. The label sits on top, and the
step's key sits under it in mono. The key is a slug that references nothing,
so the canvas spends a third of every node on a value the author does not read
while laying out a process. The label alone says which step a box is.

The key stays reachable. The inspector shows it, the JSON view carries it, and
the node's accessible name still names it.

## What Changes

- The canvas step node draws the label line alone. The key line goes.
- The label centres vertically in the node, rather than sitting at the top of
  a two-line block.
- The label's fallback chain is unchanged. A step whose label resolves to
  nothing falls back to its key, and one carrying neither falls back to the
  unnamed-step string.
- The step's `aria-label` is unchanged. It still names the label, the key and
  the kind phrase.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the requirement "A step node prints the step's label,
  resolved for the content locale" drops the key line and its two scenarios
  about a second line.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the key `<text>`
  element, the `nodeKey` style, and the y coordinates of the label and of the
  inline rename field.
- `packages/web/test/studio-canvas-node-label.test.tsx`: the suite reads both
  lines off the rendered markup. Its key-line assertions become assertions
  that no key line renders.
- No engine, schema or HTTP change. Nothing about the stored definition moves.
