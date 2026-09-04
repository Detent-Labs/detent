## Context

See proposal.md, Why. Phases 0 through 2 sit archived now. They
settled the tooling, the token module, and the test story. They also
settled the general `web-styling` requirements this phase inherits
unmodified. Their design docs live at
`openspec/changes/archive/2026-09-03-stylex-phase-0-tooling/design.md`,
`.../2026-09-03-stylex-phase-1-form-ui/design.md`, and
`.../2026-09-04-stylex-phase-2-areas/design.md`.

This change's own audit measured the real scope. Phase 0's original
estimate did not. `packages/web/src/areas/studio/app.css` holds 364
distinct rule blocks in total.

About 55 of those carry a `.canvas-*` prefix. Those belong to
`canvas/CanvasView.tsx`, phase 4's own scope. There is no separate
canvas stylesheet, so phase 4 shares this file too. The remaining
~305-309 rule blocks are this phase's own scope. That number sits
close to phase 0's original estimate.

Non-canvas files carry about 596 `className` attributes in total,
across roughly 26 files. That count includes every class prefix this
phase touches: `studio-*`, `condition-*`, `field-*`, `step-*`,
`data-source(s)`, `instance-query-*`, `action-*`, and a handful of
single-word classes like `badge`, `contract-panel`, `issue-list`.

An initial pass counted only 357 sites, `studio-*`-prefixed alone. The
full count runs higher. Several panels use a bare, non-`studio-`
class name instead.

`ConditionBuilder.tsx`'s `condition-*` family is one example.
`FieldValidationEditor`'s `field-validation-*` family is another.
Phase 0's own "about 750" estimate sits above both measurements. As in
phase 2, this design uses the measured count.

Three patterns in this phase's files did not exist in any earlier
phase.

The first is `.studio-dialog::backdrop`, at `app.css:891`. It styles a
native `<dialog>` element's backdrop. Four dialogs use it.

Two sit in `panels/ProcessHeaderBar.tsx`: publish-confirm and
discard-confirm. Two more sit in `screens/ProcessesScreen.tsx`:
promotion-preview and start-picker. Each opens through
`ref.current.showModal()`. This is a first use of `::backdrop` for
this repo's StyleX adoption.

The second is a pair: `.studio-form-canvas[data-columns="2"]` and its
child `[data-span="2"]` selector, at `app.css:2070` and `:2076`. Both
render from `screens/FormEditorScreen.tsx:501` and `:522`. Both match
`form-ui`'s own `FieldForm.tsx` columns/span pattern exactly. Phase 1
already solved that pattern. This phase gets a second call site for
free.

The third is two classes crossing the canvas boundary. This phase's
own scope cuts right through it.

One is `.canvas-group-name`, declared twice in `app.css`. It has two
consumers: `canvas/CanvasView.tsx`, out of scope, and
`screens/EditScreen.tsx`, in scope. The in-scope one is the
inspector's own group-rename label.

Seven more classes live in `app.css` too, but `canvas/EditRail.tsx`
alone renders them: `.studio-rail`, `.studio-rail-count`,
`.studio-rail-row`, `.studio-rail-section`, `.studio-palette-entry`,
`.studio-palette-ghost`, `.studio-palette-list`. All seven belong to
phase 4's scope. That holds despite the `studio-` prefix, and despite
sitting in this same file.

A different, in-scope component uses a similar name:
`screens/PanelsScreen.tsx`'s own index rail. Its classes are
`.studio-panels-rail`, `.studio-panels-rail-entry` and
`.studio-panels-rail-field`. Do not confuse the two.

Duplicate rule declarations turn up five total. This design found them
with the same grep pipeline phase 2 used, over the file's rule blocks:

```
git show HEAD:<file> | grep -oP '^[^{]+(?=\{)' \
  | sed 's/[[:space:]]*$//' | sort | uniq -c | sort -rn | awk '$1>1'
```

Three of the five sit in this phase's scope and need D6-style manual
merging. They are `.studio-matrix-row-header` (`FieldMatrixGrid.tsx`),
`.studio-form-card-body` and `.studio-form-canvas-tail` (both
`FormEditorScreen.tsx`). The other two, `.canvas-group-name` and
`.canvas-edge-focus-halo`, are canvas scope. Leave them for phase 4.

Two more classes, `.btn`/`.app-back` in `tokens.css`, sit outside this
design's scope. That matches every prior phase's own call. 111 sites
in this phase's own files use them. `canvas/CanvasView.tsx` also still
uses `.btn` and `.btn-secondary`. So the family stays deferred past
phase 3 too.

## Goals / Non-Goals

**Goals:**

- Every non-canvas studio file compiles from typed StyleX style
  objects, reading `form-ui/tokens.stylex`. The rendered result
  matches the deleted stylesheet declaration for declaration.
- A real build verifies `::backdrop` first. That happens before any
  dialog conversion task depends on it. This follows `web-styling`'s
  "A phase verifies an unproven compiler feature against a real build
  first" requirement.
- A real keyboard walk covers the form editor, the panels screen, the
  dock, and all four dialogs. It confirms this phase's own stated exit
  criterion: "Keyboard walks unchanged."

**Non-Goals:**

- Migrating any file under `packages/web/src/areas/studio/canvas/`.
  That is phase 4's scope, entirely untouched here.
- Migrating `.canvas-group-name` or the seven `EditRail.tsx`-only
  classes named above. `app.css` carries them, but this phase leaves
  them alone.
- Migrating `.btn`/`.app-back`. `canvas/CanvasView.tsx` is still an
  unconverted consumer.
- Any behavior change. A dialog's focus-trap, its backdrop-dismiss,
  the keyboard traversal, and every existing requirement's runtime
  behavior stay exactly as they are. Only the styling mechanism
  changes.

## Decisions

**D1. `.btn`/`.app-back` stay deferred, unchanged from every prior
phase's call.** `canvas/CanvasView.tsx`, out of this phase's scope,
still renders a plain `className="btn btn-secondary"` string.
Migrating the family now would delete the CSS rule that string depends
on. The family moves together with whichever phase converts its last
caller. Phase 4 touches `CanvasView.tsx`, so that phase should do it.

**D2. `.canvas-group-name` stays literal.** `EditScreen.tsx` needs its
own compiled style alongside it. String concatenation composes the
two. This follows `web-styling`'s "A shared class stays literal until
its last consumer migrates" rule. Only `.btn` exercised that rule
before now.

`EditScreen.tsx`'s own `stylex.props(...)` calls handle the rename
input's other properties. They compose with the literal class the same
way `.btn` composes elsewhere:

```
className={`canvas-group-name ${stylex.props(styles.x).className}`}
```

They never compose through `stylex.props` itself. That function does
not accept a literal string argument.

**D3. A closed, small attribute value becomes a ternary.** An
exhaustive `Record` also works. Only a genuinely open-ended value gets
a `Partial<Record>` with a neutral fallback.

Phase 2's own `openspec-verify-change` pass caught a real mistake
here. It defaulted every status/kind value to the open-ended pattern.
Some of those types stayed closed, not open-ended at all. This phase
inventories every `[data-*]`/`[aria-*]` selector in `app.css` first,
rather than default to one pattern.

- `FieldMatrixGrid.tsx`'s `CellState` type has three closed values:
  `"hatched" | "blank" | "live"` (`fieldMatrixLogic.ts:54`). `app.css`
  styles only `hatched` and `live`. `blank` gets no extra rule. This
  becomes an exhaustive `Record<CellState, StyleXStyles | undefined>`.
  An equivalent two-armed check also works. Neither needs a
  `Partial<Record>`. TypeScript already forces every `CellState` case
  to get considered.
- `data-depth="1"` sits on both `.studio-matrix-row-header` and
  `.studio-panels-rail-field`. In practice it is a boolean check: depth
  one, or not. It reads from a numeric `row.depth` or similar. This
  becomes a plain ternary keyed on `depth === 1`, not a lookup.
- Every `[aria-selected="true"]`/`[aria-pressed="true"]`/
  `[aria-expanded="true"]`/`[aria-disabled="true"]`/
  `[aria-current="true"]` selector is a two-value boolean state. A
  component already sets the ARIA attribute that carries it. Each
  becomes a plain ternary too.
- `.studio-form-canvas[data-columns="2"]`/`[data-span="2"]` follows
  phase 1's own precedent exactly (D5 below).
- This phase's own files hold no genuinely open-ended status or kind
  value. None runs past a handful of outcomes. None grows without
  limit. A later task may still find one this design missed. That task
  then follows phase 2's `Partial<Record>`-with-neutral-fallback
  pattern instead, and adds a note here recording where.

**D4. A real build verifies `::backdrop` first.** A literal-CSS
fallback stays ready if it fails. No dialog conversion task assumes
`::backdrop` works before that check runs. This is the same discipline
phase 2 applied to `:popover-open`/`when.ancestor`.

Two checks run. One is an isolated `@stylexjs/babel-plugin` transform
script. It gets written to the repo root, then deleted. It confirms
the compiler emits a working `::backdrop` rule. The other check opens
a real production build in a browser, with an actual dialog open. It
confirms the rule paints too.

Task 2.1 runs both checks. No task from 2.2 onward touches a dialog
file first. If a check fails, `.studio-dialog::backdrop`'s one rule
stays a literal, unhashed residual class. That is the same fallback
`web-styling` names for a failed first-use feature.

**D5. `.studio-form-canvas[data-columns="2"]`/`[data-span="2"]` reuses
`form-ui/FieldForm.tsx`'s own columns/span pattern exactly.** Same
component-side parameterized-style-function shape. Same reasoning too.
The component picks its style in code, from a value it already
computes.

It MAY still render the same `data-*` attribute as a plain fact. A
test or another consumer can read it there. No stylesheet selects on
it after migration. This is `web-styling`'s own "A DOM-attribute
variant becomes a code-side style choice" requirement.

**D6. Three duplicate declarations merge into one `stylex.create`
entry each.** `.studio-matrix-row-header`, `.studio-form-card-body`
and `.studio-form-canvas-tail` each carry two source declarations. Both
rely on cascade order today. Each merges its non-conflicting, additive
properties into one object instead. This is the same pattern phase 2's
D12 established.

**D7. One delta spec covers each capability, not one per file.**
Studio's specs sort by behavior capability. They do not sort by screen
or file. Take `studio-canvas` as an example. It documents the
process-identity header bar and the inspector's Paths and Timers tabs.
Yet `ProcessHeaderBar.tsx`, `StepsPanel.tsx` and `PathsPanel.tsx` all
sit outside `canvas/`.

Nine capabilities each gain one or more "renders from compiled styles"
requirements.

- `studio-app` is the broadest. It covers the panels screen, the field
  catalog, the field matrix's toolbar and legend, and the data sources
  panel. It also covers the process list and its two dialogs, the
  templates screen, the versions screen, and the content-locale
  switcher.
- `studio-canvas` covers the header bar and the dock's layout. It also
  covers the inspector's own chrome: `StepsPanel.tsx`'s identity zone,
  behavior-zone tab list and diagnostics drawer. Its Paths and Timers
  tabs round that out. `CanvasView.tsx` and `EditRail.tsx` themselves
  stay untouched. `StepsPanel.tsx`'s own requirement was missing from
  an earlier draft of this design. It gained one in review, before
  apply started.
- The rest are `studio-checks-rail`, `studio-form-editor`,
  `studio-publish` (the publish-confirmation dialog specifically),
  `studio-json-view`, `studio-player`, `studio-tools`, and
  `studio-migration-plan-form`.

A handful of files this phase touches sit inside a broader
capability's own UI. Each has no dedicated capability of its own:
`ActionListEditor.tsx`, `SubprocessSpecEditor.tsx`, `ContractPanel.tsx`,
`TimersPanel.tsx`, and several `panels/shared/*.tsx` components.

Their own narrow capabilities cover a mechanism constraint instead,
not visual rendering. `field-expression-map-consolidation` is one
example. Their styling migrates as part of whichever broader
capability's delta covers the screen they render inside.

**D8. Verification adds a real keyboard walk.** This goes beyond
phases 1 and 2's computed-style checks. "Keyboard walks unchanged" is
this phase's own stated exit criterion. This is the first phase where
keyboard traversal is itself the thing under test.

Task 8.5 does the walk. It Tabs through the form editor's field list
and its column-count toggle. It Tabs through the panels screen's index
rail into the open view, and through the dock's tab row. A structured
rail, a tab row, and a modal dialog each get walked, not just
measured.

The same task opens and Escape-closes each of the four dialogs. That
confirms focus returns to the trigger. It also confirms the backdrop
dismisses on an outside click, wherever the `onCancel` wiring already
provides that.

**D9. Per-file duplication of near-identical style shapes stays the
norm.** No shared cross-file styles module gets introduced here.
`.studio-dialog`'s shape is one example: it already appears
near-identically in both `ProcessHeaderBar.tsx` and
`ProcessesScreen.tsx`.

This matches `design-language.md`'s own "duplicate on purpose" rule.
It also matches every prior phase's own call. One standing exception
exists, `navStyles.ts`. It stays unchanged and untouched here.

**D10. `.studio-dock-body .studio-matrix-scroll` keeps `.studio-dock-body`
alive as a literal hook class on the DOM element, independent of
`app.css`'s own deletion schedule (D11).** This descendant rule caps
`FieldMatrixGrid.tsx`'s own scroll box at 15rem, shrunk from its 32rem
default, only while it renders inside the dock. `FieldMatrixGrid.tsx`
stays unconverted until Group 6, so `.studio-matrix-scroll` keeps
rendering as a literal class until then. Compiling away
`.studio-dock-body`'s own literal name from the rendered DOM in Group 3
would break the descendant match immediately, three groups before the
file on its other end migrates — regardless of whether the CSS text
backing it still sits in `app.css` or not.

Group 3 converts `.studio-dock-body`'s own properties
(`max-height`/`overflow`/`margin-top`) into a compiled style, and
composes it alongside the retained literal string on the element
itself, the same way D2 composes `.canvas-group-name`:

```
className={`studio-dock-body ${stylex.props(styles.dockBody).className}`}
```

Group 6 drops that literal composition, once `FieldMatrixGrid.tsx`
compiles its own scroll box and can size it from a prop instead of a
descendant selector.

**D11. `app.css` sheds every non-canvas rule in one pass, in Group 9,
not incrementally per group.** Audit found far more of D9's
near-identical shapes than `.studio-dialog` alone. 41 of this phase's
280 in-scope class names render in two or more files, spread across
five different groups — `.studio-empty`, the
`.studio-error-banner`/`-stamp`/`-message` set,
`.studio-diff`/`.studio-diff-<kind>`, `.studio-controls`,
`.studio-warning`, `.studio-back`, `.studio-screen`, `.studio-table`
and 32 more. Converting the file `dock/EditorDock.tsx` renders in
Group 3 does not make `.studio-empty`'s source rule dead: six more
files across Groups 4 and 8 still render that literal class until
their own turn comes.

A per-group "delete the migrated rules" task, scoped to only that
group's own files, cannot tell a truly dead rule from one four other
groups still depend on without re-deriving this whole audit at every
step. Deleting nothing keeps every group's own verify step
(`bun run build`) meaningful — an unused rule sitting in `app.css`
breaks no build — and moves the one delete-everything pass to a point
where it is safe by construction: after Group 8 finishes, no
non-canvas file renders a literal class from `app.css` at all, so nothing
remains to protect. Task 9.1 confirms that first (the old task 9.2),
then task 9.2 deletes every non-canvas rule in `app.css` in one pass
and confirms the count (the old task 9.1's own check moves after the
deletion it used to only describe).

Each file still gets its own local `stylex.create` entry per shape
(D9); no shared module appears anywhere. This decision only changes
when the now-dead source CSS leaves the file, not how many times its
shape gets defined in code.

## Risks / Trade-offs

- [`::backdrop` does not compile or paint as designed] → D4's
  real-build check runs first, with a literal-CSS fallback plan
  already named.
- [A `CellState`/`data-depth` case looks closed but has a reachable
  open branch] → task 3.x re-audits it first. That re-audit covers
  `FieldMatrixGrid.tsx`'s own group, before writing any style for it.
  Phase 2 re-verified its own duplicate-declaration list the same way,
  per area, before starting each group.
- [Nine delta specs is a lot for one change to track] → each spec adds
  exactly one requirement. Each follows the exact wording pattern
  phase 2 established. `openspec-review-change` checks every
  MODIFIED/ADDED header against its base spec before apply starts.
- [A keyboard-walk regression is easy to miss in a computed-style-only
  check] → D8 makes the walk itself a task. That task runs against the
  production build. It is not inferred from a passing unit test.

## Migration Plan

This is one OpenSpec change. It follows phase 2's own D8 precedent
against splitting. The propose-review-apply-verify-archive overhead
would otherwise pay four or more times, for no independent-review
benefit. Each task group below already forms its own commit boundary
too. A mid-flight split would cost little if this change proved
unwieldy in practice.

Order matters here. Pre-flight audit and the `::backdrop` real-build
check come first (D4), since later dialog work depends on its
outcome. The dock comes next, then the four dialogs.

The panels-screen family follows: field catalog, field matrix, data
sources, contract, checks rail. The form editor comes after that.

The remaining screens close out implementation: process list,
versions, templates, player, tools, migration plan. Cleanup, docs, and
verification close the change itself. That matches phase 2's own
group shape.

Rollback: each task group is its own commit. A group found unwieldy or
wrong reverts with `git revert`, on that group's own commit range.
Every earlier group's work stays intact. That is the same rollback
shape phase 2 used.

## Open Questions

(none. Every question this phase raised gets an answer above. D7
answers the capability-routing question. This phase's own measured
audit answers the `:popover-open` scope question, confirmed in
proposal.md's Why.)
