# Tasks

## 1. The frame clips without scrolling

- [ ] 1.1 Install the impeccable skill and its detector hook in this worktree, as `CLAUDE.md` asks. Pass: `impeccable hook < /dev/null` exits 0 here.
- [ ] 1.2 Set `overflow: "clip"` on the compiled `wrap` style and in the `Panzoom(el, {...})` options, per D1. Rewrite the `measureFit` comment that names `overflow: hidden`. Pass: a source-text test in `packages/web/test/studio-canvas-fit.test.ts` reads `overflow: "clip"` in both places.
- [ ] 1.3 Pass `{ preventScroll: true }` to every `focus()` call in `CanvasView.tsx`. Pass: `git grep -n '\.focus()' -- packages/web/src/areas/studio/canvas/CanvasView.tsx` prints nothing.

## 2. Reveal on focus

- [ ] 2.1 Add `revealPan` and the shared `fitInsets()` reading to `canvas/fit.ts`, per D2. Pass: `packages/web/test/studio-canvas-fit.test.ts` covers a box past each edge and a box under the toolbar inset. It also covers a box in view and a box larger than the room. Each case also runs at a scale other than 1.
- [ ] 2.2 Reveal from the `<svg>`'s `onFocus`, skipping a focus during a pointer press and a root focus, per D2. After a focus the canvas did not make, call `scrollIntoView` with `nearest` on the element. Pass: the browser check in 6.2 walks a Tab entry, an arrow move and a click.

## 3. Zoom keys and the live region

- [ ] 3.1 Add `zoomAbout` and `ZOOM_KEY_FACTOR` to `canvas/fit.ts`, per D3. Pass: `packages/web/test/studio-canvas-fit.test.ts` shows the anchor's screen point unchanged after a zoom. It also covers a clamp at each bound and a centre anchor that leaves the pan as it was.
- [ ] 3.2 Answer `+`, `=`, `-` and `0` in `onCanvasKeyDown`, per D3. Return early on Ctrl, Meta or Alt. Pass: the browser check in 6.2 reads the zoom level after each key and after Ctrl and `+`.
- [ ] 3.3 Add the live region and its `announce` helper inside `.canvas-wrap`, per D4. Add the four `canvas.*` keys to `i18n/catalogs/studio.ts`. Pass: a test in `packages/web/test/studio-canvas-node-a11y.test.tsx` finds an empty polite `role="status"` in the first markup.
- [ ] 3.4 Announce the zoom level after each zoom key, through `canvas.zoomAnnounce`. Pass: the browser check in 6.2 reads "Map at 125 percent" in the region after `+` at 100 percent.

## 4. Enter lands on the step page

- [ ] 4.1 Add `wayOutNameId(pathId)` to `draft/process-tabs.ts`, per D5. Put it on the Name input of each Ways out row in `panels/PathsPanel.tsx`. Pass: `packages/web/test/studio-processTabs.test.ts` pins the id. A `PathsPanel` markup test finds it on the row's Name input.
- [ ] 4.2 Make `EditScreen`'s `onOpenStepPage` set `pendingFocus`, plus `sectionRequest` for a path, per D5. Pass: the smoke flow in 6.1 finds the Name input focused after Enter on a step and on a way out.

## 5. The way-out menu

- [ ] 5.1 Add `checkConnectSource` to `canvas/dropGesture.ts`, and call it first in `resolveDropGesture`, per D7. Pass: `packages/web/test/studio-canvas-dropGesture.test.ts` covers a terminal source, an inconsistent source and an accepted one. Every existing case there stays green.
- [ ] 5.2 Add `canvas/wayOutMenu.ts` with `wayOutMenuItems` and `typeAheadIndex`, per D6. Pass: a new `packages/web/test/studio-canvas-wayOutMenu.test.ts` covers draft order, the source in the list and a hidden step left out. It covers a step with no id, the separator and the new-step item. The type-ahead cases cover wrap, case and a skipped separator.
- [ ] 5.3 Move the drop's two add branches into one `addWayOut` in `CanvasView.tsx`, per D7. Pass: `git grep -n 'newPath(' -- packages/web/src/areas/studio/canvas/CanvasView.tsx` prints the calls inside `addWayOut` alone. The drop browser check in 6.2 still adds both kinds of way out.
- [ ] 5.4 Build `canvas/WayOutMenu.tsx`: the popover, the heading, the items, the separator and the keyboard model, per D6. Its styles follow the shape brief in D8. Pass: a markup test reads the heading outside `role="menu"`, the items as `menuitem` and the separator.
- [ ] 5.5 Open the menu on `C` from a step focus, or show and announce the refusal, per D6 and D7. Add `aria-keyshortcuts="C"` to each step node. Pass: `packages/web/test/studio-canvas-node-a11y.test.tsx` reads the attribute on a step. The browser check in 6.2 opens the menu and reads a refusal on an end.
- [ ] 5.6 On Enter, call `addWayOut` with the item's target, or a new step one column right of the source. Focus the new path, then announce `canvas.wayOutAdded`, per D7. Pass: the smoke flow in 6.1 adds a way out from the keyboard and finds the new path focused.

## 6. Docs and browser checks

- [ ] 6.1 Add `e2e/canvas-keyboard.e2e.ts` with three flows, per `development-toolchain`'s split rule. The first keeps the frame's scroll offsets at 0 at 200 percent zoom. The second lands Enter on the Name input. The third adds a way out with `C` and Enter. Pass: `bun run e2e` runs all three green.
- [ ] 6.2 Extend the entry "Keyboard access to the canvas" in `docs/browser-checks.md` with what the smoke flows cannot see. Cover reveal on focus, zoom keys, the live region text, the menu and a short-window Tab entry. Remove each step the smoke flows now cover. Pass: the prose gate reports no rise on the file.
- [ ] 6.3 Add the zoom keys and the way-out menu to the Map passage of `docs/authoring-guide.md`, beside the drag sentence. Pass: `git grep -n 'Way out to' -- docs/authoring-guide.md` prints a line.
- [ ] 6.4 Update the CANVAS-1 entry in `docs/decisions.md`, which names the frame's `overflow: hidden`. Pass: the CANVAS-1 entry names `overflow: clip`, and the prose gate reports no rise on the file.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` and report the last lines. Pass: exit 0.
- [ ] 7.2 Run `bun run build` and report the last lines. Pass: exit 0.
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set, in the foreground, through the gated script. Pass: 0 fail.
- [ ] 7.4 Run `bun run lint` and `bun run e2e`. Pass: both are green.
- [ ] 7.5 On the host, run the prose and whitespace gates over `range.sh < /dev/null`. Pass: both exit 0.
- [ ] 7.6 Walk 6.2 on the production build, then run `/impeccable critique` and `/impeccable audit` on the Map tab. Pass: each step reads as observed.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
