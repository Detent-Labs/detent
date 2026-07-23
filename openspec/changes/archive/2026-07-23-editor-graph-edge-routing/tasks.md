## 1. Edge routing: handle positions

- [x] 1.1 In `GraphView.tsx`, add `sourcePosition: Position.Right,
      targetPosition: Position.Left` to every node object produced in the
      `graph.nodes.map(...)` call (import `Position` from `@xyflow/react`).
      Leave `type` unset so nodes keep rendering as the built-in default
      node — no custom node component, no `nodeTypes` prop.

## 2. Edge style and arrowheads

- [x] 2.1 Set `type: "smoothstep"` on every edge produced in `GraphView.tsx`
      (built-in edge type key, no `edgeTypes` prop needed).
- [x] 2.2 Add `markerEnd: { type: MarkerType.ArrowClosed, color: ... }` to
      every edge (import `MarkerType` from `@xyflow/react`), matching the
      color to the edge's own `style.stroke` — `"#c00"` for an
      issue-flagged edge, the theme default otherwise — so an issue edge's
      arrowhead doesn't visually mismatch its red line.

## 3. `isLayouted` signal

- [x] 3.1 In `useDraftGraphLayout.ts`, track the `signature` the currently
      resolved `positions` correspond to (e.g. a second piece of state set
      alongside `positions` inside the existing `layoutGraph(...).then(...)`
      callback) and derive `isLayouted: boolean` by comparing it against the
      current render's `signature`.
- [x] 3.2 Return `isLayouted` as an additive field from `useDraftGraphLayout`
      without changing its existing `graph`/`positions` return shape.

## 4. `DraftProvider` reducer: load-generation counter

- [x] 4.1 In `draft/store.tsx`, reshape the reducer's state from a bare
      `Draft` to `{ draft: Draft; loadGeneration: number }`, incrementing
      `loadGeneration` only in the `case "replace"` branch (not
      `case "mutate"`).
- [x] 4.2 Update every reference inside `DraftProvider` that currently reads
      the reducer's state as `draft` directly — the `usedLocales` memo, the
      `validation` memo, their dependency arrays, `mutate`/`replace`'s
      dispatch bodies, and the context-value memo's dependency array — to
      go through the new `state.draft` shape. This is deliberately its own
      task, not folded into 4.1: a missed dependency-array update here is a
      silent stale-closure bug, not a type error.
- [x] 4.3 Expose `loadGeneration` through `DraftContextValue` / `useDraft()`.
- [x] 4.4 Add a plain unit test (no React rendering needed) calling the
      exported `reducer` function directly, asserting `loadGeneration`
      increments on a `replace` action and stays unchanged on a `mutate`
      action.

## 5. `fitView` timing fix

- [x] 5.1 In `GraphView.tsx`, remove the `fitView` prop from `<ReactFlow>`
      and instead capture the instance via
      `onInit={(instance) => (instanceRef.current = instance)}`.
- [x] 5.2 Add a `hasFitRef` ref. Add an effect keyed on `[loadGeneration]`
      that sets `hasFitRef.current = false`.
- [x] 5.3 Add a second effect keyed on `[isLayouted, loadGeneration]` — both,
      not `isLayouted` alone — that calls `instanceRef.current?.fitView()`
      and sets `hasFitRef.current = true` when `isLayouted` is `true` and
      `hasFitRef.current` is `false`. Keying on `loadGeneration` too is what
      makes reloading an unchanged process re-check and fit even though
      `isLayouted` itself never changes value in that case (see design.md).

## 6. Static smoke test

- [x] 6.1 Added `test/graph-view-rendering.test.tsx` using the
      `renderToStaticMarkup` convention. The originally planned assertion
      (an edge carries `markerEnd`) turned out not to be checkable this
      way: React Flow only paints an edge `<path>` once each endpoint
      node's handle bounds are measured via a `ResizeObserver`-driven
      effect, which never fires under SSR — confirmed empirically (the
      static markup renders both nodes and the arrowhead `<defs>`, but no
      edge `<path>` at all). Also had to `mock.module` `./layout`, since
      `layout.ts` constructs a real `elkjs` `ELK()` at module scope, which
      needs a `Worker` global `bun test`'s runtime doesn't provide — no
      existing test had ever imported `GraphView.tsx` (transitively
      importing `layout.ts`) before this one, so that gap never surfaced.
      Landed instead on asserting each node's `data-handlepos` is `left`/
      `right`, never `top`/`bottom` — the part of this change static
      rendering *can* verify, covering task 1.1. `markerEnd`/edge
      rendering and fitView timing were confirmed instead by driving the
      actual running dev server with Playwright (see Manual Verification
      below) — stronger evidence than a mocked unit test, just not a
      lasting CI regression check for those two.
      Along the way, discovered and fixed a wider pre-existing issue: this
      devcontainer's `node_modules` had ~324 symlinks left over from an
      install under a different bind-mount scheme, pointing at a
      nonexistent `/mnt/host/...` path (already broke the existing
      `content-locale-rendering.test.tsx`/`i18n-rendering.test.tsx`, and
      independently broke the Vite dev server itself once its own
      toolchain packages were touched). Fixed with a full `node_modules`
      wipe + clean `bun install` after the dev server holding a lock on
      `esbuild`'s binary was stopped and restarted. Full suite is green:
      63 pass / 0 fail.

## 7. Manual verification

Done against the actual running dev server (Playwright driving Chromium
against `localhost:5173`), not just reasoned about. `showOpenFilePicker`
was stubbed with a `run-code` script (the File System Access API isn't
reachable through a normal `<input type=file>` automation path) to import
real example files without a native OS dialog.

- [x] 7.1 Imported `examples/expense-approval.json`. Every edge — including
      `capture -> review` and the `review` step's branch to `book`/
      `rejected` — renders as a short, direct, right-angle-segmented
      connection; no loop. Confirmed both visually (screenshot) and via
      each edge path's `d` attribute (multi-segment `L`/`Q` commands, not a
      single-curve Bezier).
- [x] 7.2 The `book <-> booking_error` counter-edge pair: both directions
      carry `marker-end` (`url(...&type=arrowclosed)`) and take visibly
      different routes (one loops up and back, the other stays local),
      making them distinguishable independent of the arrowheads alone.
      Confirmed via each edge's `d`/`marker-end` attributes. No issue-
      flagged edge existed in this imported (already-valid) draft to check
      the marker-color-match against, but the code path is identical to
      the non-issue case already exercised here — same `markerEnd: {
      type: ..., color: issueColor }` expression regardless of branch.
- [x] 7.3 Attempted a real drag between two handle elements via
      Playwright's `drag` command. It couldn't even be initiated — timed
      out with "element intercepts pointer events" against the *parent
      node* div, because the handle itself has `pointer-events: none` (no
      `connectionindicator` class, confirmed via computed style) and isn't
      reachable for pointer input at all. Edge count before/after: 3/3,
      unchanged. Stronger evidence than a click-then-assert would have
      been — the interaction is disabled at the browser event-routing
      level, matching design.md's analysis of the `DefaultNode`/`Handle`
      internals exactly.
- [x] 7.4 First import fit the whole 6-node graph into the 480px-tall
      viewport with no manual zoom-out needed (confirmed via screenshot).
- [x] 7.5 Added a step after the initial fit; the viewport's `transform`
      style was byte-identical before and after
      (`translate(43.65px, 129.186px) scale(1.19583)`) — no refit.
- [x] 7.6 Imported a second, different process
      (`examples/subprocess-loan-parent.json`) into the same session; the
      transform changed to a new fitted value
      (`translate(37.32px, 95.68px) scale(1.64)`) sized to the new graph.
- [x] 7.7 Manually zoomed away from the fitted view (wheel scroll →
      `translate(239.317px, 144.55px) scale(1.082)`), then re-imported the
      *same* `subprocess-loan-parent.json` again. The transform snapped
      back to exactly the earlier fitted value
      (`translate(37.32px, 95.68px) scale(1.64)`) — confirming the refit
      fired even though the structural `signature` was unchanged and
      `isLayouted` itself never toggled, which is precisely the gap an
      `isLayouted`-only trigger would have missed (see design.md).

## 8. Typecheck

- [x] 8.1 Run `tsc --noEmit` (inside the devcontainer) and confirm the
      editor package still type-checks with the new `Position`/`MarkerType`
      imports and the reshaped `DraftContextValue`/reducer state.
