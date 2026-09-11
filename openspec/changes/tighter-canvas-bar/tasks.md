## 1. The menu

- [ ] 1.1 In `studio-canvasBar.test.tsx`, pin the menu to two entries, `subprocess` and `end`. Watch it fail.
- [ ] 1.2 In `CanvasBar.tsx`, set `MENU_KINDS` to `subprocess` and `end`, and rewrite its comment.
- [ ] 1.3 Rewrite the `stepKindNote.*` comment in `studio.ts`: the bar reads two notes, and `participant` stays.

## 2. The Remove control

- [ ] 2.1 Pin the Remove label per selection size: none, "Remove step" for one, "Remove steps" for two.
- [ ] 2.2 Pin the order for one unconnected step: its report, then Remove step, and no count or group control.
- [ ] 2.3 Pin that two steps keep the count, then Remove steps, then the group control. Watch 2.1 and 2.2 fail.
- [ ] 2.4 Add the `canvas.selectionRemoveOne` key, "Remove step", to `packages/web/src/i18n/catalogs/studio.ts`.
- [ ] 2.5 Render the Remove control for one step or more. Keep the count and the group controls at two.

## 3. The bar's height

- [ ] 3.1 Drop `BAR_MIN_HEIGHT` and the bar's `minHeight`, and rewrite the comments that cite them.
- [ ] 3.2 Set the group name's label beside its input, 8px apart.
- [ ] 3.3 Give the group name's input 14px type at `line-height: normal`.
- [ ] 3.4 Rewrite the `groupNameField` and `groupNameLabelText` comments for the inline label.

## 4. Design files and docs

- [ ] 4.1 Add the toolbar field exception to `DESIGN.md`'s Inputs / Fields list.
- [ ] 4.2 Add the same exception to the Fields paragraph of `.claude/rules/design-language.md`.
- [ ] 4.3 Correct the canvas bar entry and the selection summary in `docs/current-state.md`.
- [ ] 4.4 In the Studio canvas bar walk, replace the 88px and the three menu entries with the new facts.
- [ ] 4.5 In the same walk, name the subprocess entry for the drag over a path.
- [ ] 4.6 Correct the multi-step Remove check and the destructive walk's canvas bar entry.
- [ ] 4.7 Add a walk for this change: heights, label position, menu entries and the single-step Remove.

## 5. Browser and design checks

- [ ] 5.1 Measure the bar with nothing, one step, three steps and a matching group selected.
- [ ] 5.2 Each state matches the nothing-selected height, 54px in Chromium on Windows. The canvas top stays put.
- [ ] 5.3 Open the menu. Confirm it shows a call to another process and an end.
- [ ] 5.4 Measure the group state's bar and content widths in 800px and 700px windows.
- [ ] 5.5 Rewrite the walk's narrow-window paragraph and the `~760px` comment in `CanvasBar.tsx` from those widths.
- [ ] 5.6 Press Remove step on one selected step, then on the initial step. Confirm the draft and the start marker.
- [ ] 5.7 Run the impeccable detector over `CanvasBar.tsx`.
- [ ] 5.8 Run `/impeccable critique` and `/impeccable audit` against the Canvas tab, and route every finding.
- [ ] 5.9 Name in the audit where focus lands after Remove step takes its own step away.
- [ ] 5.10 Record for the finish message that `tmp/Detent Design Language.dc.html` needs the same Fields exception.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer.
- [ ] 6.2 Run the full `bun test` with `DATABASE_URL` set, and pipe its log through `scripts/gates/silent-green.sh`.
- [ ] 6.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
- [ ] 6.4 Run the same `range.sh` pipe into `sh scripts/gates/whitespace.sh`.
- [ ] 6.5 Run `sh scripts/gates/machine-paths.sh` alone.
- [ ] 6.6 Run antislop's `check` subcommand on every Markdown file this change touches. No count rises.
- [ ] 6.7 Run `openspec validate tighter-canvas-bar --strict`.
