## 1. Documentation

- [x] 1.1 Add a "Studio canvas: the graph centers on open, with no author
      action" section to `docs/browser-checks.md`, directly after the
      existing "Studio canvas: 'Fit to view' frames every step" section.
      Cite `Source: canvas-autofit-browser-check task 1.1`. Name repro
      steps (open a draft holding one or more steps; observe the initial
      frame), the pass condition (the graph renders already framed,
      matching an explicit "Fit to view" activation, with no author
      action), and why `packages/web/test/studio-canvas-fit.test.ts`
      cannot see the defect this once caused (a real Panzoom instance
      racing its own internal `setTimeout` against real
      `getBBox()`/`clientWidth`, and `packages/web/test/` assumes no DOM
      at all).

## 2. Verification

- [x] 2.1 Run `bun run typecheck`.
- [x] 2.2 Run the full `bun test` suite with `DATABASE_URL` set (not a
      single-file rerun).
- [x] 2.3 Run the antislop linter on `docs/browser-checks.md`.
- [x] 2.4 Run `git diff --check` over the changed file.
