## 1. Canvas gesture rejection

- [x] 1.1 In `packages/web/src/areas/studio/canvas/dropGesture.ts`, add
      a `sourceTerminal: boolean = false` parameter as the fifth,
      trailing parameter of `resolveDropGesture`. Return `{ kind:
      "rejected", reason }` immediately when it is `true`, before the
      `checkConnection` and `hitTestNode` calls. Do not edit the five
      existing calls in `studio-canvas-dropGesture.test.ts`; the
      default keeps them passing as non-terminal sources.
- [x] 1.2 In `packages/web/src/areas/studio/canvas/CanvasView.tsx`'s
      `onHandlePointerUp`, pass `sourceStep?.terminal === true` as the
      new argument to `resolveDropGesture`.

## 2. Canvas visual affordance

- [x] 2.1 In `CanvasView.tsx`, add a modifier class (for example
      `canvas-connect-handle-terminal`) to the connect-handle `circle`
      when `step.terminal` is `true`.
- [x] 2.2 In `packages/web/src/areas/studio/app.css`, style that class
      distinctly from `.canvas-connect-handle`'s default: fill
      `var(--color-text-muted)` (the token `.canvas-node-key` already
      uses), cursor `not-allowed`.

## 3. Inspector "add path" guard

- [x] 3.1 In `packages/web/src/areas/studio/panels/PathsPanel.tsx`, add
      a `terminal?: boolean` prop. Extend the "add path" button's
      existing `disabled={steps.length === 0}` to `disabled={steps.length
      === 0 || terminal}`.
- [x] 3.2 In `packages/web/src/areas/studio/panels/StepsPanel.tsx`,
      pass `terminal={step.terminal}` to `PathsPanel`.

## 4. Tests

- [x] 4.1 In `packages/web/test/studio-canvas-dropGesture.test.ts`, add
      a case asserting `resolveDropGesture` returns `rejected` for a
      terminal source, dropped on another step.
- [x] 4.2 Add a case asserting `rejected` for a terminal source dropped
      on empty canvas.
- [x] 4.3 Add a case asserting the terminal check runs before the
      trigger-consistency check: a terminal source whose existing paths
      would otherwise pass `checkConnection` still rejects.

## 5. Spec sync

- [x] 5.1 Confirm `openspec/changes/block-terminal-step-connect/specs/studio-canvas/spec.md`'s
      scenarios match the implemented behavior; adjust either the spec
      or the implementation if they diverge during coding.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and confirm no errors.
- [x] 6.2 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
