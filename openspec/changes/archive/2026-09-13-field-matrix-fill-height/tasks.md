## 1. Layout

- [x] 1.1 Add a `describe` block to `packages/web/test/studio-guidedSurfaceStyle.test.ts`.
  It reuses the file's `styleBlock` and `stripComments` helpers. The `matrix`
  block in `FieldMatrixPanel.tsx` matches `/minHeight: 0/`. The `matrixScroll`
  block in `FieldMatrixGrid.tsx` matches `/minHeight: "24rem"/` and does not
  match `/maxHeight/`. Verify: the new block fails by name in the full suite.
- [x] 1.2 Give the `matrix` style in `FieldMatrixPanel.tsx` a `minHeight: 0`.
  Verify: `bun run typecheck` passes.
- [x] 1.3 In `FieldMatrixGrid.tsx`, swap the `matrixScroll` style's
  `maxHeight: "32rem"` for `minHeight: "24rem"`. Add a short comment on both
  styles naming the rule, per design.md. Verify: `git grep -n 32rem --
  packages/web/src` prints nothing, and the block from 1.1 passes.

## 2. Documentation

- [x] 2.1 Rewrite the 32rem sentence in `docs/current-state.md`, near line 4530.
  It now names the 24rem floor and the fill. Verify: the antislop count on
  that file does not rise.
- [x] 2.2 Add a `docs/browser-checks.md` entry headed "The field matrix's height
  (`field-matrix-fill-height`)". It carries the five scenarios of the delta
  spec as pass lines. Verify: the antislop count on that file does not rise.

## 3. Browser check

Build the bundle in the devcontainer after group 1:
`bun run --filter './packages/web' build`. The engine serves no page without
it. Open `http://127.0.0.1:<PORT_APP>`, with the port from sourcing
`scripts/worktree-env.sh`.

Pass `-s=field-matrix-height` on every `playwright-cli` call. Read heights with
`run-code` and `page.evaluate`, since `eval` is refused in a worktree. Print a
known value first as a positive control. Read `getBoundingClientRect`,
`scrollHeight` and `clientHeight` that way. Open a draft of each named example.

- [x] 3.1 Open `it_offboarding`'s Field matrix tab at 1440x900. Pass: the
  grid's bottom edge equals the tab body's. The tab body's `scrollHeight`
  equals its `clientHeight`. Record the toolbar's height.
- [x] 3.2 On the same grid, scroll down and sideways. Pass: the step header
  row and the field header column hold their place. The toolbar stays above.
- [x] 3.3 Resize that window to 1440x1200. Pass: the grid grows by the added
  height and shows more rows.
- [x] 3.4 Open `access_request`'s Field matrix tab at 1440x1200. First confirm
  its grid fits between 384px and the height under the toolbar. Pass: the
  frame ends under the last row. The grid's `scrollHeight` equals its
  `clientHeight`.
- [x] 3.5 Open `it_offboarding` again at 1440x600. Pass: the grid measures
  384px tall and the tab body scrolls. The header row and two field rows show
  inside the grid. The toolbar measures the height 3.1 recorded. A failure
  stops the task and returns to the author.
- [x] 3.6 Run `/impeccable critique` and `/impeccable audit` against the Field
  matrix route. Run the impeccable detector once over both changed files.
  Resolve each finding this change causes.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer.
  Verify: both exit 0.
- [x] 4.2 Run the full `bun test` with `DATABASE_URL` set, in the devcontainer.
  Pipe its output through `scripts/gates/silent-green.sh`. Verify: no named
  failure, and the gate passes.
- [x] 4.3 Run both gates on the host, never in the devcontainer, which carries
  no antislop. Pipe `sh scripts/gates/range.sh < /dev/null` into
  `sh scripts/gates/prose.sh`, then into `sh scripts/gates/whitespace.sh`.
  Verify: neither prints a SKIPPED line, and both exit 0.
