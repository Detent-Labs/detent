## Why

A step labelled "Confirm Completion to Opteon" runs out past its own node. The
node body draws the label as one SVG `<text>` at `x=10`, and the node is 180
units wide. Nothing clips that text. A label over roughly 24 characters crosses
the right border. It then paints over the connect handle and over whatever sits
beyond it.

## What Changes

- The node body draws the label over at most two lines, wrapped at the node's
  own width. A word wider than that width breaks, so a German compound wraps
  rather than running past the edge uncut.
- A label too long for two lines ends in an ellipsis.
- A cut label stays reachable on hover, through the element's `title`. A label
  that fits carries none, so the tooltip keeps meaning something.
- Every node's first line starts at one offset from its top edge, at one line
  and at two. A row of nodes then reads along a shared line.
- The node keeps its size, 180 by 60. The collision test, the edge anchors,
  auto-arrange and fit-to-screen read the same two constants they read today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the requirement naming what a step node prints. It puts the
  label on one centred line. Two lines replace that one. The ellipsis and the
  hover title come with them.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the node body's
  `<text>` element. `nodeLabel` is rewritten as the clamp, and a new
  `nodeLabelBox` joins it to position. A single element cannot do both. A
  `NodeLabel` component holds the measurement the conditional `title` needs.
- `packages/web/test/studio-canvas-node-label.test.tsx` reads the `<text>`
  element and its `y` attribute. Both go away. The file reads the new markup
  instead.
- `docs/browser-checks.md`: the wrap and the ellipsis are visual judgments, so
  `development-toolchain` sends them to the manual checklist.
- Nothing outside the node body. The geometry module, the routing, the inline
  rename field and the two stamps stay as they are.
