## 1. Retarget Panzoom's pan-drag and wheel-zoom

- [x] 1.1 In `CanvasView.tsx`'s mount effect, add `canvas: true` to the
      `Panzoom(el, { ... })` call, so Panzoom binds pointerdown to
      `.canvas-wrap` instead of `.canvas-svg`.
- [x] 1.2 Move the manual `wheel` listener off `el` and onto `el.parentElement`
      (`.canvas-wrap`). Keep the existing add/remove pair symmetric in the
      effect's cleanup.
- [x] 1.3 Wrap the wheel handler so it ignores an event whose target sits
      inside `.canvas-toolbar`, before it calls `panzoom.zoomWithWheel`. Check
      by class name (`.canvas-toolbar`), not by a general `panzoom-exclude`
      walk (design.md - Decisions covers why).
- [x] 1.4 Add a short comment at the `Panzoom(...)` call naming the
      `panzoom-exclude` requirement for any future control added over the
      canvas (design.md - Risks / Trade-offs).

## 2. Exclude the toolbar from Panzoom's new bind target

- [x] 2.1 Add the `panzoom-exclude` class to `.canvas-toolbar` in
      `CanvasView.tsx`'s JSX.
- [x] 2.2 Confirm no CSS rule in `app.css` targets `.canvas-toolbar` by a
      single-class selector that `panzoom-exclude` would break.
- [x] 2.3 Run `bun run typecheck` and `bun run build`. Fix anything red here
      before moving to the manual verification below.

## 3. Manual browser verification

- [x] 3.1 Open a draft with steps spread wider than the canvas. Confirm a
      background pan-drag started in the margin the automatic fit leaves
      empty now moves the graph.
- [x] 3.2 Confirm "Fit to view" still activates on click.
- [x] 3.3 Confirm a wheel scroll while pointing at the toolbar does not pan
      or zoom the canvas underneath it.
- [x] 3.4 Confirm a wheel scroll over the same empty margin, away from the
      toolbar, does zoom the canvas, the same as a wheel scroll over the
      graph itself.
- [x] 3.5 Repeat node-drag and connect-drag (including a connect-drag
      released in what was the dead zone). Confirm both still work
      unchanged.
- [x] 3.6 Drag a palette entry (Step, Subprocess, or End) and release it in
      what was the dead zone. Confirm it still places a step there, the
      same as before this change.

## 4. Documentation

- [x] 4.1 Extend `docs/browser-checks.md`'s "Studio canvas: 'Fit to view'
      frames every step" section with the pan-drag/wheel-zoom dead-zone
      check from tasks 3.1, 3.3, and 3.4. Follow the section's existing
      pattern: a Source line naming this change, Pass wording, and the
      reason it stays manual.
- [x] 4.2 Update `docs/current-state.md`'s canvas paragraph (~line 1298).
      Replace "bound directly to the SVG element" with the new
      `.canvas-wrap`-via-`canvas: true` binding, and extend the
      `panzoom-exclude` sentence to cover the toolbar's own membership.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm no errors.
- [x] 5.2 Run `bun run build` and confirm it succeeds.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      the reported skip count matches a normal run, not a silent all-skip,
      and that no test fails.
