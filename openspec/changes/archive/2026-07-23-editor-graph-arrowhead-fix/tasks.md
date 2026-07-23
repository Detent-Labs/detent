## 1. Fix the arrowhead color regression

- [x] 1.1 In `packages/editor/src/graph/GraphView.tsx`'s `edges` mapping,
  change `markerEnd: { type: MarkerType.ArrowClosed, color: issueColor }`
  to omit the `color` key entirely when `issueColor` is `undefined`, e.g.
  `markerEnd: issueColor ? { type: MarkerType.ArrowClosed, color: issueColor } : { type: MarkerType.ArrowClosed }`.
- [x] 1.2 In the devcontainer, import `examples/expense-approval.json` into
  the running editor dev server (Chrome, e.g. via Playwright) and visually
  confirm every edge now shows a solid, visible arrowhead — including the
  `book <-> booking_error` counter-edge pair — and that an issue-flagged
  edge's arrowhead still renders in its issue color (`#c00`).

## 2. Add regression coverage

- [x] 2.1 In `packages/editor/test/graph-view-rendering.test.tsx`, add an
  assertion against the `renderToStaticMarkup` output of the existing
  two-step draft: the rendered `<marker>` polyline for the edge does not
  contain `fill: none` (or, more directly, contains a real color token) —
  covering the exact defect (an edge with no validation issue, so
  `issueColor` is `undefined`).
- [x] 2.2 Update the file's leading comment (currently states the marker/
  edge-rendering stays manually-verified-only) to reflect that the marker
  `<defs>` block's paint is now covered, while the edge `<path>` itself
  (still unrenderable under SSR per the `ResizeObserver` limitation) stays
  manual.

## 3. Verify

- [x] 3.1 Run `bun test` inside the devcontainer with `DATABASE_URL` set (a
  full-suite run, per CLAUDE.md — not a single-file rerun) and confirm the
  new assertion passes and nothing else regresses.
- [x] 3.2 Run `bun run typecheck` inside the devcontainer.
