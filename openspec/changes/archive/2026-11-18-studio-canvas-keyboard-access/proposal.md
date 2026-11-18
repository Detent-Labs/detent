# Proposal

## Why

A keyboard author on the Map tab cannot zoom, cannot pan, and cannot add a way out. The UI SDK spike
(`spike/ui-sdk-canvas`) measured about 72 keys to add one way out, and that route leaves the Map tab. It
also found two defects. The canvas frame scrolls itself under the pan transform when a node takes focus,
342 px at 200 % zoom. Enter on a step drops focus to `<body>`.

The spike recommended closing these gaps on the current Panzoom canvas, with no new dependency. This
change does that.

## What Changes

- **Defect: the frame scrolls under the transform.** The canvas frame clips its content and stops being a
  scroll container. Every `focus()` call the canvas makes passes `preventScroll`.
- **Reveal on focus.** A keyboard focus move can land on an element outside the visible canvas. The
  canvas then pans that step, way out or group disclosure into view. It does not change the zoom. A
  pointer press reveals nothing.
- **Zoom keys.** Inside the canvas, `+` and `=` zoom in. The `-` key zooms out. The `0` key runs Fit to
  view. A key with Ctrl, Meta or Alt stays the browser's own. Each zoom announces the new level.
- **Defect: Enter drops focus to `<body>`.** Enter on a step lands focus on the step page's Name input.
  Enter on a way out lands on that way out's row in Ways out.
- **The way-out menu.** On a focused step, `C` opens a menu headed "Way out to …". It lists the draft's
  steps, then "A new step". Enter adds the way out a connect drop would add. A source the drop refuses
  opens no menu, and the canvas shows and announces the refusal.
- A refusal, from the drop or the key, reads a catalog sentence in the author's words. An end
  reads the handle's "An end has no way out." A missing order reads a canvas sentence of its own.
  Every other trigger rule reads the checks rail's sentence for it.
- **Announcements.** The canvas gains one polite, visually hidden live region. Every string comes from
  the studio catalog, in the author's words.

The pointer gestures, the layout, groups, the wheel and every other widget stay as they are. Panzoom
stays.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: adds the frame clip, reveal on focus and the zoom keys. It adds the focus landing on
  the step page, the way-out menu and the canvas's live region. The panels-parity requirement's last paragraph
  changes. The connect drag gains a keyboard route on the canvas itself.
- `spa-accessibility`: the canvas-substitute requirement keeps the panel route as one keyboard route
  among others. A new requirement states how a graphical surface announces a keystroke's result.

## Impact

- `packages/web/src/areas/studio/canvas/`: `CanvasView.tsx`, `fit.ts` and `dropGesture.ts`. A new pure
  module, `wayOutMenuLogic.ts`, builds the menu's items, and `WayOutMenu.tsx` draws the menu.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`, `draft/process-tabs.ts` and
  `panels/PathsPanel.tsx`: the focus landing after Enter.
- `packages/web/src/i18n/catalogs/studio.ts`: the menu's words, the refusals and the announcements.
- `canvas/connection.ts` (`refusalSentence`), `draft/checkSentence.ts` (the shared sentence helper)
  and `focusScroll.ts` (the modality reader), all under `packages/web/src/areas/studio/`.
- `.claude/rules/ui-glossary.md`: a row for the way-out menu.
- Tests under `packages/web/test/` and a new smoke flow, `e2e/canvas-keyboard.e2e.ts`.
- `docs/browser-checks.md` and `docs/authoring-guide.md`. In `docs/decisions.md`, the CANVAS-1 entry
  and the entry on a canvas removal.
- No engine change, no definition contract change, no new dependency.
