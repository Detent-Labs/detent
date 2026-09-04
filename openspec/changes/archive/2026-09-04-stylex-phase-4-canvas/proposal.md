## Why

Phases 0-3 moved `packages/form-ui`, the shell, all three non-studio
areas, and the studio area's non-canvas screens onto StyleX. The file
`packages/web/src/areas/studio/app.css` still carries 55 rule blocks.
They belong to the two files phases 0-3 skipped on purpose:
`canvas/CanvasView.tsx` and `canvas/EditRail.tsx`. This is phase 4 of
that migration, per `stylex-phase-0-tooling`'s Migration Plan.

## What Changes

- Convert every rule block in `app.css` owned by `CanvasView.tsx` (45
  rules, `.canvas-*`-prefixed) and `EditRail.tsx` (10 rules,
  `.studio-rail`/`.studio-palette-*`). Compile them to `stylex.create()`
  style objects, reading `form-ui/tokens.stylex`. `app.css` keeps only
  its two permanent, non-canvas survivors: the `prefers-reduced-motion`
  media block and `.studio-dialog::backdrop`.
- Close out `.canvas-group-name`'s cross-file deferral
  (`stylex-phase-3-studio`'s D2). Fold the one property
  `EditScreen.tsx`'s group-rename label still borrows from it into that
  file's existing compiled style. The class then converts fully, instead
  of becoming a third permanent literal exception.
- Keep `canvas-node` and `panzoom-exclude` as literal, unhashed class
  strings. `elementFor()`'s keyboard-focus `querySelector` and Panzoom's own
  exclude-class contract both depend on the literal string.
- Move `elementFor()`'s other two selectors off class qualifiers entirely. A
  new `data-kind="edge"` attribute on the edge-group `<g>` replaces the
  `.canvas-edge-group` qualifier. The already-unique `data-group-id` drops
  the `.canvas-group-disclosure` qualifier. Both classes are then free to
  convert normally.
- Move `.canvas-toolbar`'s one remaining class dependency, an `onWheel`
  guard, to the component's existing `toolbarRef`.
- Convert one genuine ancestor-conditional CSS rule set. The
  `:focus-visible` state drives the focus ring's and the edge halo's
  `display`. This converts to `stylex.when.ancestor(":focus-visible")`,
  the same construct phase 2 proved for `:hover`. The remaining
  ancestor-looking rules include `-selected`, `-insert-target`,
  `-collapsed`, and the toolbar's `aria-pressed` rule. A JS boolean
  already in scope at each one's own render site drives it instead. They
  convert to plain conditional style picks, per the established
  DOM-attribute-to-code-choice rule.
- Leave the three runtime grid custom properties `paintGrid()` writes via
  `style.setProperty()` untouched: imperative and inline. `.canvas-wrap`'s
  compiled style reads them by `var()` reference.
- Delete two tests that read `app.css`'s text for a literal CSS property
  value: one `describe` block in `studio-canvas-fit.test.ts`, one `it`
  block in `studio-canvas-node-a11y.test.tsx`. Their coverage moves to
  `docs/browser-checks.md` as a manual probe. Every other test asserting a
  `canvas-*` class name updates to the class name the StyleX test stub
  derives.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: adds a requirement that `CanvasView.tsx` and
  `EditRail.tsx` render from compiled component styles rather than
  `app.css`, with the same visual and keyboard-interactive result.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`,
  `packages/web/src/areas/studio/canvas/EditRail.tsx`,
  `packages/web/src/areas/studio/app.css`.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: one property
  added to one already-compiled style object, one literal `className`
  prefix removed. See design.md D5.
- `packages/web/test/studio-canvas-fit.test.ts`,
  `packages/web/test/studio-canvas-node-a11y.test.tsx`,
  `packages/web/test/studio-canvas-node-label.test.tsx` (checked, not
  necessarily edited).
- `docs/browser-checks.md`, `docs/decisions.md`, `ROADMAP.md`.
- No engine, HTTP, or definition-contract file changes.
