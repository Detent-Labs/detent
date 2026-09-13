## 1. Layout

- [x] 1.1 Rewrite the field matrix `describe` block in `packages/web/test/studio-guidedSurfaceStyle.test.ts`.
  Keep `styleBlock` after `stripComments`. The `matrix` block matches
  `/flexGrow: 1/` and `/minHeight: 0/`. A `matrixScrollSpace` block in
  `FieldMatrixGrid.tsx` matches `/display: "flex"/`, `/flexDirection: "column"/`,
  `/flex: "1 1 0"/` and `/minHeight: "24rem"/`. The `matrixScroll` block
  matches `/overflow: "auto"/` and `/outlineOffset: "-2px"/`, and matches
  neither `/minHeight/` nor `/maxHeight/`. Verify: the changed tests fail by
  name in the full suite.
- [x] 1.2 Give the `matrix` style in `FieldMatrixPanel.tsx` a `flexGrow: 1`
  beside its `minHeight: 0`. Its comment states why the column grows. Verify:
  `bun run typecheck` passes.
- [x] 1.3 In `FieldMatrixGrid.tsx`, add the `matrixScrollSpace` style from
  design.md and wrap the scroll region in a plain `div` carrying it. The empty
  state keeps returning the status line alone. Drop `minHeight` from
  `matrixScroll`, and state each comment as a fact. Verify: the block from 1.1
  passes. `git grep -n 'minHeight: "24rem"' -- packages/web/src` prints exactly
  one line, in `FieldMatrixGrid.tsx`.

## 2. Documentation

- [x] 2.1 Rewrite the floor sentence in `docs/current-state.md`, near line 4529.
  It names the space that holds the 24rem floor and the frame that follows its
  rows. Verify: the antislop count on that file does not rise.
- [x] 2.2 In `docs/browser-checks.md`, entry "The field matrix's height
  (`field-matrix-fill-height`)", add a step for `laptop_inventory` at
  1440x900. Pass: the frame ends under the last row, with no empty band inside
  it. Keep the other steps. Verify: the antislop count on that file does not
  rise.

## 3. Browser check

After group 1, run `bun run --filter './packages/web' build` in the
devcontainer. Open `http://127.0.0.1:<PORT_APP>`,
with the port from sourcing `scripts/worktree-env.sh`. If the server answers
JSON 404, re-run `bash scripts/dev-up.sh`.

Open the browser headed, `--browser=chrome --headed`, so scrollbars take their
real 15px. Pass `-s=field-matrix-short` on every `playwright-cli` call. Read
heights with `run-code` and `page.evaluate`, since the worktree guard refuses
`eval`. Print a known value first as a positive control. Open each draft from
its process list row. Discard it there afterwards, and accept the confirm.

- [x] 3.1 Open `laptop_inventory`'s Field matrix tab at 1440x900. Pass: the
  frame's bottom sits within its 1px border of the table's bottom. The tab
  body's `scrollHeight` equals its `clientHeight`.
- [x] 3.2 Resize that tab to 1440x600 and scroll the tab body to its end. Move
  the pointer over the blank space under the frame and wheel up. Pass: the tab
  body's `scrollTop` falls.
- [x] 3.3 Open `it_offboarding`'s Field matrix tab at 1440x900. Pass: the
  grid's bottom edge equals the tab body's, and the tab body does not scroll.
  Record the toolbar's height.
- [x] 3.4 Resize to 1440x1200. Pass: the grid grows by the added height.
- [x] 3.5 Resize to 1440x600, then to 1280x600. Pass at both: the grid
  measures 384px and the tab body scrolls. The header row and two field rows
  fit in the grid's `clientHeight`. The toolbar measures the height 3.3
  recorded.
- [x] 3.6 Open `access_request`'s Field matrix tab at 1440x1200. Pass: the
  frame ends under the last row, and the grid's `scrollHeight` equals its
  `clientHeight`.
- [x] 3.7 On `it_offboarding` at 1440x900, move focus to the grid's scroll
  region with the keyboard. Pass: all four edges of its focus ring show.
- [x] 3.8 Run `/impeccable critique` and `/impeccable audit` against the Field
  matrix route. Run the impeccable detector once over both changed files.
  Resolve each finding this change causes.
- [x] 3.9 After 3.2 passes, rewrite MATRIX-1's bullet on its two unmeasured
  points in `docs/decisions.md`. A grid shorter than the floor leaves blank tab
  body under its frame. A wheel there scrolls the tab body. A grid of 24rem or
  more still traps the wheel. Cite 3.2's measured `scrollTop` values.
  Verify: the antislop count on that file does not rise.

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
