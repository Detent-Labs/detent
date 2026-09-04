## Why

Phases 0 through 2 (all archived) closed the styling gap for the shell,
form-ui, and the three participant-facing areas. The studio area is the
one screen set left with no compiler behind it. It is also the largest:
about 305 rule blocks in `packages/web/src/areas/studio/app.css`
outside canvas scope, across roughly 26 non-canvas files. A wrong token
or a mistyped property there still reaches `main` past every gate, the
same reason every prior phase gave.

Phase 3 closes that gap for every studio screen except the canvas
itself. Three files stay phase 4's scope, per phase 0's Migration
Plan: `canvas/CanvasView.tsx`, `canvas/EditRail.tsx` and their helper
modules. This phase also answers the one open question that plan left
for it. Does `::backdrop` compile and paint correctly under StyleX
0.19? Native `<dialog>` elements are the only place this repo uses it.

## What Changes

- `packages/web/src/areas/studio/app.css`'s non-canvas rule blocks move
  into typed `stylex.create` style objects, colocated with each
  component. Each component reads `form-ui/tokens.stylex`.
- Two cross-boundary classes stay literal and unmigrated. This follows
  `web-styling`'s "A shared class stays literal until its last consumer
  migrates" rule. `.canvas-group-name` is one: both
  `screens/EditScreen.tsx` and `canvas/CanvasView.tsx` render it. The
  other seven belong to `canvas/EditRail.tsx` alone: `.studio-rail`,
  `.studio-rail-count`, `.studio-rail-row`, `.studio-rail-section`,
  `.studio-palette-entry`, `.studio-palette-ghost`,
  `.studio-palette-list`. All eight stay in `app.css`, untouched. They
  belong to phase 4.
- The `.studio-form-canvas[data-columns="2"]`/`[data-span="2"]` pair
  drives `screens/FormEditorScreen.tsx`'s own "How it will look"
  preview. It converts to the same parameterized-style-function pattern
  phase 1 established for `form-ui`'s own `FieldForm.tsx`.
- The 22 other `[data-*]`/`[aria-*]`-conditioned rules become
  JS-computed style choices, in their own component's code. This
  follows `web-styling`'s "A DOM-attribute variant becomes a code-side
  style choice" rule.
- Four native `<dialog>` elements keep their `.studio-dialog` shape,
  now compiled. Two sit in `panels/ProcessHeaderBar.tsx`:
  publish-confirm and discard-confirm. Two more sit in
  `screens/ProcessesScreen.tsx`: promotion-preview and start-picker.
  `::backdrop` was a first use for this repo's StyleX adoption. Task
  2.1's isolated transform check passed. Task 4.3's real-build check
  did not: it found no compiled `::backdrop` rule in the production
  bundle at all (design.md D12). Every dialog composes the literal
  `.studio-dialog` class permanently, alongside its own compiled
  style, so `app.css`'s literal `::backdrop` rule keeps matching.
- Three duplicate rule declarations inside this phase's scope merge
  into one `stylex.create` entry each: `.studio-matrix-row-header`,
  `.studio-form-card-body`, `.studio-form-canvas-tail`. This follows the
  duplicate-declaration pattern phase 2 established.
- `docs/browser-checks.md` gains a studio probe section. It covers the
  form editor's two-column preview and the panels screen's
  three-column layout. It also covers the dock's tab switching and all
  four dialogs' open/close/backdrop behavior.
- This phase's own exit criterion also demands a real keyboard walk.
  That walk covers the form editor and the panels screen's index rail.
  It also covers the dock's tab row and each dialog's focus-trap and
  Escape-to-cancel behavior. That is a stricter bar than phases 1 and 2
  needed. "Keyboard walks unchanged" is this phase's own stated exit
  criterion.
- `docs/decisions.md`'s StyleX entry and `ROADMAP.md` stage 45 record
  phase 3 as done. Both also correct the phase-3 Migration Plan row's
  own inaccurate claim that `:popover-open` sees first use here. It was
  already used for the shell account menu, in phase 0.
- `packages/web/src/areas/studio/canvas/` stays untouched. No file
  there changes. `.btn`/`.app-back` stay deferred, unchanged from every
  prior phase's own decision.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the panels screen compiles from StyleX. So do three of
  its four process-wide views. Those are the field catalog, the field
  matrix's toolbar and legend, and the data sources panel. The fourth,
  the contract panel, carries no rule to compile and needs no change.
  So does the process list (`ProcessesScreen.tsx`), its two dialogs,
  the templates screen, the versions screen, and the content-locale
  switcher.
- `studio-canvas`: the process-identity header bar
  (`ProcessHeaderBar.tsx`) compiles from StyleX. So does the
  inspector's own chrome: `StepsPanel.tsx`'s identity zone,
  behavior-zone tab list, diagnostics drawer, and its Paths and Timers
  tabs. So does the dock's own layout. `CanvasView.tsx` and
  `EditRail.tsx` themselves stay untouched.
- `studio-checks-rail`: the checks rail compiles from StyleX.
- `studio-form-editor`: the form editor compiles from StyleX. Its
  two-column preview switch becomes a parameterized style function.
- `studio-publish`: the publish-confirmation dialog compiles from
  StyleX. Its `::backdrop` stays a literal rule permanently (D12).
- `studio-json-view`: the JSON view compiles from StyleX.
- `studio-player`: the Player screen compiles from StyleX.
- `studio-tools`: the Tools screen compiles from StyleX.
- `studio-migration-plan-form`: the migration-plan screen and its form
  compile from StyleX.

This proposal carries no `web-styling` delta. An isolated
`@stylexjs/babel-plugin` transform, run ahead of this proposal,
confirmed `::backdrop` compiles correctly on its own. A later
real-build check (task 4.3) found the production bundle carried no
compiled `::backdrop` rule at all. Every dialog keeps that one rule
literal instead (design.md D12).

Verify first, then fall back to literal CSS on a failed real-build
check. That is what phase 2's own "A phase verifies an unproven
compiler feature against a real build first" requirement asks.
This phase's shared-class cases fit phase 2's "A shared
class stays literal until its last consumer migrates" requirement
too. Neither needs a new requirement or
scenario. Task 2.1 re-runs the same transform check formally, during
apply.

## Impact

- Code: every file under `packages/web/src/areas/studio/` except
  `canvas/`, plus `packages/web/src/areas/studio/app.css` losing its
  migrated rules. Its `.canvas-*` rules and the seven
  `EditRail.tsx`-only classes stay.
- Tests: 6 `.tsx` test files assert a literal `studio-`-prefixed class
  name this migration changes, and need updating:
  `studio-checksRail-publishVerdict.test.tsx`,
  `studio-editorDock-fieldMatrixTab.test.tsx`,
  `studio-fieldMatrixGrid-bulkBadges.test.tsx`,
  `studio-fieldMatrixPanel-legend.test.tsx`,
  `studio-panelsRailFieldRow.test.tsx`,
  `studio-processHeaderBar-publishGate.test.tsx`. A seventh,
  `studio-actionListEditor-registryBadge.test.tsx`, asserts
  `badge-not-checked`, a class no CSS rule anywhere in the repo backs.
  This migration does not touch it, so that test needs no change.
- Specs: `openspec/specs/studio-app/spec.md`,
  `openspec/specs/studio-canvas/spec.md`,
  `openspec/specs/studio-checks-rail/spec.md`,
  `openspec/specs/studio-form-editor/spec.md`,
  `openspec/specs/studio-publish/spec.md`,
  `openspec/specs/studio-json-view/spec.md`,
  `openspec/specs/studio-player/spec.md`,
  `openspec/specs/studio-tools/spec.md`,
  `openspec/specs/studio-migration-plan-form/spec.md`.
- Docs: `docs/browser-checks.md`, `docs/decisions.md`, `ROADMAP.md`.
- Dependencies: none new. `@stylexjs/stylex` is already installed.
- Out of scope: `packages/web/src/areas/studio/canvas/` in full, any
  engine file under `src/`, the `.btn`/`.app-back` family in
  `tokens.css`. Every other area stays out of scope too:
  shell/app/admin/reporting, all done in phases 0-2.
