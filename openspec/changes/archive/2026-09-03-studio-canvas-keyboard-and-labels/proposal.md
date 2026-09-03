## Why

Two defects sit on the studio's canvas. A design critique found both, and a
live browser run confirmed both.

The first blocks all keyboard authoring. `CanvasView.tsx` draws each step as a
`<g class="canvas-node">`. That group carries no `tabindex`, no `role` and no
`aria-label`. A guard label is a `<div>` driven by `onPointerUp`. Across 1056
lines the file holds one `aria-label` and one `onKeyDown`, both on the inline
rename input. A live count on the edit screen found 22 focusable elements and
none of them on the canvas. The `<svg>` holds seven steps and carries no role,
no name and no `tabindex`.

No step selection means no inspector. No inspector means no authoring. This is
not a degraded route to the work. It is no route at all. PRODUCT.md names the
standard: WCAG 2.1.1 Keyboard, Level A.

The second defect hides every step label. Line 656 reads
`s.key || resolveDraftLocalizedText(s.label, ...) || t("steps.unnamedStep")`.
The operands sit in the wrong order. A valid step always carries a key, so the
label branch never runs. The node then prints that key twice, once at line 952
and once at line 956. Every node reads "capture / capture".

The header's content-locale selector changes nothing on the canvas. No canvas
text comes from a locale, so nothing there can switch. The product's direction
is no-code authoring, and its primary surface speaks only in identifiers.

## What Changes

- Each step node becomes a focusable control. It carries `role="button"`, a
  roving `tabindex` and an `aria-label`.
- Each path becomes a focusable control beside it, with its own name.
- The `<svg>` takes `role="application"`, an `aria-label` and a `tabindex`.
  The role is what lets an arrow key reach the handler under a screen reader's
  browse mode.
- Keyboard traversal follows the paths, mirroring the state machine the
  definition describes. Tab enters the canvas at the initial step. Right and
  Left walk a path forward and back. Up and Down walk the step order, and the
  path fan when focus sits on a path. Enter selects and opens the inspector,
  and Escape hands the stop back to the `<svg>`. A key press from the inline
  rename field reaches none of that.
- A group box gets a real disclosure: a `<button type="button">` in a corner
  `<foreignObject>`, carrying `aria-expanded` and `aria-controls`. Traversal
  skips a step hidden inside a collapsed group. The button needs a groups
  writer threaded in from `EditScreen.tsx`, which `CanvasView` has no prop for
  today.
- A focused node or path draws a 2px accent ring at 2px offset. It is an SVG
  element, not a CSS outline. Each of those two suppresses the global
  `:focus-visible` outline, so exactly one ring draws. The `<svg>` root and the
  group's disclosure button keep that global outline, which is the only
  indicator either has. The node rect drops its `rx="2"`, which the
  zero-radius rule forbids.
- The node prints the step's label, resolved against the content locale, and
  the key below it. The key line hides where the label line already prints the
  key. The inline rename seeds from that same resolved label.
- Two more step headings get the corrected expression, in `StepsPanel.tsx` and
  `FormEditorScreen.tsx`. Both print a key and reach no label at all.
- The traversal itself lands in a pure module beside the nine that already sit
  in `canvas/`, with `bun:test` coverage. It is the twelfth computation the
  `studio-canvas` spec counts, and it is total over a deep-partial draft.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the traversal model, the focusable path, the
  collapsed-group disclosure and the focus ring. Also the node's printed
  label, the rename seed, and one more pure computation in the tested set.
- `spa-accessibility`: a graphical surface's own nodes are focusable and
  named. The panel-parity rule stays, and stops being the only keyboard route.
  The disclosure rule reaches inside a graphical surface unchanged: the group
  box carries a real `<button>` in a corner `<foreignObject>`.
- `authored-content-localization`: a studio surface that displays authored
  text resolves it against the content locale. The delta restates that
  capability's Purpose, which today scopes it to the contract and the
  resolution function alone.

## Impact

- `packages/web/src/areas/studio/canvas/traversal.ts`: new, pure.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: node and path roles,
  names, the roving index, the key handler and the focus ring. Also `rx`, the
  label order, the hidden key line, the rename seed and a groups-writer prop.
  Plus the group's disclosure button and the members `<g>` it names.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: threads that groups
  writer into its one `CanvasView` call site, and swaps its own collapse
  button's `aria-pressed` for `aria-expanded`.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx` and
  `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`: one line each,
  the same corrected label expression.
- `packages/web/src/areas/studio/app.css`: the focus-ring rules, and the
  `outline: none` that keeps the global one from doubling it. Plus the
  disclosure button's own rule, which sizes and centers its glyph.
- `packages/web/src/i18n/catalogs/studio.ts`: the name keys, in English. That
  catalog carries no other locale.
- `packages/web/test/`: the traversal unit tests and the static-markup
  assertions.
- `docs/browser-checks.md`: the traversal, the focus ring and the locale
  switch.
- `docs/current-state.md`. `ROADMAP.md` needs no row: this is an accessibility
  pass, which that file already sends to the archive with no stage.
