## 1. The node body

- [x] 1.1 Add the two style entries. `nodeLabelBox` takes `height: 100%`,
  `display: flex`, `align-items: center`. `nodeLabel` becomes the clamp:
  `display: -webkit-box`, `-webkit-box-orient: vertical`,
  `-webkit-line-clamp: 2`, `overflow: hidden`, keeping the 13px face. Verify
  `bun run build` compiles both.
- [x] 1.2 Replace the node body's `<text x={10} y={34}>` with
  `<foreignObject x={10} y={0} width={NODE_WIDTH - 36} height={NODE_HEIGHT}>`.
  Name all four: no `height` draws nothing, and the outer `<div>` resolves
  its own `height: 100%` against this rect. The 26 on the
  right clears the connect handle. Verify a short label draws centred.
- [x] 1.3 Nest the two `<div>`s inside it. The outer takes `nodeLabelBox`,
  `aria-hidden="true"` and a `title` of the full label. The inner takes
  `nodeLabel` and the text. Verify a long label wraps and ends in an ellipsis.
- [x] 1.4 Put `panzoom-exclude` on that `<foreignObject>`. The rename field's
  carries it already. Verify a drag on the label moves the node.

## 2. Tests

- [x] 2.1 Rewrite `studio-canvas-node-label.test.tsx` against the `<div>`. It
  reads `<text class="nodeLabel">` and its `y` today. Four behaviors must
  still pass. Label over key, the locale switch, the key fallback, and one
  label element per node.
- [x] 2.2 Turn that file's no-second-line case around. The node body draws no
  `<text>` at all now, so assert on its absence. Verify the case fails against
  the pre-change markup.
- [x] 2.3 Add a case pinning the clamp. The outer `<div>` carries
  `aria-hidden="true"` and a `title` equal to the full label. Verify the case
  fails against the pre-change markup.
- [x] 2.4 Add a case for the fixed node size. A short-labelled node and a
  two-line one render `<rect>`s of equal `width` and `height`. The markup
  carries both, so the case runs without a browser.
- [x] 2.5 Add `### Canvas node label (canvas-node-label-clamp)` to
  `docs/browser-checks.md`, in the shape `:837` uses: what to open, then
  `Pass:` lines and a `Watch for the defect:` line. It covers the wrap, the
  ellipsis and the handle clearance, which are visual judgments
  (`development-toolchain/spec.md:840`).
- [x] 2.6 Run `studio-canvas-node-a11y.test.tsx`. Confirm the node's `role`,
  `tabindex` and `aria-label` cases pass with a `<foreignObject>` inside.

## 3. Verification

- [x] 3.1 Run `bun run typecheck`, then `bun run build`, then the full
  `bun test` with `DATABASE_URL` set. Report the skip count too.
- [x] 3.2 Open the canvas in a real browser. Confirm "Confirm Completion to
  Opteon" sits inside its node, over two lines. Confirm a longer label ends in
  an ellipsis. Confirm hover shows its full text. Chromium only: Playwright
  cannot download Firefox on this machine, so `docs/browser-checks.md` carries
  the second engine.
- [x] 3.3 Confirm a wrapped second line clears the connect handle, and that
  the handle still takes a drag-to-connect press.
- [x] 3.4 Exercise three gestures on a wrapped label: drag to move,
  double-click to rename, click to select. Verify each still works.
- [x] 3.5 Run `/impeccable critique` and `/impeccable audit` on the canvas
  route. Resolve what they report on the node.
- [x] 3.6 Run the two push gates over this change's own range:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
