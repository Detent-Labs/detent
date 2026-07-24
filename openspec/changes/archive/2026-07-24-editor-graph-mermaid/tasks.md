## 1. Dependencies

- [x] 1.1 Add `mermaid` and `@panzoom/panzoom` to `packages/editor/package.json` dependencies.
- [x] 1.2 Add `mermaid-isomorphic` to `packages/editor/package.json` devDependencies; confirm/install its Playwright browser requirement in the devcontainer.
- [x] 1.3 Remove `@xyflow/react` and `elkjs` from `packages/editor/package.json`.
- [x] 1.4 `bun install` and confirm the workspace resolves cleanly.

## 2. DSL generation

- [x] 2.1 Add a `graph/mermaid.ts` module that generates a `flowchart LR` DSL string from `DraftGraph` (`mapping.ts`'s `draftToGraph` output stays unchanged as the input).
- [x] 2.2 Escape/quote node and edge label text for Mermaid syntax (`"`, `[`, `]`, `|`, and any other characters that collide with flowchart syntax).
- [x] 2.3 Emit `style <nodeId> stroke:#c00,stroke-width:2px` for each node with one or more `EditorIssue` entries (`validation.issues` filtered by `entityId`), matching today's `GraphView.tsx` filter logic.
- [x] 2.4 Emit `linkStyle <index> stroke:#c00` for each issue-flagged edge, tracking each edge's positional emission index (Mermaid indexes links positionally, not by id).
- [x] 2.5 Encode `isInitial`/`terminal` node flags into the node's label text (matching the current `t("graph.initialSuffix")`/`t("graph.terminalSuffix")` suffixes).
- [x] 2.6 Unit-test the generator directly (pure string-in/string-out, no DOM) against representative `DraftGraph` fixtures: plain graph, issue-flagged node, issue-flagged edge, counter-edges between the same two steps.

## 3. Rendering

- [x] 3.1 Rewrite `layout.ts` (or replace it with a thin wrapper) so it no longer runs `elkjs`; layout is now implicit in Mermaid's own render pass.
- [x] 3.2 Rewrite `useDraftGraphLayout.ts`: drop the ELK-specific `positions`/`signature` machinery, keep (or adapt) the structural-signature concept only as far as still needed for viewport-fit gating (see Task Group 4).
- [x] 3.3 Rewrite `GraphView.tsx` to render the Mermaid-generated SVG (via `mermaid`/`mermaid-isomorphic`) into the DOM, replacing the `<ReactFlow>` tree.
- [x] 3.4 Verify arrowhead-marker recoloring for issue-flagged edges: confirm whether Mermaid's `linkStyle` affects the arrowhead marker itself or only the line stroke (design.md Open Questions). If not, apply a themeVariables override or a targeted post-render DOM patch on the generated SVG's `<marker>` element(s).
- [x] 3.5 Decide and implement the fallback for validation-issue tooltip text (currently a `title` attribute per node/edge) — either an `<svg><title>` child per node/edge, or explicitly drop it for this change (design.md Open Questions).

## 4. Pan/zoom and viewport preservation

- [x] 4.1 Wire `@panzoom/panzoom` onto the mounted SVG element.
- [x] 4.2 Implement transform preservation across re-renders: before Mermaid regenerates and replaces the SVG, capture the current panzoom transform; after remount, reapply it (or fit-to-viewport instead, per Task 4.3/4.4).
- [x] 4.3 Implement fit-to-viewport-once-per-load: fit on first render of a given process, matching the existing `hasFitRef`/`loadGeneration` gating pattern from `useDraftGraphLayout.ts`/`GraphView.tsx`.
- [x] 4.4 Implement refit-on-Load/Import, including reload of an unchanged file (the `loadGeneration` counter path), reusing `DraftProvider`'s existing `loadGeneration` state (`draft/store.tsx`).
- [x] 4.5 Confirm a non-structural redraw (e.g. content-locale switch) preserves the viewport rather than resetting or freezing it (new spec scenario).

## 5. Tests

- [x] 5.1 Rewrite `test/graph-view-rendering.test.tsx` to render via `mermaid-isomorphic` instead of `react-dom/server`'s `renderToStaticMarkup`, asserting the produced SVG contains the expected structural markers (arrowhead `marker` reference, issue `stroke` styling) — same coverage intent as today, new rendering path.
- [x] 5.2 Add/port any other test currently asserting on React-Flow-shaped node/edge objects to assert on the generated Mermaid DSL string and/or rendered SVG instead.
- [x] 5.3 Manually verify against `examples/expense-approval.json` and the other two `examples/*.json` files: layout looks reasonable (dagre vs. former ELK output), forward edges are direct (no loops), counter-edges are visually distinguishable via arrowheads, read-only (no drag-to-reposition/connect affordance exists in the rendered SVG), pan/zoom works, fit-on-load/Load/Import/reload/locale-switch all behave per spec.

## 6. Cleanup

- [x] 6.1 Remove any now-unused ELK/React-Flow-specific code, types, or CSS imports (`@xyflow/react/dist/style.css`, etc.) left behind after the rewrite.
- [x] 6.2 Update `NODE_WIDTH`/`NODE_HEIGHT` or equivalent sizing constants if Mermaid's default node sizing makes them obsolete.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` inside the devcontainer and fix any type errors.
- [x] 7.2 Run the full `bun test` suite inside the devcontainer with `DATABASE_URL` set (never a single-file rerun) and confirm a clean pass with no unexpectedly skipped suites.

## 8. Post-verification fixes (from /openspec-verify-change)

- [x] 8.1 Add a second `MODIFIED Requirements` entry for "Graph edges route directly via fixed handle positions" rephrasing it in implementation-neutral terms — the base spec's normative text still described React Flow "handles"/`smoothstep`, which no longer exist under Mermaid.
- [x] 8.2 Update `design.md`'s pan/zoom-preservation decision to describe the actual implementation (inlined in `GraphView.tsx`, `useDraftGraphLayout.ts`/`layout.ts` deleted outright) instead of the un-taken `usePanzoomPreservation` hook it originally proposed.
- [x] 8.3 Replace the width-only `panzoom.reset()` fit with an explicit 2D fit (`computeFitTransform`, `GraphView.tsx`) computed from the diagram's `viewBox` against the container's actual rendered size, closing the vertical-clipping risk for a diagram taller than the container. Covered by `test/graph-fit-transform.test.ts` (pure function, no DOM needed).
- [x] 8.4 Re-run `bun run typecheck` and the full `bun test` suite after the fix.
