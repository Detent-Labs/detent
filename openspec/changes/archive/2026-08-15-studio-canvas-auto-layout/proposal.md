## Why

Stage 38 opens one arrange over the whole canvas graph, invoked by the
author. Today an author places every step by hand. `purchase-requisition.json`
carries 13 steps. That process costs 13 drags before its shape reads.
`autoPlaceSteps` in `canvas/layout.ts` already computes a depth-ordered
position for a step with none. It fills only a step missing one, and never
rearranges a graph an author has already touched.

## What Changes

- A new pure module, `canvas/arrange.ts`, computes a position for every step
  at once from the workflow graph, through `@dagrejs/dagre`'s layered
  algorithm (`rankdir: "LR"`). A collapsed or an expanded group counts as one
  node in that graph, sized by its current box. Every member then moves by
  the same offset as the group, so its position inside the group stays
  unchanged.
- A new "Arrange" control in the canvas toolbar (`CanvasView.tsx`, beside
  Fit to view and the edge-style toggle) invokes it. A confirm dialog guards
  the call whenever the draft already carries a hand-placed step, or an
  existing waypoint. That is the same `confirm()`/`t()` pattern
  `DraftToolbar` already uses for Publish and Discard.
- Flow order exempts a path that closes a cycle (a rework loop). A cycle
  makes both directions of the ordering impossible to satisfy at once.
  Both example processes this change tested against carry one.
- Arranging overwrites every stored step position in `saveState.layout`. It
  also clears every stored waypoint (`layout.waypoints`). A waypoint anchors
  to the two endpoints an arrange just moved. `layout.groups` and
  `layout.canvasEdgeStyle` stay untouched.
- Every written position passes through the existing `snapToGrid`. An
  arranged step already sits on the canvas lattice, and it does not shift
  on its first drag afterward.
- New runtime dependency: `@dagrejs/dagre` in `packages/web/package.json`.
  The roadmap named two MIT-licensed candidates, `d3-dag` and
  `@dagrejs/dagre`. Neither throws on the cyclic graphs this platform's own
  step machine allows, contrary to the roadmap entry's own premise. This
  change's design corrects that premise with a real run against both
  example definitions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the canvas toolbar gains an Arrange control. The
  `layout` blob gains a documented write path that overwrites every step
  position and every waypoint at once.

## Impact

Affected files, inside `packages/web`:

- `src/areas/studio/canvas/arrange.ts` (new): the pure layout computation.
- `src/areas/studio/canvas/layout.ts`: no functional change; its doc comment
  gains one line distinguishing `autoPlaceSteps` from the new module.
- `src/areas/studio/canvas/CanvasView.tsx`: the toolbar's third button, and a
  new `onArrange` prop.
- `src/areas/studio/screens/EditScreen.tsx`: the `onArrange` handler,
  built on the same `setSaveState` pattern `onEdgeStyleChange` and
  `onWaypointsChange` already use.
- `src/i18n/catalogs/studio.ts`: the button label and the confirm copy, EN
  only, matching this catalog's existing single-locale scope.
- `packages/web/package.json` and the root `bun.lock`: the new dependency.
  `frozen-lockfile` (`CLAUDE.md`'s gate table) checks the lockfile against
  every manifest on every push. This change's `bun.lock` diff is a
  necessary part of it, not an incidental one.

Tests, inside `packages/web`:

- `test/studio-canvas-arrange.test.ts` (new, under `packages/web/test/`),
  matching the existing `test/studio-canvas-layout.test.ts` convention for
  `autoPlaceSteps`.

Documents:

- `ROADMAP.md` (stage 38's headline and body, moving to
  `docs/roadmap-history.md` once the stage closes), `docs/current-state.md`,
  `docs/browser-checks.md`, `tmp/open-work-priority.md`.

No schema change, no engine change, no API change, no `definitionHash`
movement. A step position lives in the draft's opaque `layout` blob today,
outside `ProcessBody`, and this change keeps it there.
