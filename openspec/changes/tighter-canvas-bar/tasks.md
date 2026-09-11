## 1. The menu

- [x] 1.1 In `studio-canvasBar.test.tsx`, pin the menu to two entries, `subprocess` and `end`. Watch it fail.
- [x] 1.2 In `CanvasBar.tsx`, set `MENU_KINDS` to `subprocess` and `end`, and rewrite its comment.
- [x] 1.3 Rewrite the `stepKindNote.*` comment in `studio.ts`: the bar reads two notes, and `participant` stays.

## 2. The Remove control

- [x] 2.1 Pin the Remove label per selection size: none, "Remove step" for one, "Remove steps" for two.
- [x] 2.2 Pin the order for one unconnected step: its report, then Remove step, and no count or group control.
- [x] 2.3 Pin that two steps keep the count, then Remove steps, then the group control. Watch 2.1 and 2.2 fail.
- [x] 2.4 Add the `canvas.selectionRemoveOne` key, "Remove step", to `packages/web/src/i18n/catalogs/studio.ts`.
- [x] 2.5 Render the Remove control for one step or more. Keep the count and the group controls at two.

## 3. The bar's height

- [x] 3.1 Drop `BAR_MIN_HEIGHT` and the bar's `minHeight`, and rewrite the comments that cite them.
- [x] 3.2 Set the group name's label beside its input, 8px apart.
- [x] 3.3 Give the group name's input 14px type at `line-height: normal`.
- [x] 3.4 Rewrite the `groupNameField` and `groupNameLabelText` comments for the inline label.

## 4. Design files and docs

- [x] 4.1 Add the toolbar field exception to `DESIGN.md`'s Inputs / Fields list.
- [x] 4.2 Add the same exception to the Fields paragraph of `.claude/rules/design-language.md`.
- [x] 4.3 Correct the canvas bar entry and the selection summary in `docs/current-state.md`.
- [x] 4.4 In the Studio canvas bar walk, replace the 88px and the three menu entries with the new facts.
- [x] 4.5 In the same walk, name the subprocess entry for the drag over a path.
- [x] 4.6 Correct the multi-step Remove check and the destructive walk's canvas bar entry.
- [x] 4.7 Add a walk for this change: heights, label position, menu entries and the single-step Remove.

## 5. Browser and design checks

- [x] 5.1 Measure the bar with nothing, one step, three steps and a matching group selected.
- [x] 5.2 Each state matches the nothing-selected height, 54px in Chromium on Windows. The canvas top stays put.
- [x] 5.3 Open the menu. Confirm it shows a call to another process and an end.
- [x] 5.4 Measure the group state's bar and content widths in 800px and 700px windows.
- [x] 5.5 Rewrite the walk's narrow-window paragraph and the `~760px` comment in `CanvasBar.tsx` from those widths.
- [x] 5.6 Press Remove step on one selected step, then on the initial step. Confirm the draft and the start marker.
- [x] 5.7 Run the impeccable detector over `CanvasBar.tsx`.
- [x] 5.8 Run `/impeccable critique` and `/impeccable audit` against the Canvas tab, and route every finding.
- [x] 5.9 Name in the audit where focus lands after Remove step takes its own step away.
- [x] 5.10 Record for the finish message that `tmp/Detent Design Language.dc.html` needs the same Fields exception.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer.
- [x] 6.2 Run the full `bun test` with `DATABASE_URL` set, and pipe its log through `scripts/gates/silent-green.sh`.
- [x] 6.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
- [x] 6.4 Run the same `range.sh` pipe into `sh scripts/gates/whitespace.sh`.
- [x] 6.5 Run `sh scripts/gates/machine-paths.sh` alone.
- [x] 6.6 Run antislop's `check` subcommand on every Markdown file this change touches. No count rises.
- [x] 6.7 Run `openspec validate tighter-canvas-bar --strict`.
