## 1. Canvas bar

- [ ] 1.1 In `CanvasBar.tsx`, set `MENU_KINDS` to `subprocess` and `end`. Rewrite its comment to match design.md.
- [ ] 1.2 Render the Remove control for a selection of one step or more. Keep the count and the group controls at more than one.
- [ ] 1.3 Give one selected step the `canvas.selectionRemoveOne` label, "Remove step", added to `packages/web/src/i18n/catalogs/studio.ts`.
- [ ] 1.4 Drop `BAR_MIN_HEIGHT` and the bar's `minHeight`, and rewrite the comments that cite them.
- [ ] 1.5 Set the group name's label beside its input, 8px apart, and give the input 14px type at a 1.5 line height.

## 2. Tests

- [ ] 2.1 In `studio-canvasBar.test.tsx`, pin the menu to two entries, `subprocess` and `end`. Watch it fail before 1.1.
- [ ] 2.2 Pin the Remove label per selection size: none for nothing selected, "Remove step" for one, "Remove steps" for two.
- [ ] 2.3 Pin that one selected step renders no count and no group control.

## 3. Design files and docs

- [ ] 3.1 Add the toolbar field exception to `DESIGN.md`'s Inputs / Fields list.
- [ ] 3.2 Add the same exception to the Fields paragraph of `.claude/rules/design-language.md`.
- [ ] 3.3 Correct the canvas bar entry and the selection summary in `docs/current-state.md`.
- [ ] 3.4 In `docs/browser-checks.md`, correct the canvas bar walk, the multi-step Remove check and the destructive walk's canvas bar entry.
- [ ] 3.5 Add a `docs/browser-checks.md` walk for this change: heights, label position, menu entries and the single-step Remove.

## 4. Browser and design checks

- [ ] 4.1 Measure the bar in a real browser with nothing, one step, three steps and a matching group selected. Each reads 56px.
- [ ] 4.2 Confirm the canvas top stays put across those four states, and the menu shows two entries.
- [ ] 4.3 Press Remove step on one selected step, then on the initial step. Confirm the draft and the start marker.
- [ ] 4.4 Run the impeccable detector over `CanvasBar.tsx`.
- [ ] 4.5 Run `/impeccable critique` and `/impeccable audit` against the Canvas tab, and route every finding.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer.
- [ ] 5.2 Run the full `bun test` with `DATABASE_URL` set, and pipe its log through `scripts/gates/silent-green.sh`.
- [ ] 5.3 Run `scripts/gates/range.sh`, then `prose.sh`, `whitespace.sh` and `machine-paths.sh` on its output.
- [ ] 5.4 Run antislop on every Markdown file this change touches. No count rises.
- [ ] 5.5 Run `openspec validate tighter-canvas-bar --strict`.
