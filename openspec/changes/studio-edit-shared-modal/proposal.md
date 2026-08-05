## Why

The `/studio/processes/:id/edit` screen stacks three structural panels
above the canvas: Field catalogue, Data sources, Contract. They sit
inside the Structure surface, above the canvas, not in the docked
inspector column. That column holds `StepsPanel` alone. The canvas
therefore renders last, at the bottom of a long scroll.

A wireframe review of the studio area found two costs
(`Detent Wireframes.dc.html`, frames D4/D4b). An author reaches those
three panels far less often than the canvas, yet they push it down the
page. Selecting a step also expands its whole accordion at once. The
inspector then carries every section of that step, wanted or not.

## What Changes

- Move `FieldCatalogPanel`, `DataSourcesPanel`, and `ContractPanel` out of
  their stacked mount above the canvas. Mount them inside one shared modal
  dialog. A left rail switches between the three views: Fields, Data
  sources, Contract. The modal reuses the native `<dialog>` pattern this
  codebase already uses for D2 (start picker) and D3 (promotion preview).
  The browser supplies the focus trap, Escape handling, and backdrop.
- Add three links at the top of the Structure surface: Fields, Data
  sources, Contract. Each opens the shared modal straight to its own view.
  These three panels cover the whole process, not one step. They stay
  reachable whether or not the author has selected a step on the canvas.
  The links belong to the Structure surface alone, never the JSON
  surface. All three panels mutate the draft body. `studio-json-view`
  requires that no such control stays reachable while the JSON surface
  is active.
- The rail lists the three views with their entity counts. For the Fields
  view it also lists the field catalogue itself, plus an Add entry. A
  group field's children indent under it in that list. Contract has no
  sub-list, so its rail entry shows no expansion.
- The rail caps nesting at two levels. A group field's children indent
  once. A child of a child gets its own top-level rail entry instead of a
  deeper indent.
- The modal has two chrome bars only: what is open, at the top, and one
  Close at the bottom. The modal has no Save button. Every change writes
  straight into the in-browser draft, the same way the panels do today.
  <!-- antislop: allow synonym-rotation -->
  <!-- "Discard" names the toolbar's own button, not a stylistic choice. -->
  The screen's existing Save/Discard/Publish toolbar remains the only
  control that persists. The footer states plainly that Close keeps
  every change.
- The docked inspector beside the canvas narrows from the full accordion
  to a section index for the selected step. The index lists that step's
  own sections. Those are identity (key, label, description, type,
  terminal, outcome), assignment, paths, timers, actions, subprocess
  spec, and view. It also shows their entity counts, one issue count
  for the whole step, and Remove.
- Choosing a section scrolls to and expands it beneath the canvas. That
  is the same target the old accordion already rendered, but now only
  one section expands at a time. These step-scoped sections stay
  outside the shared modal.
- The canvas moves from the bottom of a long scroll to the top of the
  editing well. It no longer shares vertical space with the three panels
  that used to sit below it.
- Each of the three modal views keeps its own in-place issue list. The
  rail's per-view counts and the section index's step issue count carry
  the same refusal tone. The rest of the studio area already uses that
  tone for issues. An author can see what is incomplete without opening
  every view. Per-section issue counts stay out of scope. `resolveLoc`
  resolves a view, assignment or subprocess-spec issue to the step
  itself. No per-section number exists yet.
- Canvas selection and inspector selection remain one selection, unchanged.
- Two questions the source wireframe left open get settled here instead of
  deferred further. The open rail view does not go in the URL. No
  existing studio route carries sub-panel state, and this change should
  not invent one just for itself. The JSON surface is the escape-hatch
  tab. It keeps its own tab beside the structure surface, instead of
  becoming a fourth rail entry. It changes the whole draft body, not one
  structural section, so the rail's per-section shape does not fit it.

This change does not touch what the panels validate, mutate, or persist.
It only changes where they mount and how an author reaches them. It makes
no schema change in `src/schema/definition.ts`, and no engine or HTTP
change.

## Capabilities

### Modified Capabilities
- `studio-app`: the "Editing is a canvas-primary surface with the
  carried-over panels as an inspector" requirement changes. Today the
  Field catalogue, Data sources and Contract panels stack above the
  canvas. After this change they move into a shared modal, reached by
  three links at the top of the Structure surface. The canvas also moves
  to the top of the editing well. A second, new requirement covers the
  shared modal's own behavior: its rail, its nesting cap, and its
  keep-every-change Close.
- `studio-canvas`: the "Selecting a node or edge expands its detail in a
  permanent inspector beside the canvas" requirement changes. Today
  selecting a step expands every section of its accordion at once. After
  this change, selecting a step shows a compact section index. Choosing
  an entry scrolls to and expands that one section.

## Impact

- `packages/web/src/areas/studio/screens/EditScreen.tsx`: reorders the
  Structure surface so the canvas comes first. It mounts the new modal
  instead of the three panels directly, and renders the three links that
  open it.
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`,
  `DataSourcesPanel.tsx`, `ContractPanel.tsx`: remount inside the new
  modal component. All three read the draft through `useDraft()` and take
  no draft props, so none of their own props change. Their field,
  validation, and mutation logic stays the same.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx`: replaces the
  accordion detail with a section index. The index lists sections, their
  counts, one issue count for the step, and Remove. Choosing an entry
  scrolls to and expands that section beneath the canvas. Every other
  section stays collapsed.
- New: a shared modal component (rail plus two-bar chrome) under
  `packages/web/src/areas/studio/`, following the existing D2/D3 native
  `<dialog>` pattern.
- New: a pure module beside `draft/issues.ts` for the rail's
  tree-flattening and its per-view issue grouping, with `bun:test`
  coverage.
- `packages/web/src/areas/studio/draft/issues.ts`: read for the per-view
  and per-step issue counts. What it computes stays the same.
- `ROADMAP.md`: stage 11b's one-line layout description.
- No change to `src/schema/definition.ts`, `src/engine/`, `src/http/`, or
  `packages/form-ui`.
