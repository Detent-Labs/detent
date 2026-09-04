## Context

See `proposal.md`'s Why section. `packages/web/src/areas/studio/app.css`
today holds 58 rule-block selectors. All of them survived phase 3's cleanup
(`stylex-phase-3-studio`). 45 belong to `CanvasView.tsx` (`.canvas-*`). 10
belong to `EditRail.tsx` (`.studio-rail`/`.studio-palette-*`). 3 lines are
permanent, non-canvas survivors.

Phase 3 established that these three stay in this file forever: the
`prefers-reduced-motion` media block (the same one every area's `app.css`
keeps), and `.studio-dialog::backdrop`. Per `stylex-phase-3-studio`'s D12,
`::backdrop` fails a real `@stylexjs/unplugin` build. Every `<dialog>` in
this repo composes the literal `studio-dialog` class permanently as a
result. This change converts the other 55 rule blocks. It leaves those 3
lines as `app.css`'s entire remaining content.

`CanvasView.tsx` is a hand-rolled SVG canvas
(`<g>`/`<path>`/`<rect>`/`<circle>`/`<text>`/`<foreignObject>`), not HTML.
It does its own keyboard-focus targeting via `svg.querySelector()` against
class+attribute compound selectors. It also runs its own pointer-exclusion
contract with the `@panzoom/panzoom` library, via a literal exclude-class.

Both of those are runtime DOM queries against class name STRINGS, not CSS
rules. A class StyleX hashes silently breaks them. That holds unless the
code querying for the string changes alongside the class's own conversion.
This design's central concern is finding every such string dependency
before converting its class. The mechanical CSS-to-`stylex.create()`
conversion itself is not the concern. Every prior phase already used that
same technique.

## Goals / Non-Goals

**Goals:**
- Convert all 55 non-permanent rule blocks in `app.css` to `stylex.create()`
  style objects in `CanvasView.tsx` and `EditRail.tsx`.
- Preserve every runtime string dependency on a class name. That includes
  `elementFor()`'s keyboard-focus `querySelector` calls, Panzoom's
  exclude-class option, and `EditScreen.tsx`'s drop-target
  `elementFromPoint` lookup.
- Keep `canvas-node` and `panzoom-exclude` literal, per the task's explicit
  mandate.
- Preserve the runtime CSS-custom-property grid painting (`paintGrid()`)
  exactly as it works today.

**Non-Goals:**
- Renaming any class. Every class this phase touches already carries the
  correct `canvas-`/`studio-` prefix, unlike phase 3's bare-named panel
  components. Nothing here is a naming cleanup.
- Changing the canvas's visual design, keyboard model, or drag mechanics.
  Every scenario this change ships preserves existing behavior.
- Converting `PanelsScreen.tsx` or any other studio file phase 3 already
  migrated. `EditScreen.tsx` is the one stated exception (D5). This change
  touches exactly one property in one already-compiled style object
  there, to close out `.canvas-group-name`'s shared-class deferral.
  Nothing else in that file changes.

## Decisions

**D1: `elementFor()`'s three selectors move off class qualifiers except
the one the task pins literal.**

`elementFor()` (`CanvasView.tsx:382-392`) reads
`.canvas-node[data-step-id="X"]`, `.canvas-edge-group[data-path-id="X"]`,
and `.canvas-group-disclosure[data-group-id="X"]` via `svg.querySelector()`.
That call is a subtree search: the first match in document order. It
differs from `.closest()`, which only walks ancestors.

The component sets `data-step-id` on two different element kinds: a
node's `<g>`, and, when its own step has an id, an edge-group's `<g>`.
It also sets `data-path-id` on two different element kinds. One is the
edge-group `<g>`. The other is the guard label's `<foreignObject>`,
which shares the value whenever that path carries a guard. Both class
qualifiers are load-bearing disambiguators today.

`.canvas-node` stays literal per the task's mandate, so its selector needs
no change. The component sets `data-group-id` on exactly one element in
the whole file: the group-disclosure `<button>`, confirmed by grep across
`CanvasView.tsx`. Its selector drops the class qualifier entirely.
`[data-group-id="X"]` is already unambiguous.

Multiple elements genuinely share `data-path-id`. This change adds a new
`data-kind="edge"` attribute to the edge-group `<g>`, alongside its
existing `data-path-id`/`data-step-id`. It rewrites the selector to
`[data-kind="edge"][data-path-id="X"]`. Neither the guard label nor any
other element gets `data-kind`. The attribute pair is therefore
unambiguous without needing the class at all. This frees
`.canvas-edge-group` and `.canvas-group-disclosure` to convert normally.

*Alternative considered*: keep
`.canvas-edge-group`/`.canvas-group-disclosure` literal too, alongside
`.canvas-node`. Rejected. The task names only `canvas-node` and
`panzoom-exclude` as the classes that must stay literal. Both of the
other two carry real CSS: `cursor`, layout, hover color. That CSS belongs
in the compiled system, like everything else this migration touches. A
`data-kind` attribute is also one line cheaper than carrying two more
permanent literal-class exceptions forward.

**D2: `.canvas-toolbar`'s remaining class dependency moves to the
component's own ref.**

The `onWheel` handler (`CanvasView.tsx:252`) checks
`(e.target as Element).closest(".canvas-toolbar")` to suppress Panzoom's
zoom when a wheel event starts inside the toolbar. The component already
holds `toolbarRef`, bound to that exact `<div>` (`CanvasView.tsx:1005`).
This change replaces the class-based check with
`toolbarRef.current?.contains(e.target as Node)`. That removes the last
runtime dependency on `.canvas-toolbar` staying literal.

**D3: Genuine ancestor-pseudo-class rules use `stylex.when.ancestor`.
Every other apparent "ancestor rule" is a JS-computed style pick
instead.**

`app.css` has four rule shapes that look like ancestor selectors:

1. `.canvas-node:focus-visible .canvas-node-focus-ring` and
   `.canvas-edge-group:focus-visible .canvas-edge-focus-halo` both set
   `display: inline`. The ancestor's state here is a real browser
   pseudo-class, not application state. These two convert to
   `stylex.when.ancestor(":focus-visible")` on the ring's and the halo's
   own `display` property.

   This is the same construct `stylex-phase-2-areas` proved for
   `.app-task-step`'s `:hover` underline (`TasksScreen.tsx`,
   `StartedScreen.tsx`, `InvolvedScreen.tsx`). Only the pseudo-class name
   is new here, not the mechanism. This needs no fresh isolated-transform
   check: the real build and the browser keyboard walk this change
   already runs cover it.

   `app.css` declares both selectors twice: a shared block (`display`,
   `fill`, `stroke`, `pointer-events`), plus each one's own second block.
   The ring's second block sets `stroke-width: 2` and
   `stroke-dasharray: 5 4`. The halo's sets `stroke-width: 6`. This is the
   same duplicate-declaration shape phase 3 merged for other selectors.
   Each converts to ONE `stylex.create()` entry combining both of its
   blocks, not two.

2. `.canvas-edge-group-selected .canvas-edge` and
   `.canvas-edge-insert-target .canvas-edge` handle stroke recolor and
   weight. These read `isSelected` and `isInsertTarget`, plain JS
   booleans already computed at the exact call site that renders the
   edge `<path>` (`CanvasView.tsx:1130,1176`). That is the same scope
   that already picks `canvas-edge-manual` vs. `canvas-edge-automatic`.
   The edge's compiled style picks its selected/insert-target variant
   directly from those booleans. No ancestor selector enters the
   compiled style.

3. `.canvas-group-collapsed .canvas-group-box` and
   `.canvas-group-collapsed .canvas-group-name` follow the same
   reasoning. `group.collapsed` is a JS boolean in scope exactly where the
   box `<rect>` and name `<text>` render (`CanvasView.tsx:1051-1084`).

4. `.canvas-toolbar button[aria-pressed="true"]`'s attribute belongs to
   the button itself, not an ancestor. `edgeStyle === "smoothstep"`
   already derives it, at that exact `<button>`'s render site
   (`CanvasView.tsx:1012`). This is the established
   DOM-attribute-becomes-code-side-style-choice rule from `web-styling`,
   applied to a plain, non-ancestor case.

Only case 1 is a genuine ancestor-conditional rule. The phase-0
migration plan's "Edge recolor via when.ancestor" line looks like it
covers all four. That reading is wrong. Treating all four as ancestor
rules would add three unnecessary CSS ancestor selectors. That targets
state the component already tracks in JS. It would be worse than the
direct pick, and inconsistent with every prior phase's
DOM-attribute-to-code-choice rule.

**D4: The three runtime grid custom properties stay exactly as they
are.**

`paintGrid()` (`CanvasView.tsx:266-270`) writes `--canvas-grid-size`,
`--canvas-grid-offset-x`, and `--canvas-grid-offset-y` onto
`.canvas-wrap`'s DOM node via `style.setProperty()`. Panzoom's live
pan/zoom state drives all three. This change does not touch those three
calls.

`.canvas-wrap`'s compiled `stylex.create()` entry declares
`backgroundSize`/`backgroundPosition`, and the two fallback values, as
literal `var(--canvas-grid-size)` / `var(--canvas-grid-offset-x)` /
`var(--canvas-grid-offset-y)` references. StyleX accepts a `var()`
reference as an ordinary property value, the same way `tokens.stylex.ts`'s
own semantic tokens compile. The compiled CSS declares the property name.
The imperative call keeps supplying its value at runtime. The compile
step does not affect that.

**D5: `.canvas-group-name` finishes converting this phase, closing phase
3's D2 deferral, rather than becoming a third permanent literal
exception.**

`.canvas-group-name` has exactly two consumers in the repo, confirmed by
a repo-wide grep. One is `CanvasView.tsx:1075` (this phase). The other is
`EditScreen.tsx:695`, phase 3's inspector group-rename `<label>`, out of
this phase's own scope otherwise.

Phase 3's own design.md deliberately left this class's two duplicate
`app.css` declarations unmerged. It also left its `EditScreen.tsx` call
site literal, "for phase 4." That cited `web-styling`'s "A shared class
stays literal until its last consumer migrates" rule.
`EditScreen.tsx:158`'s comment carries the same note.

A plan that converts `CanvasView.tsx`'s call site alone, without also
moving `EditScreen.tsx`'s, would leave `EditScreen.tsx` as a
still-unconverted consumer. The shared class must then stay literal, per
that same rule. Deleting its `app.css` rule, as every other rule this
phase touches does, would strip the group-rename label's `cursor: grab`
and font styling. No test would catch it.

`EditScreen.tsx`'s own code comment already documents which half of
`.canvas-group-name`'s rule blocks its `<label>` needs. It reads only
the `cursor: grab` property. The other two declarations, `font-family`
and `font-size`, plus `fill`, are SVG `fill`-based. They are
meaningless on an HTML `<label>`.

This change folds `cursor: "grab"` into `EditScreen.tsx`'s existing
`canvasGroupNameField` `stylex.create()` entry. That is a one-property,
one-file addition to an already-compiled style object, not a new
migration step. It also drops the literal `canvas-group-name ` prefix
from that one `className`.

`CanvasView.tsx`'s own `<text>` then converts the full rule to its own
independent compiled style. That covers cursor, font-family, font-size,
fill, plus the collapsed-state variant, via the same `group.collapsed`
boolean as D3 case 3. No other file references the literal string once
this lands. As a result, `app.css` ends this phase exactly the way
phase 1-2 precedent expects: its two permanent survivors, nothing more.

*Alternative considered*: leave `.canvas-group-name` a third permanent
literal exception. That is the way `.btn` stays deferred past every
phase that doesn't touch its last caller. Rejected. `.btn` has over 100
call sites across many files, so no single phase owns "the last one."

Unlike `.btn`, `.canvas-group-name` has exactly one remaining literal
call site outside this phase's own file. It is one property.
`ROADMAP.md` names no phase 5 to pick it up. Deferring it again would
convert a two-file, one-property, phase-3-flagged cleanup into
permanent, unowned debt. That cost has no justification beyond staying
inside the task's literal file list.

**D6: This phase deletes the two CSS-text tests, rather than adapting
them.**

`test/preload-stylex.ts` maps each top-level `stylex.create()` key to
that key's own name string in test-rendered output. It does not preserve
CSS property VALUES.

Two tests read `app.css`'s text directly to assert a literal property
value. One is `studio-canvas-fit.test.ts`'s
`describe("canvas fit: the clipping surface", ...)` block. The other is
one `it` block inside `studio-canvas-node-a11y.test.tsx` that reads
`.canvas-group-disclosure {`'s declared properties. Both go.

Their coverage moves to `docs/browser-checks.md` as a manual probe. That
is the same `development-toolchain` split-rule pattern every prior phase
used for this exact defect class.

Every other `it`/`describe` block in both files stays. That covers the
`computeFit()`-only fit test, and every DOM-structure/keyboard/a11y test
in the node-a11y file. Neither touches CSS text. Each updates only where
it asserts a literal `canvas-*` class-name string that this migration
changes.

## Risks / Trade-offs

Risk: a missed class-name string dependency silently breaks keyboard
focus or Panzoom exclusion at runtime. TypeScript raises nothing at
compile time. No test catches it either, if the test suite's own
assertions already match.

Mitigation: D1 and D2 above came from grepping every production and
test reference to each class this migration converts. They did not
come from inspecting `CanvasView.tsx` alone. The verification group's
browser keyboard walk and drag probe are the actual backstop, matching
the task's own exit criteria.

Risk: `stylex.when.ancestor(":focus-visible")` compiles differently than
`:hover` did in phase 2. Focus state interacts with `tabIndex` changes
this file makes, on nearly every keyframe of a drag.

Mitigation: the real build catches a compile-time or runtime divergence
before archive. So does a real-browser keyboard walk in both Chromium
and Firefox, this phase's own exit criterion. A construct already
proven in this codebase needs no separate isolated-transform check.

Risk: deleting the two CSS-text tests loses regression coverage for the
exact property values they asserted. That gap lasts until a human next
runs the manual browser probe.

Mitigation: this is the same trade-off every prior phase accepted for
this defect class. `docs/browser-checks.md`'s existing structure already
carries several such probes for phases 1-3. This phase adds one more in
the same place.

## Migration Plan

No runtime data, no schema, and no HTTP changes. This is a pure
frontend refactor. It converts the CSS. It changes the two
string-dependent selectors and one ref-based check. It changes or
deletes the affected tests, and verifies the result.

Rollback is `git revert` of this change's commits. Phase 3 proved
(`stylex-phase-3-studio`'s D14) that no file outside `canvas/` reads a
`.canvas-*` class for its own five `.canvas-inspector`/
`.canvas-selection*` rules. This phase's own repo-wide grep (D5)
confirms the same holds for every other canvas-prefixed rule this phase
converts. D5 resolves `.canvas-group-name` as the sole documented
exception, rather than carrying it forward.

## Open Questions

None. This design resolves every open question it raised during
research, above, as a Decision, not deferred. Those questions were the
`elementFor()` disambiguation, the `.canvas-toolbar` dependency, and
which "ancestor" rules are genuine `when.ancestor` candidates.
