## Why

Two studio surfaces let an author start a path from a terminal step.

On the canvas, `resolveDropGesture` checks trigger consistency
(`checkConnection`). It also checks whether the drop hits another node.
It never checks `step.terminal`.

In the inspector, `PathsPanel`'s "add path" button carries no
`terminal` prop and no guard at all. It always calls `addPath`,
whether or not the owning step is terminal.

The result, either way, is a draft where `terminal: true` and
`paths.length > 0` coexist on the same step.
`src/schema/definition.ts`'s `step` refinement rejects that combination
outright: "a terminal step has no outgoing paths." Neither surface gives
feedback at the point of the mistake. The panel gives none at all, not
even an inline message.

## What Changes

- `resolveDropGesture` (`packages/web/src/areas/studio/canvas/dropGesture.ts`)
  takes the source step's `terminal` flag. It returns a `"rejected"`
  result when the source is terminal. This check runs before the
  trigger-consistency check or the hit-test. A terminal source is invalid
  no matter what the drag would otherwise resolve to.
- `CanvasView.tsx` passes the source step's `terminal` flag into
  `resolveDropGesture`. It surfaces the rejection through the existing
  `showRejection` inline-message UI, the same path other rejected
  gestures already use.
- The connect handle gets a visual affordance marking it invalid on a
  terminal step (non-interactive styling). The reject should not be the
  first signal an author sees.
- `PathsPanel` takes a `terminal` prop. Its "add path" button disables
  when the step carries `terminal: true`. This extends its existing
  `disabled={steps.length === 0}` condition. `StepsPanel` passes
  `step.terminal` through.

## Capabilities

### Modified Capabilities
- `studio-canvas`: the drag-to-connect requirement gains a rejection
  case for a terminal source step. The inspector requirement gains a
  disabled "add path" control for a terminal step.

## Impact

- `packages/web/src/areas/studio/canvas/dropGesture.ts`: `resolveDropGesture` signature and logic.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: call site, connect-handle rendering.
- `packages/web/src/areas/studio/app.css`: connect-handle terminal-state styling.
- `packages/web/src/areas/studio/panels/PathsPanel.tsx`: `terminal` prop, "add path" disabled condition.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx`: passes `step.terminal` into `PathsPanel`.
- `packages/web/test/studio-canvas-dropGesture.test.ts`: new rejection cases.
- No schema or contract change. `src/schema/definition.ts`'s existing
  refinement stays as it is. This only makes the studio UI reject the
  same case earlier and with feedback.
