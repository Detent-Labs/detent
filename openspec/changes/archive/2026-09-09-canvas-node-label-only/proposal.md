## Why

A canvas step node prints two lines today. The label sits on top. The step's
key sits under it in mono, and that key is a slug referencing nothing. So a
third of every node goes to a value an author never reads while laying out a
process. The label alone says which step a box is.

The key stays reachable. The inspector shows it, the JSON view carries it, and
the node's accessible name still names it.

## What Changes

- The canvas step node draws the label line alone. The key line goes.
- The label centres vertically in the node, rather than sitting at the top of
  a two-line block.
- The label keeps its fallback chain. A step whose label resolves to nothing
  falls back to its key. One carrying neither falls back to the unnamed-step
  string.
- The step's `aria-label` keeps its wording. It still names the label, the key
  and the kind phrase.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: one requirement changes. "A step node prints the step's
  label, resolved for the content locale" drops the key line. Its two
  scenarios about a second line go with it.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the key `<text>`
  element, the `nodeKey` style, and the y coordinates of the label and of the
  inline rename field.
- `packages/web/test/studio-canvas-node-label.test.tsx`: the suite reads both
  lines off the rendered markup. Its key-line assertions now assert that no
  key line renders.
- No engine, schema or HTTP change. Nothing about the stored definition moves.
