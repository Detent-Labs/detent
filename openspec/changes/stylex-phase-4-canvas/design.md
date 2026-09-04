## Context

See `proposal.md` - Why. `packages/web/src/areas/studio/app.css` today holds
58 rule-block selectors, all that survived phase 3's cleanup
(`stylex-phase-3-studio`): 45 are `CanvasView.tsx`'s own (`.canvas-*`), 10 are
`EditRail.tsx`'s own (`.studio-rail`/`.studio-palette-*`), and 3 lines are
permanent, non-canvas survivors phase 3 established stay in this file forever
— the `prefers-reduced-motion` media block (the same one every area's
`app.css` keeps) and `.studio-dialog::backdrop` (`stylex-phase-3-studio`'s
D12: `::backdrop` fails a real `@stylexjs/unplugin` build, so every
`<dialog>` in this repo composes the literal `studio-dialog` class
permanently). This change converts the other 55 rule blocks and leaves those
3 lines as `app.css`'s entire remaining content.

`CanvasView.tsx` is a hand-rolled SVG canvas (`<g>`/`<path>`/`<rect>`/
`<circle>`/`<text>`/`<foreignObject>`), not HTML, and it does its own
keyboard-focus targeting via `svg.querySelector()` against class+attribute
compound selectors, and its own pointer-exclusion contract with the
`@panzoom/panzoom` library via a literal exclude-class. Both of those are
runtime DOM queries against class name STRINGS, not CSS rules, so a class
StyleX hashes silently breaks them unless the code that queries for the
string is updated alongside the class's own conversion. This design's
central concern is finding every such string dependency before converting
its class, not the mechanical CSS-to-`stylex.create()` conversion itself,
which is the same technique every prior phase already used.

## Goals / Non-Goals

**Goals:**
- Convert all 55 non-permanent rule blocks in `app.css` to `stylex.create()`
  style objects in `CanvasView.tsx` and `EditRail.tsx`.
- Preserve every runtime string dependency on a class name: `elementFor()`'s
  keyboard-focus `querySelector` calls, Panzoom's exclude-class option, and
  `EditScreen.tsx`'s drop-target `elementFromPoint` lookup.
- Keep `canvas-node` and `panzoom-exclude` literal, per the task's explicit
  mandate.
- Preserve the runtime CSS-custom-property grid painting (`paintGrid()`)
  exactly as it works today.

**Non-Goals:**
- Renaming any class. Several classes this phase touches carry no
  `canvas-`/`studio-` prefix issue (they're all correctly prefixed already,
  unlike phase 3's bare-named panel components) — nothing here is a naming
  cleanup.
- Changing the canvas's visual design, keyboard model, or drag mechanics.
  Every scenario this change ships preserves existing behavior.
- Converting `PanelsScreen.tsx` or any other studio file phase 3 already
  migrated. `EditScreen.tsx` is the one stated exception (D5): this change
  touches exactly one property, in one already-compiled style object
  there, to close out `.canvas-group-name`'s shared-class deferral. Nothing
  else in that file changes.

## Decisions

**D1: `elementFor()`'s three selectors move off class qualifiers except the
one the task pins literal.** `elementFor()` (`CanvasView.tsx:382-392`) reads
`.canvas-node[data-step-id="X"]`, `.canvas-edge-group[data-path-id="X"]`, and
`.canvas-group-disclosure[data-group-id="X"]` via `svg.querySelector()`
(a subtree search, first match in document order — unlike `.closest()`,
which only walks ancestors). `data-step-id` is set on two different element
kinds (a node's `<g>` and, when its own step has an id, an edge-group's
`<g>`), and `data-path-id` is set on two different element kinds too (the
edge-group `<g>` and the guard label's `<foreignObject>`, which shares the
value whenever that path carries a guard). Both class qualifiers are
load-bearing disambiguators today.

`.canvas-node` stays literal per the task's mandate, so its selector needs no
change. For the other two: `data-group-id` turns out to be set on exactly
one element in the whole file (the group-disclosure `<button>`, confirmed by
grep across `CanvasView.tsx`), so its selector drops the class qualifier
entirely — `[data-group-id="X"]` is already unambiguous. `data-path-id` is
genuinely shared, so this change adds a new `data-kind="edge"` attribute to
the edge-group `<g>` (alongside its existing `data-path-id`/`data-step-id`)
and rewrites the selector to `[data-kind="edge"][data-path-id="X"]`. Neither
the guard label nor any other element gets `data-kind`, so the attribute
pair is unambiguous without needing the class at all. This frees
`.canvas-edge-group` and `.canvas-group-disclosure` to convert normally.

*Alternative considered*: keep `.canvas-edge-group`/`.canvas-group-disclosure`
literal too, alongside `.canvas-node`. Rejected — the task names only
`canvas-node` and `panzoom-exclude` as the classes that must stay literal,
and both of the other two carry real CSS (`cursor`, layout, hover color)
that belongs in the compiled system like everything else this migration
touches; a `data-kind` attribute is one line cheaper than carrying two more
permanent literal-class exceptions forward.

**D2: `.canvas-toolbar`'s remaining class dependency moves to the component's
own ref.** The `onWheel` handler (`CanvasView.tsx:252`) checks
`(e.target as Element).closest(".canvas-toolbar")` to suppress Panzoom's
zoom when a wheel event starts inside the toolbar. The component already
holds `toolbarRef`, bound to that exact `<div>` (`CanvasView.tsx:1005`). This
change replaces the class-based check with
`toolbarRef.current?.contains(e.target as Node)`, removing the last runtime
dependency on `.canvas-toolbar` staying literal.

**D3: Genuine ancestor-pseudo-class rules use `stylex.when.ancestor`; every
other apparent "ancestor rule" is a JS-computed style pick instead.**
`app.css` has four rule shapes that look like ancestor selectors:

1. `.canvas-node:focus-visible .canvas-node-focus-ring` and
   `.canvas-edge-group:focus-visible .canvas-edge-focus-halo` (both set
   `display: inline`) — the ancestor's state is a real browser pseudo-class,
   not application state, so these convert to
   `stylex.when.ancestor(":focus-visible")` on the ring/halo's own `display`
   property. This is the same construct `stylex-phase-2-areas` proved for
   `.app-task-step`'s `:hover` underline (`TasksScreen.tsx`,
   `StartedScreen.tsx`, `InvolvedScreen.tsx`); only the pseudo-class name is
   new here, not the mechanism, so this needs no fresh isolated-transform
   check — the real build and the browser keyboard walk this change already
   runs cover it. Both selectors are declared twice in `app.css` — a shared
   block (`display`, `fill`, `stroke`, `pointer-events`) plus each one's own
   second block (the ring's `stroke-width: 2`/`stroke-dasharray: 5 4`; the
   halo's `stroke-width: 6`) — the same duplicate-declaration shape phase 3
   merged for other selectors. Each converts to ONE `stylex.create()` entry
   combining both of its blocks, not two.
2. `.canvas-edge-group-selected .canvas-edge` and
   `.canvas-edge-insert-target .canvas-edge` (stroke recolor/weight) —
   `isSelected` and `isInsertTarget` are plain JS booleans already computed
   at the exact call site that renders the edge `<path>`
   (`CanvasView.tsx:1130,1176`), the same scope that already picks
   `canvas-edge-manual` vs. `canvas-edge-automatic`. The edge's compiled
   style picks its selected/insert-target variant directly from those
   booleans; no ancestor selector is involved at compile time.
3. `.canvas-group-collapsed .canvas-group-box` /
   `.canvas-group-collapsed .canvas-group-name` — same reasoning:
   `group.collapsed` is a JS boolean in scope exactly where the box `<rect>`
   and name `<text>` render (`CanvasView.tsx:1051-1084`).
4. `.canvas-toolbar button[aria-pressed="true"]` — the attribute is the
   button's own, not an ancestor's, and it is already derived from
   `edgeStyle === "smoothstep"` at that exact `<button>`'s render site
   (`CanvasView.tsx:1012`). This is the established
   DOM-attribute-becomes-code-side-style-choice rule from `web-styling`,
   applied to a plain, non-ancestor case.

Only case 1 is a genuine ancestor-conditional rule. Reading "Edge recolor via
when.ancestor" in the phase-0 migration plan as covering all four would add
three unnecessary CSS ancestor selectors for state the component already
tracks in JS — worse than the direct pick, and inconsistent with every prior
phase's DOM-attribute-to-code-choice rule.

**D4: The three runtime grid custom properties stay exactly as they are.**
`paintGrid()` (`CanvasView.tsx:266-270`) writes `--canvas-grid-size`,
`--canvas-grid-offset-x`, and `--canvas-grid-offset-y` onto `.canvas-wrap`'s
DOM node via `style.setProperty()`, driven by Panzoom's live pan/zoom state.
This change does not touch those three calls. `.canvas-wrap`'s compiled
`stylex.create()` entry declares `backgroundSize`/`backgroundPosition` (and
the two fallback values) as literal `var(--canvas-grid-size)` /
`var(--canvas-grid-offset-x)` / `var(--canvas-grid-offset-y)` references —
StyleX accepts a `var()` reference as an ordinary property value, the same
way `tokens.stylex.ts`'s own semantic tokens compile. The compiled CSS
declares the property name; the imperative call keeps supplying its value at
runtime, unaffected by the compile step.

**D5: `.canvas-group-name` finishes converting this phase, closing phase 3's
D2 deferral, rather than becoming a third permanent literal exception.**
`.canvas-group-name` has exactly two consumers in the repo (confirmed by a
repo-wide grep): `CanvasView.tsx:1075` (this phase) and
`EditScreen.tsx:695` (phase 3's inspector group-rename `<label>`,
out of this phase's own scope otherwise). Phase 3's own design.md
deliberately left this class's two duplicate `app.css` declarations
unmerged and its `EditScreen.tsx` call site literal, "for phase 4," citing
`web-styling`'s "A shared class stays literal until its last consumer
migrates" rule (`EditScreen.tsx:158`'s comment carries the same note). A
plan that converts `CanvasView.tsx`'s call site alone, without also moving
`EditScreen.tsx`'s, would leave `EditScreen.tsx` as a still-unconverted
consumer — the shared class must then stay literal, per that same rule,
and deleting its `app.css` rule (as every other rule this phase touches
does) would strip the group-rename label's `cursor: grab` and font styling
with no test catching it.

`EditScreen.tsx`'s own code comment already documents that its `<label>`
reads only the `cursor: grab` half of the three declarations
`.canvas-group-name`'s rule blocks carry (`font-family`/`font-size`/`fill`
are SVG `fill`-based and meaningless on an HTML `<label>`). This change
therefore also folds `cursor: "grab"` into `EditScreen.tsx`'s existing
`canvasGroupNameField` `stylex.create()` entry — a one-property, one-file
addition to an already-compiled style object, not a new migration surface
— and drops the literal `canvas-group-name ` prefix from that one
`className`. `CanvasView.tsx`'s own `<text>` then converts the full rule
(cursor, font-family, font-size, fill, plus the collapsed-state variant,
driven by the same `group.collapsed` boolean as D3 case 3) to its own
independent compiled style, since no other file references the literal
string once this lands. `app.css` therefore ends this phase exactly the
way phase 1-2 precedent expects: its two permanent survivors, nothing more.

*Alternative considered*: leave `.canvas-group-name` a third permanent
literal exception, the way `.btn` stays deferred past every phase that
doesn't touch its last caller. Rejected — unlike `.btn` (over 100 call
sites across many files, no single phase owns "the last one"),
`.canvas-group-name` has exactly one remaining literal call site outside
this phase's own file, it is one property, and no future phase is planned
to pick it up (`ROADMAP.md` names no phase 5). Deferring it again would
convert a two-file, one-property, phase-3-flagged cleanup into permanent,
unowned debt for no reason beyond staying inside the task's literal file
list.

**D6: The two CSS-text tests are deleted, not adapted.** `test/preload-stylex.ts`
maps each top-level `stylex.create()` key to that key's own name string in
test-rendered output; it does not preserve CSS property VALUES. Two tests
read `app.css`'s text directly to assert a literal property value:
`studio-canvas-fit.test.ts`'s `describe("canvas fit: the clipping surface", ...)`
block, and one `it` block inside `studio-canvas-node-a11y.test.tsx` that reads
`.canvas-group-disclosure {`'s declared properties. Both go, and their
coverage moves to `docs/browser-checks.md` as a manual probe, the same
`development-toolchain` split-rule pattern every prior phase used for this
exact defect class. Every other `it`/`describe` block in both files (the
`computeFit()`-only fit test, and every DOM-structure/keyboard/a11y test in
the node-a11y file) is unrelated to CSS text and stays, updated only where it
asserts a literal `canvas-*` class-name string that this migration changes.

## Risks / Trade-offs

[A missed class-name string dependency silently breaks keyboard focus or
Panzoom exclusion at runtime, with no type error and no test failure if the
test suite's own assertions were updated to match] → D1 and D2 above were
reached by grepping every production and test reference to each class this
migration converts, not by inspection of `CanvasView.tsx` alone; the
verification group's browser keyboard walk and drag probe are the actual
backstop, matching the task's own exit criteria.

[`stylex.when.ancestor(":focus-visible")` compiles differently than
`:hover` did in phase 2, since focus state interacts with `tabIndex`
changes this file makes on nearly every keyframe of a drag] → the real
build plus a real-browser keyboard walk in both Chromium and Firefox (this
phase's own exit criterion) catches a compile-time or runtime divergence
before archive; no separate isolated-transform check is warranted for a
construct already proven in this codebase.

[Deleting the two CSS-text tests loses regression coverage for the exact
property values they asserted, until a human next runs the manual browser
probe] → this is the same trade-off every prior phase accepted for this
defect class, and `docs/browser-checks.md`'s existing structure already
carries several such probes for phases 1-3; this phase adds one more in the
same place.

## Migration Plan

No runtime data, no schema, and no HTTP surface changes. This is a pure
frontend refactor: convert the CSS, update the two string-dependent
selectors and one ref-based check, update or delete the affected tests, and
verify. Rollback is `git revert` of this change's commits. Phase 3 proved
(`stylex-phase-3-studio`'s D14) that no file outside `canvas/` reads a
`.canvas-*` class for its own five `.canvas-inspector`/`.canvas-selection*`
rules; this phase's own repo-wide grep (D5) confirms the same holds for
every other canvas-prefixed rule this phase converts, with `.canvas-group-name`
the sole documented exception, resolved by D5 rather than carried forward.

## Open Questions

None. Every open question this phase raised during research — the
`elementFor()` disambiguation, the `.canvas-toolbar` dependency, and which
"ancestor" rules are genuine `when.ancestor` candidates — is resolved above
as a Decision, not deferred.
