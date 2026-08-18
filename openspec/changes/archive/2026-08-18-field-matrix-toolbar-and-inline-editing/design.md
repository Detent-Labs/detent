## Context

See `proposal.md` for the motivation. The state this design has to work
with:

- `FieldMatrixPanel.tsx` renders the grid today. `fieldMatrixLogic.ts`
  carries its pure row/column/cell derivation (`matrixRows`, `cellState`,
  `cellEntry`, `liveCellSummary`). That split keeps the logic out of
  React, for testability. This change extends both files. It replaces
  neither.
- `draft/view-flags.ts` carries `FLAG_DEFAULT`, `effectiveFlag`,
  `setFlag`, `gatedKeys` and `checkViewFlags`. Every write this change
  makes goes through `setFlag`, unchanged. Every gating rule this change
  enforces reads `gatedKeys`, unchanged.
- `panels/shared/BooleanOrExpressionInput.tsx` already renders one flag
  as a boolean-or-CEL control. `FormEditorScreen.tsx`'s strip already
  wires three of these to `setFlag`, for one step's selected view row.
  This change wires the same three controls per live cell. Today it
  wires them once per selection.
- The reference mockup lives at
  `tmp/field_matrix_ui_starter/Field Matrix.dc.html`, built for the
  archived change `2026-08-15-studio-field-matrix`. Its fixture data
  (`FIELDS`, `STEPS`, `ENTRIES`) checks against
  `examples/purchase-requisition.json`: 22 fields, 13 steps, 54 view
  entries.
- `examples/purchase-requisition.json` declares exactly one
  `type: "group"` field, `line_item`. The mockup's `FIELDS` fixture
  tags every field with a section label too ("Request", "Vendor",
  "Decision", and seven more). Only "Line item" traces to a real
  catalog structure. The rest are mockup-only annotations.
- `FieldMatrixPanel` mounts twice today: from
  `panels/screens/PanelsScreen.tsx`, and from
  `dock/EditorDock.tsx`'s Field matrix tab. It takes no props at
  either call site. `openspec/specs/studio-canvas/spec.md`'s "The dock
  offers three tabs, one active at a time" requirement already covers
  it. The Field matrix tab offers no filter. The dock never grows to
  fit its content. `docs/decisions.md` records that as a deliberate
  choice, not an oversight.
- `openspec/specs/spa-accessibility/spec.md`'s "A two-dimensional data
  grid uses roving-tabindex grid semantics" requirement already covers
  this exact grid. The grid is one stop in the page's tab order. No
  cell takes its own stop. `FieldMatrixPanel.tsx`'s own
  `onGridKeyDown` already handles Enter, Space and Escape on a focused
  cell. Today, Enter or Space opens the below-grid editor.
- `draft/store.tsx`'s `mutate` runs `structuredClone` over the whole
  draft body, once per call. The draft's `validation` recomputes on
  every distinct `mutate()` call. `FieldMatrixPanel.tsx`'s existing
  `writeFlag` calls `mutate()` once per flag write, not once per batch.
- `packages/web/src/i18n/catalogs/studio.ts` carries English only.
  `.claude/rules/design-language.md` states this directly, and
  `catalog.ts`'s `t(key)` takes no locale argument.

## Goals / Non-Goals

**Goals:**

- Bring every piece of the approved chat design into the existing grid:
  - the toolbar (inert-column toggle, count line, legend)
  - richer column and row headers
  - per-cell inline controls
  - bulk row/column toggles
  - the flagged-cell marker
- Keep the grid keyboard-operable throughout. A sighted mouse user and a
  keyboard-only user reach every control the change adds.

**Non-Goals:**

- No new schema field, no new persisted shape. The user confirmed this
  scope directly. Matrix row banding stays limited to genuine
  `type: "group"` catalog fields. The mockup's other section labels
  ("Request", "Vendor", "Decision", ...) do not appear.

  They name no catalog structure `definition.ts` declares. Reproducing
  them would need a new field-level property, plus its own migration
  story. This change does not open either.
- No change to `view.fields[]` membership, order, `group` (the existing
  per-step presentation grouping key) or `span`. Those stay the form
  editor's job, per ROADMAP stage 41's existing decision.
- No change to `setFlag`'s write semantics, `checkViewFlags`'s finding
  rules, or `gatedKeys`'s gating rules. This change adds a new layer
  over those primitives. It does not change them.

## Decisions

### 1. Row grouping stays exactly what the current spec already describes

The mockup's "REQUEST" / "LINE ITEM" / "VENDOR" banners do not carry
forward. The field catalog's existing `type: "group"` rows (today,
`line_item` alone) keep their current distinct row style. Every other
field keeps drawing in flat catalog order. That is exactly what the
unmodified requirement "The field matrix lists every catalog field
against every workflow step" already states. This delta spec leaves
that requirement's row-order behavior untouched.

Alternative considered: add a `section` string to `FieldDef`, purely to
render matrix banners. Rejected. It would touch `definition.ts`. It
would need a compile-time check.

It would need `docs/authoring-guide.md` changed in the same commit. All
of that for a grouping the mockup itself invented, rather than drew from
the schema. The user confirmed skipping it.

### 2. Inline controls reuse `BooleanOrExpressionInput`, not a new control

Each live cell's three controls are three `BooleanOrExpressionInput`
instances. That is the same component `FormEditorScreen.tsx`'s strip
already uses. It keeps CEL-vs-boolean behavior, `setFlag` writes and
default handling in one place.

The alternative was a matrix-only lightweight checkbox that
write-throughs to `setFlag` directly. It would duplicate the CEL-toggle
affordance `BooleanOrExpressionInput` already owns. It would drift from
that component the next time it changes.

The below-grid editor's removal follows directly. Every live cell now
carries its own controls. The old editor would only duplicate them, one
selection at a time. `packages/web/src/areas/studio/panels/shared/`
keeps the shared component. Only the below-grid mount goes away, now
inside `FieldMatrixGrid` per Decision 6.

### 3. Bulk toggles compute their own "all eligible cells agree" state per render

A column's or row's badge reflects one fact: whether every eligible
cell already carries that flag's non-default value. Eligible here means
live, non-CEL, not gated. The mockup derives its own
`visOn`/`reqOn`/`roOn` badges the same
way. This is a pure function of the current grid state.
`fieldMatrixLogic.ts` computes it alongside the existing cell
derivation. It never drifts from what the cells themselves render.

Clicking a badge iterates its column's or row's eligible cells. It
calls `setFlag` once per cell. All of those calls sit inside one
`mutate()` call: one recipe that loops over every eligible cell. It is
not one `mutate()` call per cell.

That matters because `mutate` clones the whole draft body per call.
The Context section above states this. A row of up to 13 cells calls
`structuredClone` once for the whole batch. That is the same cost as
any other single write, not 13 times the cost.

That matches the mockup's `bulk()` exactly in effect. N flag writes
become one state transition. `writeFlag` uses a different pattern
today for a single cell. It calls `mutate()` per write. The bulk
apply function must not copy that pattern into a loop.

### 4. Keyboard operability: the grid stays one tab stop; activation opens its cell's three controls

The first draft of this design gave every cell's three controls a
real tab stop. That happened whenever a cell held roving focus. That contradicts
`spa-accessibility`'s existing rule for this exact grid. The grid
stays one stop in the page's tab order. No cell takes its own stop.
This decision replaces that draft.

Before this change, a cell was the tab stop. Arrow keys moved a
roving `tabindex` between cells. Enter or Space opened the below-grid
editor for the selected cell. Escape did nothing, since no cell held
an open state of its own.

After this change, arrow keys still move one roving stop between
cells. That alone opens nothing, and adds no tab stop.

Enter or Space, on a live cell, activates it instead. Activation
replaces the below-grid editor as what that keypress does. An
activated cell's three controls become the only reachable tab stops.
They take the grid's own stop's place, until the cell deactivates.
Escape deactivates the cell and hands the one stop back to the grid.
So does moving focus away from the cell by any other means.

This keeps the grid's existing keyboard contract, published in
`spa-accessibility`, unchanged. It still reaches every new control by
keyboard. Arrow keys find a cell. One keypress opens it. Tab walks
its three controls. Escape closes it.

Both the roving-focus cell and the activated cell, if one exists,
live in the grid component's own state. The panels screen keeps all
four views mounted across a switch. The base "The panels screen keeps
every change and states so" requirement already states this. Neither
state unmounts, so switching away and back needs no extra code to
keep either one. The delta spec's "Switching views keeps the field
matrix's selected cell" scenario names both explicitly.

The mockup's raw markup remains the one departure this design does
not carry forward. Its checkboxes carry no `tabindex` management at
all. A keyboard user tabs through up to 162 raw stops to cross the
grid once. The `design.md` for `2026-08-15-studio-field-matrix`
already named that same departure, for the same reason.

### 5. The flagged-cell marker shares `checkViewFlags`'s written-field computation instead of approximating it

The first draft of this design named two conditions for the flagged
marker: `required` while hidden, and `required` together with
`readonly`. `checkViewFlags` (`draft/view-flags.ts:82-150`) checks a
third thing before the second condition fires. It checks whether some
other source in the draft already writes that field. It also skips
every group field outright, on both conditions.

Naming only two conditions would mark a cell `checkViewFlags` does
not flag. Four sources can already write that field:

- an action output
- a subprocess output mapping
- a data source column mapping
- a contract input field

This decision replaces that first draft.

`checkViewFlags` builds a `written` set inline today. It gathers every
field id an action's `output`, a step's `subprocess.outputMapping`, a
field's `columnMapping`, or `contract.inputFields` supplies a value
for. This change extracts that computation into its own function,
`writtenFieldIds(body): Set<string>`, in `draft/view-flags.ts`.
`checkViewFlags` calls it instead of building the set inline. Its own
behavior and its two message strings stay unchanged.

`fieldMatrixLogic.ts` exposes a pure predicate over one live cell. It
calls `writtenFieldIds` once per render, not once per cell. It applies
`checkViewFlags`'s exact three-part test, in order:

1. skip the cell if its own field is a group field
2. flag it if `required` while hidden
3. flag it if `required` together with `readonly`, and absent from
   the written set

This predicate does not run the full draft-wide check per cell. It
shares the one expensive part, the written-set computation, instead
of reimplementing it.

`checkViewFlags` already runs once per render, for the rail's issue
count. This change does not touch that call, beyond routing it
through the extracted function. A render still runs `checkViewFlags`
exactly the once it already does. It now also runs `writtenFieldIds`
a second time, once for the flagged-marker predicate.

### 6. The grid splits from its panels-screen chrome, so the dock keeps its own contract

`FieldMatrixPanel` mounts twice today, per the Context section above.
One mount is the panels screen. The other is the canvas dock's Field
matrix tab. Every piece this change adds under Decisions 1 through 3
belongs to the panels screen alone. That is the toolbar, the count
line, the legend, and the bulk badges.

`studio-canvas`'s own requirement already forbids a filter on the
dock's Field matrix tab. It also forbids a dock that grows to fit its
content. Adding the new chrome to `FieldMatrixPanel` directly would
reach the dock mount too. It would break both rules there.

This design splits the component instead of changing that rule. A
bare grid component carries the header content, the cell rendering,
and the keyboard model from Decision 4. A new panels-screen wrapper
component carries the toolbar, the legend and the bulk badges. It
renders the bare grid inside itself. `screens/PanelsScreen.tsx` mounts
the wrapper. `dock/EditorDock.tsx` keeps mounting the bare grid
directly. It gains only the inline per-cell controls from Decision 2
and the flagged-cell marker from Decision 5.

Alternative considered: pass a `showToolbar` prop to the one existing
component. Rejected. It would let a future call site opt into the
toolbar by accident. That is exactly the kind of silent reach this
split exists to prevent. A split component closes off that mistake.
The dock mount has no toolbar to render, because it never imports the
wrapper.

## Risks / Trade-offs

- **A full-catalog bulk toggle writes up to 162 flags** → Decision 3
  requires one `mutate()` call for the whole batch, not one per flag.
  Written the wrong way, the cost is 162 `structuredClone` calls
  instead of one. A future catalog might grow past what the reference
  process exercises. That is the place to revisit the single-batch
  design. Not before.
- **A split grid and wrapper can drift apart** → Decision 6 splits the
  bare grid from the panels-screen wrapper. A prop the wrapper needs
  might get added to the bare grid later, without updating both call
  sites. That would compile, yet silently change the dock's behavior
  too. Task 9.6's browser check covers the dock explicitly, for
  exactly this reason.
- **Removing the below-grid editor is a breaking UI change** → a
  mid-edit author loses that editor the moment this change ships. They
  find the same cell's inline controls instead. No persisted state is
  at stake here. The in-browser draft carries the same `view.fields[]`
  shape either way. No migration touches stored data. `proposal.md`
  already marks this **BREAKING (UI behavior)**.
- **Inline controls shrink each cell's hit area** → three input
  controls need more room than the old three-letter mark did. The
  grid's column width and row height, sized in `app.css`, change to fit
  the new content. That is a visual tuning pass during implementation,
  not a design decision that changes behavior.

## Migration Plan

This change touches no persisted shape, so it needs no data migration.
The grid still reads and writes `workflow.steps[].view` through
`setFlag`, unchanged. Deploying it replaces the panel's rendering and
interaction code only. A rollback is a plain revert of the frontend
build. No stored data changes shape, so no backward-compat shim applies.

## Open Questions

None. Decisions 1 through 6 above resolve every choice this change
needed:

- the row-grouping scope
- the control component
- the bulk-toggle batching
- the keyboard model
- the flagged-marker source
- the dock/panels-screen split
