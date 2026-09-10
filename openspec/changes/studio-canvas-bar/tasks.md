## 1. Worktree setup

- [ ] 1.1 Run `/impeccable hooks on` in this worktree. The detector hook lives
  in an ignored settings file, so a fresh checkout has none.

## 2. Reachability

- [ ] 2.1 Export `reachableStepIds(steps, initialStep)` from
  `draft/registerOrder.ts`. Have `registerOrder` call it, per design D7.
- [ ] 2.2 Extend `studio-registerOrder.test.ts`. Assert an unreached terminal
  step stays out of the returned set.

## 3. Placement on a press

- [ ] 3.1 Add a pure function that finds a free lattice point. Give it the
  wanted point and the placed positions.
- [ ] 3.2 Cover that function in `packages/web/test`. Verify a point already
  taken walks right to the next free one.

## 4. The bar component

- [ ] 4.1 Add the file `canvas/CanvasBar.tsx`. Style it with StyleX from the
  tokens alone. Verify the design detector reports nothing.
- [ ] 4.2 Give the bar one flex row at a fixed height. Verify the height holds
  with a group-name input inside it.
- [ ] 4.3 Add the Add step button and its caret trigger. Render both as
  `btn btn-secondary`, per design D5.
- [ ] 4.4 Add the popover menu holding the other two kinds. Follow
  `Chrome.tsx`'s pattern, per design D4.
- [ ] 4.5 Move `CanvasPalette`'s pointer-capture drag onto all three controls.
  Hide the popover on release, per design D3.
- [ ] 4.6 Render the selection count, the delete control and the group
  controls. Copy them from `EditScreen`'s `canvasSelection` aside.
- [ ] 4.7 Render the reachability report for one selected step. Read it from
  `reachableStepIds`.

## 5. Wiring the screen

- [ ] 5.1 Mount `CanvasBar` above the canvas body in `EditScreen`. Verify the
  bar stands under the tab row.
- [ ] 5.2 Wire the press. Read the canvas body's centre, then convert, snap
  and place, per design D2.
- [ ] 5.3 Delete the `canvasSelection` aside, the `canvasInspector` style and
  the `canvasSelection` style. Verify nothing stands below the canvas.
- [ ] 5.4 Delete `canvas/CanvasPalette.tsx` and its import. Verify the canvas
  now fills the body's full width.

## 6. Strings

- [ ] 6.1 Add `newStepNote(kind)` to `draft/guided-labels.ts`, beside
  `newStepPhrase`. Follow `assignmentStrategyLabel`'s name and note pair.
- [ ] 6.2 Add the bar's keys to the English studio catalog. Cover the button,
  the caret, the two menu entries and their notes.
- [ ] 6.3 Add the key naming an unconnected step. Add the German entries for
  every new key.
- [ ] 6.4 Drop the palette's own heading key. Verify
  `i18n-catalog-parity.test.ts` passes.

## 7. Tests

- [ ] 7.1 Add a render test for the bar. Assert the four selection states each
  render at one height.
- [ ] 7.2 Assert the menu opens, and that Escape closes it and returns focus
  to the button.
- [ ] 7.3 Assert the reachability report stands for one selected step alone.
  Cover the unreached case and the reached one.
- [ ] 7.4 Extend `studio-guidedLabels.test.ts`. Assert a note comes back for
  each of the three kinds.

## 8. Docs and rules

- [ ] 8.1 Replace the palette row in `.claude/rules/ui-glossary.md` with a
  canvas bar row. Say that palette still names the form editor's field list.
- [ ] 8.2 Update `docs/current-state.md` at lines 1184, 1808, 1946, 1947 and
  1959. Confirm each symbol first, per that file's own rule.
- [ ] 8.3 Update `docs/browser-checks.md` at lines 183 and 281. Add the bar's
  own checks, including the drag out of an open menu.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck`, then `bun run build`, then the full
  `bun test` with `DATABASE_URL` set. Report what each printed.
- [ ] 9.2 Run the prose gate and the whitespace gate over the pushed range.
  Pipe the range into each script.
- [ ] 9.3 Check the Canvas tab in a real browser. Add a step by press, add one
  by drag, and drop one on a path.
- [ ] 9.4 Check the bar at narrow width, per the design's first open question.
  Record the answer in `docs/browser-checks.md`.
- [ ] 9.5 Run `/impeccable critique` and `/impeccable audit` against the Canvas
  tab. Fix what either reports.
