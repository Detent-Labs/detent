## 1. EditRail.tsx conversion

- [x] 1.1 Add a `stylex.create()` style object to `EditRail.tsx` covering all
  10 of its own rule blocks (`.studio-rail`, `.studio-rail-section`, the
  `+`-combinator divider rule as a plain style on the second-and-later
  section, `.studio-rail-section h2`, `.studio-rail-row`,
  `.studio-rail-count`, `.studio-palette-list`, `.studio-palette-entry`
  incl. its `:hover`, `.studio-palette-ghost`), reading
  `form-ui/tokens.stylex`. Verify `bun run typecheck` passes with no new
  errors in this file. Done: `bun run typecheck` exits 0.
- [x] 1.2 Replace every literal `studio-*` `className` in `EditRail.tsx`
  with `stylex.props(...)`. Verify by rendering the file's existing test
  coverage (`studio-draftToolbarState.test.ts` and any other test importing
  `EditRail`) and confirming it still passes. Done: no test file directly
  imports `EditRail` (grepped); `studio-draftToolbarState.test.ts` (18
  tests) passes unchanged.
- [x] 1.3 Delete the 10 now-migrated rule blocks from `app.css`. Verify with
  `grep -oP '^[^{]+(?=\{)' app.css | sed 's/[[:space:]]*$//' | sort -u | wc -l`
  reading 48 (58 minus the 10 EditRail blocks). Done: reads 48. Committed
  as `7edd8f8`.

## 2. CanvasView.tsx selector and ref fixes (no CSS touched yet)

- [x] 2.1 Add a `data-kind="edge"` attribute to the edge-group `<g>`
  (alongside its existing `data-path-id`/`data-step-id`), and rewrite
  `elementFor()`'s path selector from
  `` `.canvas-edge-group[data-path-id="${f.pathId}"]` `` to
  `` `[data-kind="edge"][data-path-id="${f.pathId}"]` ``. Rewrite
  `elementFor()`'s group selector from
  `` `.canvas-group-disclosure[data-group-id="${f.groupId}"]` `` to
  `` `[data-group-id="${f.groupId}"]` `` (already unique, per design.md D1).
  Leave the step selector (`.canvas-node[data-step-id="${f.stepId}"]`)
  unchanged. Verify `bun run typecheck` passes. Done.
- [x] 2.2 Replace the `.canvas-toolbar` `.closest()` check in the `onWheel`
  handler with `toolbarRef.current?.contains(e.target as Node)` (design.md
  D2). Verify `bun run typecheck` passes. Done.
- [x] 2.3 Verify these two fixes preserve behavior with no visual change:
  run the existing `studio-canvas-node-a11y.test.tsx`,
  `studio-canvas-node-label.test.tsx`, and `studio-inlineRename.test.ts`
  suites and confirm every test still passes (`app.css` is still present and
  unconverted at this point, so no test should need updating yet). Done: 27
  pass, 0 fail across the three files.

## 3. CanvasView.tsx and EditScreen.tsx CSS conversion

- [x] 3.1 Add a `stylex.create()` style object to `CanvasView.tsx` covering
  every one of its 45 rule blocks except the two that stay driven by JS
  booleans with no compiled counterpart of their own beyond the base style
  (`.canvas-edge-group-selected`/`.canvas-edge-insert-target` combinators,
  and `.canvas-group-collapsed` combinators — see 3.3), reading
  `form-ui/tokens.stylex`. Include the two `stylex.when.ancestor(":focus-visible")`
  entries for `canvas-node-focus-ring`'s and `canvas-edge-focus-halo`'s
  `display` property, each merged with its selector's second, duplicate
  `app.css` declaration into one entry (design.md D3, case 1). Verify
  `bun run typecheck` passes. Done.
- [x] 3.2 Replace every literal `canvas-*` `className` in `CanvasView.tsx`
  with `stylex.props(...)`, keeping `canvas-node` and `panzoom-exclude`
  literal and composed alongside the compiled className on every element
  that carries them today (the node `<g>`, the edge-group `<g>`, the
  waypoint handle, the rename `<foreignObject>`, the disclosure host, the
  group `<g>`). Compute `stylex.props()` into a variable first wherever a
  literal class composes conditionally, per the established composition
  pattern. Verify `bun run typecheck` passes. Done. (Terminal stamp/initial
  stamp `<g>` wrappers additionally lost their now-empty `className`
  entirely — their own CSS was always on the `circle`/`text` children.)
- [x] 3.3 Convert the edge's selected/insert-target stroke variant and the
  group box's collapsed variant to a direct JS-computed style pick off
  the already-in-scope `isSelected`/`isInsertTarget`/`group.collapsed`
  booleans (design.md D3, cases 2-3) — no ancestor selector, no new
  `data-*` attribute. Convert the toolbar's edge-style-toggle button's
  `aria-pressed`-driven border/color/box-shadow to a direct pick off
  `edgeStyle === "smoothstep"` (design.md D3, case 4), composed alongside
  its literal `.btn.btn-secondary` classes. Verify `bun run typecheck`
  passes. Done.
- [x] 3.4 In `EditScreen.tsx`, add `cursor: "grab"` to the existing
  `canvasGroupNameField` `stylex.create()` entry, and change the
  group-rename `<label>`'s `className` from
  `` `canvas-group-name ${stylex.props(styles.canvasGroupNameField).className}` ``
  to `stylex.props(styles.canvasGroupNameField).className` alone (design.md
  D5). Convert `CanvasView.tsx`'s own `.canvas-group-name`/
  `.canvas-group-collapsed .canvas-group-name` rule blocks (cursor,
  font-family, font-size, fill, plus the collapsed-state variant) to their
  own compiled style, following the same `group.collapsed`-driven pick as
  3.3. Verify `bun run typecheck` passes and re-run
  `packages/web/test/studio-canvas-node-a11y.test.tsx`'s group-collapse
  scenarios (they render both files) with no failure. Done: 12 pass.
- [x] 3.5 Delete the 45 now-migrated `CanvasView.tsx` rule blocks from
  `app.css`, including `.canvas-group-name`'s two blocks and
  `.canvas-group-collapsed .canvas-group-name` (fully migrated per 3.4),
  leaving only the `prefers-reduced-motion` media block and
  `.studio-dialog::backdrop`. Verify with
  `grep -oP '^[^{]+(?=\{)' app.css | sed 's/[[:space:]]*$//' | sort -u`
  showing exactly the surviving 3 lines (the media query, its nested `* {}`,
  and `.studio-dialog::backdrop`). Done: reads exactly those 3 lines.
  `bun run build` also passes (real `@stylexjs/unplugin` compile,
  isolated-probed beforehand for every SVG-specific property this group
  introduced — `fill`/`stroke`/`strokeWidth`/`strokeDasharray`/
  `strokeLinecap`/`strokeLinejoin`/`textAnchor`/`pointerEvents`/
  `textTransform`/`when.ancestor(":focus-visible")` — all confirmed
  compiling to correct, correctly-scoped CSS).

## 4. Test updates

- [x] 4.1 Delete `studio-canvas-fit.test.ts`'s
  `describe("canvas fit: the clipping surface", ...)` block (the one that
  reads `app.css` via `readFileSync`). Verify the file's remaining
  `describe("canvas fit: an empty canvas", ...)` block (pure `computeFit()`
  coverage) still runs and passes. Done: 15 pass, 0 fail.
- [x] 4.2 Delete the one `it(...)` block in `studio-canvas-node-a11y.test.tsx`
  that reads `.canvas-group-disclosure {`'s CSS text. Verify every other
  `it`/`describe` block in that file still runs and passes. Done.
- [x] 4.3 Update every remaining literal `canvas-*` class-name assertion in
  `studio-canvas-node-a11y.test.tsx` (`canvas-edge-group` -> `edgeGroup`,
  `canvas-group-disclosure` -> `groupDisclosure`,
  `canvas-edge-guard-label` -> `edgeGuardLabel`, `canvas-group` -> `group`,
  `canvas-svg` -> `svg`) to the class name `test/preload-stylex.ts`'s stub
  derives for the corresponding `stylex.create()` key; leave the
  `canvas-node` assertion unchanged (it stays literal). Verify the full
  file passes. Done: 12 pass, 0 fail.
- [x] 4.4 Check `studio-canvas-node-label.test.tsx` for any literal
  `canvas-node-label`/`canvas-node-key` class-name assertions beyond its
  existing `data-step-id`-based structural split, and update any found the
  same way. Verify the file passes. Done: two regexes updated to
  `nodeLabel`/`nodeKey`; 5 pass, 0 fail.
- [x] 4.5 Add a "Studio canvas (`stylex-phase-4-canvas`)" section to
  `docs/browser-checks.md` covering what the two deleted CSS-text tests
  used to assert (the clipping surface's `overflow: visible` /
  `.canvas-group-disclosure`'s declared size), as a manual probe. Verify the
  antislop and whitespace gates pass on this file
  (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and
  `.../whitespace.sh`, run over the committed range once this task's commit
  lands). Done: both gates pass with no rising finding count.

## 5. Docs and roadmap

- [ ] 5.1 Update `docs/decisions.md`'s StyleX entry to note phase 4 (canvas)
  is done. Verify the antislop and whitespace gates pass on this file.
- [ ] 5.2 Update `ROADMAP.md` stage 45 to read "PHASES 0-4 DONE. PHASE 5 NOT
  BUILT." Verify the antislop and whitespace gates pass on this file.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` and confirm zero errors.
- [ ] 6.2 Run `bun run build` and confirm it succeeds, including the
  `@stylexjs/unplugin` compile step for both converted files.
- [ ] 6.3 Run the full `bun test` suite with `DATABASE_URL` set, piped
  through `scripts/gates/silent-green.sh`, and confirm 0 failures and the
  skip count at the existing floor.
- [ ] 6.4 Run the antislop and whitespace gates over every Markdown file
  this change touched (`docs/browser-checks.md`, `docs/decisions.md`,
  `ROADMAP.md`, and this change's own `proposal.md`/`design.md`/`tasks.md`/
  delta spec): `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
  and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
  Confirm both pass with no rising finding count.
- [ ] 6.5 Serve the production build from `WEB_ROOT` (dev mode has a known
  pre-existing `process is not defined` crash in Studio) and, via
  `playwright-cli`, walk the canvas's keyboard model in Chromium: tab into
  the canvas, arrow through at least one node and one path, confirm the
  focus ring/halo appears exactly as before. Repeat the same walk in
  Firefox. Verify both browsers show the same focus/selection visuals the
  deleted stylesheet declared.
- [ ] 6.6 Via `playwright-cli` against the same production build, run a drag
  probe: start a pointer drag on a step node and confirm the canvas does not
  pan (Panzoom's exclude-class still holds), then start a drag on empty
  canvas space and confirm it does pan. Verify both outcomes.
