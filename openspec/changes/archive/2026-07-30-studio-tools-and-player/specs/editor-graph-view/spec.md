<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Graph view renders the Draft's steps and paths, auto-layouted

**Reason**: `packages/editor` is deleted. `studio-canvas` (already shipped)
supersedes the read-only graph view with an interactive canvas covering the
same steps/paths rendering.

**Migration**: Use `studio-canvas`.

### Requirement: Graph view is read-only in v1

**Reason**: `packages/editor` is deleted. `studio-canvas` supersedes this
with an editable canvas — read-only was `packages/editor`'s own v1 scope
limit, not a constraint that carries forward.

**Migration**: Use `studio-canvas`, which supports drag-to-move and
drag-to-connect editing directly.

### Requirement: Graph view reflects validation issues

**Reason**: `packages/editor` is deleted. `studio-canvas` and the panels
inspector beside it already surface live validation issues.

**Migration**: Use `studio-canvas`'s existing validation-issue rendering.

### Requirement: Graph node labels prefer the step's key; locale resolution is a fallback only

**Reason**: `packages/editor` is deleted along with its graph view.
`studio-canvas` already has its own node-labeling behavior.

**Migration**: Use `studio-canvas`.

### Requirement: Graph edges route directly, without looping via the opposite side

**Reason**: `packages/editor` is deleted along with its graph view's edge
routing.

**Migration**: Use `studio-canvas`'s own edge-routing behavior.

### Requirement: Graph edges display a directional arrowhead

**Reason**: `packages/editor` is deleted along with its graph view.

**Migration**: Use `studio-canvas`'s own edge rendering.

### Requirement: Graph view fits the viewport once layout has resolved

**Reason**: `packages/editor` is deleted along with its graph view.
`studio-canvas` already uses `@panzoom/panzoom` for pan/zoom, the same
library this requirement's viewport-fit behavior was built on.

**Migration**: Use `studio-canvas`'s own pan/zoom behavior.
