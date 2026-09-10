## 1. The style

- [x] 1.1 Centre the node label box in `CanvasView.tsx`, per design.md. Verify
  `bun run typecheck` stays clean.
- [x] 1.2 Rewrite the comment above that entry, so it states the centring rule
  and drops the shared-baseline reasoning.
- [x] 1.3 Retarget the two source-reading cases in
  `packages/web/test/studio-canvas-node-label.test.tsx`, per design.md. Verify
  the full suite passes.

## 2. The documents

- [x] 2.1 Rewrite the two `canvas-node-label-clamp` passages in
  `docs/browser-checks.md` that state the shared-first-line rule.
- [x] 2.2 Lint every Markdown file this change touched with the antislop
  linter. Verify each file reports no rise.

## 3. Verification

- [x] 3.1 Run `bun run typecheck` and then `bun run build`, in the
  devcontainer. Verify both stay clean.
- [x] 3.2 Run the full `bun test` with `DATABASE_URL` set, in the
  devcontainer. Verify no named failure and no new skip.
- [x] 3.3 Run the whitespace and prose gates over the pushed range. Verify
  both pass with the range piped in.
- [x] 3.4 Read the canvas in a browser, per `docs/browser-checks.md`. Verify a
  one-line and a two-line label both sit centred.
- [x] 3.5 Run the design detector and a scoped critique over the canvas
  label, per the CLAUDE.md convention.
