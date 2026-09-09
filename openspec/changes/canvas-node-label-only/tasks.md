## 1. The node

- [ ] 1.1 In `CanvasView.tsx`, delete the key `<text>` element and the comment
  above it, then confirm `grep -n "nodeKey" packages/web/src/areas/studio/canvas/CanvasView.tsx`
  returns only the style entry
- [ ] 1.2 Delete the `nodeKey` style entry, then confirm the same grep returns
  nothing
- [ ] 1.3 Move the label `<text>` baseline from `y={24}` to `y={34}`, and the
  rename `<foreignObject>` from `y={14}` to `y={19}`, per design.md
- [ ] 1.4 Drop "the key" from the subprocess rule's comment. It lists what the
  doubled rect sits before. Confirm the comment names only what the node still
  draws

## 2. The test

- [ ] 2.1 Rewrite `packages/web/test/studio-canvas-node-label.test.tsx` against
  the one-line node: drop the `key` field from `NodeLines`, and assert that no
  `nodeKey` element renders for a step carrying both a label and a key
- [ ] 2.2 Keep the locale-switch case and the empty-label fallback case, and
  confirm `bun test packages/web/test/studio-canvas-node-label.test.tsx` passes

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, `bun run build` and the full `bun test` with
  `DATABASE_URL` set, and report what each printed
- [ ] 3.2 Open a draft's canvas in a real browser, against the production
  build. Confirm a step node draws one centred line. Confirm a double-click
  opens the rename field over that line, with no jump
- [ ] 3.3 Run `/impeccable critique /studio/drafts/<id>/canvas` and
  `/impeccable audit` on the same route, per the Conventions rule
- [ ] 3.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
  and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`,
  and confirm both pass over the pushed range
