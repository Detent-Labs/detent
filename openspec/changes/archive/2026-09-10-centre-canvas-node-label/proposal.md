## Why

A two-line step label sits lower in its node than a one-line label. The label
box tops its content behind 20 units of padding, so two clamped lines close at
59 inside a 60-unit node. The owner reads the result as a label that has
fallen out of the node's middle.

The current rule is deliberate: a shared first line keeps a row of nodes
aligned. The owner ranks the label's own placement in the node above that row
alignment.

## What Changes

- Centre a step node's label block vertically, whether it takes one line or
  two.
- Replace the shared-first-line requirement in `studio-canvas` with a
  shared-centre requirement. The delta removes the requirement and adds a
  replacement, because no delta operation renames a scenario.
- Retarget the source-level assertion that pins the old declarations.
- Rewrite the two manual browser checks that read the old rule.

No contract, engine or HTTP surface moves. Nothing but the label's vertical
position in the node changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `studio-canvas`: the requirement covering the node label states a
  vertical-centring rule. A one-line and a two-line label share a centre
  instead of a first line.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: the `nodeLabelBox`
  style entry and the comment above it.
- `packages/web/test/studio-canvas-node-label.test.tsx`: the case named "tops
  the label box rather than centring it", plus the height case that budgets
  the padding.
- `openspec/specs/studio-canvas/spec.md`: one scenario.
- `docs/browser-checks.md`: the `canvas-node-label-clamp` section, which
  states the old rule twice.
