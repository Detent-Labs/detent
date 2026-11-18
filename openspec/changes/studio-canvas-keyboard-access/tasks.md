# Tasks

## 1. The frame clips without scrolling

- [x] 1.1 Install the impeccable skill and its detector hook in this worktree, as `CLAUDE.md` asks. Pass: `impeccable hook < /dev/null` exits 0 here.
- [x] 1.2 Set `overflow: "clip"` on the compiled `wrap` style and in the `Panzoom(el, {...})` options, per D1. Rewrite the `measureFit` comment that names `overflow: hidden`. Pass: a source-text test in `packages/web/test/studio-canvas-fit.test.ts` reads `overflow: "clip"` in both places.
- [x] 1.3 Pass `{ preventScroll: true }` to every `focus()` call under `canvas/`, per D1. That covers `CanvasView.tsx` and the new `WayOutMenu.tsx`. Pass: `git grep -n '\.focus()' -- packages/web/src/areas/studio/canvas/` prints nothing.

## 2. Reveal on focus

- [x] 2.1 Add `revealPan` and the pure `fitInsets(toolbarBottom)` to `canvas/fit.ts`, per D2. Make `measureFit` read its insets through `fitInsets`. Pass: `packages/web/test/studio-canvas-fit.test.ts` covers a box past each edge and a box under the toolbar inset. It also covers a box in view and a box larger than the room. Each case also runs at a scale other than 1. A case pins the insets `fitInsets` returns.
- [x] 2.2 Export `lastInputWasPointer()` from `focusScroll.ts`, per D2. Reveal from the `<svg>`'s `onFocus` only when it returns false, and skip a root focus. Add no `scrollIntoView` call. Pass: `packages/web/test/studio-focusScroll.test.ts` shows the reader true after `noteInputModality("pointer")` and false after `noteInputModality("keyboard")`. The first smoke flow in 6.1 finds the focused step's box inside the frame after Down. The 6.2 walk covers a Tab entry and a click.

## 3. Zoom keys and the live region

- [x] 3.1 Add `zoomAbout` and `ZOOM_KEY_FACTOR` to `canvas/fit.ts`, per D3. Pass: `packages/web/test/studio-canvas-fit.test.ts` shows the anchor's screen point unchanged after a zoom. It also covers a clamp at each bound and a centre anchor that leaves the pan as it was.
- [x] 3.2 Answer `+`, `=`, `-` and `0` in `onCanvasKeyDown`, per D3. Return early on Ctrl, Meta or Alt, and call `preventDefault` on each key the canvas answers. Pass: the fourth smoke flow in 6.1 reads the zoom level after `+`. The 6.2 walk reads it after `-`, `0` and Ctrl with `+`.
- [x] 3.3 Add the live region and its `announce` helper inside `.canvas-wrap`, per D4. Add the four `canvas.*` keys for the zoom, the menu and the add to `i18n/catalogs/studio.ts`. Pass: a test in `packages/web/test/studio-canvas-node-a11y.test.tsx` finds an empty polite `role="status"` in the first markup.
- [x] 3.4 Announce the zoom level after each zoom key, through `canvas.zoomAnnounce`. Pass: the fourth smoke flow in 6.1 reads "Map at 125 percent" in `role=status` after `+` at 100 percent.

## 4. Enter lands on the step page

- [x] 4.1 Add `wayOutNameId(pathId)` to `draft/process-tabs.ts`, per D5. Put it on the Name input of each Ways out row in `panels/PathsPanel.tsx`. Pass: `packages/web/test/studio-processTabs.test.ts` pins the id. A `PathsPanel` markup test finds it on the row's Name input.
- [x] 4.2 Make `EditScreen`'s `onOpenStepPage` set `pendingFocus`, plus `sectionRequest` for a path, per D5. Keep the `waysOutRequest` bump. Pass: the second smoke flow in 6.1 finds the Name input focused after Enter on a step. It finds the same after a double-click. Enter on a way out focuses that row's Name input.

## 5. The way-out menu

- [x] 5.1 Add `checkConnectSource` to `canvas/dropGesture.ts`, and call it first in `resolveDropGesture`, per D7. The `rejected` result becomes `{ kind: "rejected", refusal, reason }`. Pass: `packages/web/test/studio-canvas-dropGesture.test.ts` covers a terminal source, an inconsistent source and an accepted one. The two `toEqual` cases at lines 28-33 and 46-48 move to the new shape. Every other case stays unchanged and green.
- [x] 5.2 Export `literalSentenceFor(body, step, message, key?)` from `draft/checkSentence.ts`, per D7. It builds the site with `readSite` from the step's id, an empty `loc` and the message, then runs `literalRuleFor` and `settle`. Add `refusalSentence` to `canvas/connection.ts` and the keys `canvas.connectRefused` and `canvas.connectNeedsOrder`. Show its sentence for every drop and key refusal. Pass: tests in `packages/web/test/studio-canvas-connection.test.ts` cover the cases below.
  - An end reads "An end has no way out.".
  - A step with one numbered automatic way out reads the `canvas.connectNeedsOrder` sentence, with "Ways out" in `{section}`.
  - Each of the four other trigger reasons reads the checks rail's sentence for the same step.
  - An unnamed step reads "Step {number}" in `{step}`, as the checks rail does.
  - An unknown reason reads `canvas.connectRefused`.
  - `refusalSentence` never returns any of the five `checkPathTriggerConsistency` strings, nor "a terminal step has no outgoing paths".
- [x] 5.3 Add `canvas/wayOutMenuLogic.ts` with `wayOutMenuItems`, `typeAheadIndex` and `menuKeyTarget`, per D6. Pass: a new `packages/web/test/studio-canvas-wayOutMenu.test.ts` covers draft order, the source in the list and a hidden step left out. It covers a step with no id, the separator and the new-step item. The type-ahead cases cover wrap, case and a skipped separator. The key-step cases cover Down and Up wrapping at each end, Home, End, a skipped separator and an unknown key.
- [x] 5.4 Move the drop's two add branches into one `addWayOut` in `CanvasView.tsx`, per D7. Pass: `git grep -n 'newPath(' -- packages/web/src/areas/studio/canvas/CanvasView.tsx` prints the calls inside `addWayOut` alone. The drop browser check in 6.2 still adds both kinds of way out.
- [x] 5.5 Build `canvas/WayOutMenu.tsx`: the popover, the heading, the items, the separator and the keyboard model, per D6. Its `onKeyDown` calls `menuKeyTarget`, and each item adds through its `onClick`. Place the menu right after `showPopover()` returns. Its styles follow the shape brief in D8. Pass: a markup test reads the heading outside `role="menu"`, the items as `menuitem` and the separator. The fourth smoke flow in 6.1 finds the step focused after Escape in the menu.
- [x] 5.6 Open the menu on `C` from a step focus, or show and announce the refusal, per D6 and D7. Compare `e.key.toLowerCase()` and call `preventDefault`. Make `showRejection` measure against `.canvas-wrap`. Add `aria-keyshortcuts="C"` to each step node.
  - Pass: `packages/web/test/studio-canvas-node-a11y.test.tsx` reads the attribute on a step.
  - Pass: the third smoke flow in 6.1 opens the menu with a lowercase `c`.
  - Pass: the 6.2 walk reads a refusal on an end at a fit scale other than 1. The refusal's box overlaps the node's top edge.
- [x] 5.7 Enter on an item calls `addWayOut` with its target. For "A new step" the target sits one column right of the source, per D7. A step already there moves it right to the first free lattice point. Focus the new path, then announce `canvas.wayOutAdded`. Pass: the third smoke flow in 6.1 adds a way out from the keyboard and finds the new path focused.

## 6. Docs and browser checks

- [x] 6.1 Add `e2e/canvas-keyboard.e2e.ts` with five flows, per `development-toolchain`'s split rule. Pass: `bun run e2e` runs all five green.
  - The first keeps the frame's scroll offsets at 0 at 200 percent zoom. It finds the focused step inside the frame after Down.
  - The second lands Enter on a step, Enter on a way out and a double-click on a step. Each lands on its Name input.
  - The third presses a lowercase `c`, then Enter, and finds the new way out focused.
  - The fourth reads "Map at 125 percent" in `role=status` after `+` at 100 percent. It finds the step focused after Escape in the menu.
  - The fifth adds "A new step" with End and Enter. It finds the new way out focused and the new step inside the frame.
- [x] 6.2 Extend the entry "Keyboard access to the canvas" in `docs/browser-checks.md` with what the smoke flows cannot see. Cover reveal on a Tab entry and a click. Cover the zoom keys past `+`, the menu, a short-window Tab entry and a refusal at a fit scale other than 1. Rewrite the Pass of "Focus a step and press Enter" to the Name input landing. Remove each step the smoke flows now cover. Pass: the prose gate reports no rise on the file.
- [x] 6.3 Add the zoom keys and the way-out menu to the Map passage of `docs/authoring-guide.md`, beside the drag sentence. Pass: `git grep -n 'Way out to' -- docs/authoring-guide.md` prints a line.
- [x] 6.4 Update the CANVAS-1 entry in `docs/decisions.md`, which names the frame's `overflow: hidden`. Add to the entry on a canvas removal that the canvas now holds a live region a removal can reuse. Pass: the CANVAS-1 entry names `overflow: clip`, and the prose gate reports no rise on the file.
- [x] 6.5 Add a row for the way-out menu to the Map tab table in `.claude/rules/ui-glossary.md`. The row names the popover `C` opens on a focused step. That popover lists the steps, then "A new step". It lives in `canvas/WayOutMenu.tsx`. Pass: `git grep -n 'way-out menu |' -- .claude/rules/ui-glossary.md` prints the row.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` and report the last lines. Pass: exit 0.
- [ ] 7.2 Run `bun run build` and report the last lines. Pass: exit 0.
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set, in the foreground, through the gated script. Pass: 0 fail.
- [ ] 7.4 Run `bun run lint` and `bun run e2e`. Pass: both are green.
- [ ] 7.5 On the host, run the prose and whitespace gates over `range.sh < /dev/null`. Pass: both exit 0.
- [ ] 7.6 Walk 6.2 on the production build, then run `/impeccable critique` and `/impeccable audit` on the Map tab. Pass: each step reads as observed.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
