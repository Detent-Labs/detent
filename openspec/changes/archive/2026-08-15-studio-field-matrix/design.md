## Context

See proposal.md for the motivation. The state this design has to work with:

- `PanelView`/`PANEL_VIEWS` in `routing.ts` is a three-member union
  (`"fields" | "dataSources" | "contract"`). Everything that lists the
  process-wide views derives from it. That list is `matchRoute`'s
  `isPanelView` guard, `routePath`'s comment ("one of three literals, not
  user input"), and `PanelsScreen.tsx`'s `VIEW_LABEL`/`VIEW_ENTITY_TYPE`
  records. It also includes `EditRail.tsx`'s `PROCESS_ROWS`, a
  `PANEL_VIEWS.map` whose label ternary has three arms.
- `PanelsScreen.tsx` mounts all views at once and toggles `hidden`. A
  fourth view is one more `<div hidden={openView !== "matrix"}>`, plus one
  more index-rail entry. `PANEL_VIEWS.map` already renders that entry
  generically.
- `draft/view-flags.ts` (17a, shipped) carries every primitive a cell
  editor needs: `FLAG_DEFAULT`, `effectiveFlag`, `setFlag`, `gatedKeys`,
  `checkViewFlags`. `checkViewFlags`' issues carry `entityType: "step"`
  and `source: "view"`.
- `panels/shared/BooleanOrExpressionInput.tsx` already renders one flag as
  a boolean/CEL toggle. It reads `effectiveFlag` for its checkbox and
  writes through the caller's `onChange`. `FormEditorScreen.tsx`'s strip
  already wires three of these to `setFlag`, for one step's selected view
  row. The matrix needs the same three controls, wired to one (step,
  field) pair instead.
- `draft/fields.ts`'s `flattenDraftFields` gives the depth-first catalog
  order. The field catalog panel and `checkViewFlags` already share it: a
  group field, followed immediately by its children. That is the row
  order item 17b specifies. No new traversal needs writing.
- `draft/panel-rail.ts`'s `panelEntityCounts` returns one count per
  `PanelView`. `PanelsScreen`'s index rail and `EditRail`'s Process
  section both read it. `issueCountForEntityType` filters
  `validation.issues` by `entityType`. The matrix's badge cannot use that
  directly: `checkViewFlags` issues share `entityType: "step"` with every
  other per-step issue (paths, actions, timers). Filtering on that alone
  would count issues the matrix cell grid does not represent.
- A mockup exists at `tmp/field_matrix_ui_starter/Field Matrix.dc.html`
  (not vendored code, a static reference). It checks the row, column and
  cell counts against `examples/purchase-requisition.json`. Those counts
  are 22 fields (`line_item` plus its 4 children among them), 13 steps,
  54 view entries, and 3 steps with no view at all.

  The mockup also carries three departures the ledger
  (`tmp/open-work-priority.md`, item 17b) already flags as wrong. This
  design does not carry them forward. The first is row banding by
  `view.group`, instead of catalog order. The second is inline
  checkboxes in the cell, instead of a below-grid editor. The third is
  `role="grid"` with no roving tabindex (162 raw tab stops).

## Goals / Non-Goals

**Goals:**

- One more routed view an author reaches from the panels screen or the
  canvas rail. It writes the exact `view.fields[]` shape the form editor
  already writes, through the same `setFlag`.
- A grid an author can read at a glance. It shows which (step, field)
  pairs have a view entry, and what each entry's three flags currently
  resolve to.
- Full keyboard operability, per `spa-accessibility`'s existing "a canvas
  is not a substitute for a keyboard-operable panel" rule. This surface
  has no canvas equivalent to fall back on, so the first build has to get
  it right.

**Non-Goals:**

- No new persisted shape. The grid is a view over `workflow.steps[].view`
  and `fields[]`, exactly as `checkViewFlags` already reads them.
- No change to `view.fields[]` membership, order, `group` or `span`.
  Those stay the form editor's job (ROADMAP stage 41's own "answers the
  fourth point instead of paying it" decision).
- No polarity change and no new flag semantics. `visible`, `required` and
  `readonly` keep their JSON names and their `draft/view-flags.ts`
  behavior unchanged.
- Bulk row/column toggles and an inert-column filter. The mockup adds
  both. Neither is in item 17b's design. Both stay a follow-up, for if
  authoring speed on a large catalog still falls short after this ships.

## Decisions

### 1. Reuse `PanelView`, do not add a parallel route concept

`"matrix"` joins the existing `PanelView` union and `PANEL_VIEWS` array.
`matchRoute`, `routePath`, `ROUTE_ROLE.edit`, `EditorArea`'s `panel !==
undefined` branch, `PanelsScreen`'s index rail, and `EditRail`'s
`PROCESS_ROWS` all key off that union or that array. The deep link, Back,
the role gate, and both rail entries all come from the one addition.

The alternative, a sibling top-level route, would duplicate all of that.
It would also diverge from it over time. Two independent counts already
diverged that way, before `panelEntityCounts` unified them (item 6's
apply, cited in `tmp/open-work-priority.md`).

### 2. Rows are the flattened catalog, unconditionally 22 deep here

The grid's row list is `flattenDraftFields(draft.fields)`. That is the
same depth-first walk `checkViewFlags` and the field catalog panel
already use. A group field is a row like any other. Its children follow
it immediately, at one indent step, matching `flattenRailFields`'s
existing depth cap. This gives `line_item` its four children as the next
four rows, with no separate "group header" data structure.

A group row draws the same three cell states as any other row. A view
entry can name a group field directly. `FormEditorScreen`'s own palette
already allows that drop. `checkViewFlags` skips such an entry only for
its own two checks. It does not skip the entry from existence.

The cell editor therefore treats a group row like any other row. It
allows full three-flag editing, with no group-specific disabling.
`FormEditorScreen`'s strip does the same. It never special-cases a group
row's `OverrideField` controls. It omits only the span control. That
control has no matrix equivalent, since no row spans stay in this grid.

Rejected: banding rows by `view.group`.

That label is free text per view entry, not per field. The example file
alone uses ten different labels, across 14 fields that carry more than
one. A grid needs one label per row. The mockup's own banding is the
mistake the ledger already names.

### 3. Columns are `workflow.steps` in array order

No reordering, no filtering by default. A step with no `view` at all
draws as a hatched column. Every cell in it hatches, regardless of the
field row. This matches the three-step case in
`purchase-requisition.json` (`approval_routing`, `issue_po`,
`receipt_check`), and ROADMAP stage 41's own "the grid stays 22 by 13"
decision. Hiding a column would make the grid's shape depend on which
steps happen to declare a view yet. That is exactly the fact a hatched
column exists to reveal.

### 4. Three cell states, computed, not stored

- **Hatched**: `step.view === undefined`. The whole column hatches. No
  per-cell hatching exists independent of the column.
- **Blank**: the column's `view.fields` carries no entry whose `ref` is
  this row's field id.
- **Live**: an entry with that `ref` exists. The cell draws a compact
  summary of its three resolved flags (see decision 6). This is the one
  state the cell editor opens for.

No new field on `Draft` or `DraftViewField` backs this. Each cell
computes its state from `step.view` and `entry.ref` each time it draws.
That is the same read `checkViewFlags` already performs, over the whole
draft, on every keystroke. `studio-view-flags-module`'s own design, under
"Risks", already measured that walk as cheaper than the compile it
follows.

### 5. The cell editor is one editor below the grid, not per-cell controls

Selecting a live cell opens one editor region. Three
`BooleanOrExpressionInput`s drive it: `visible`, `required`, `readonly`.
This is the same component `FormEditorScreen`'s strip already wires to
`setFlag`. Selecting a different live cell swaps which (step, field)
pair the editor targets. That is the same swap the strip already makes
when the selected row index changes.

Selecting a hatched or blank cell closes the editor. Neither state names
an entry to change. `gatedKeys(entry)` disables `required`/`readonly` in
the editor whenever the cell's own `visible` is a literal `false`. The
strip does the same.

Rejected: inline checkboxes per cell (the mockup's own choice), and a
popover. A 22-by-13 grid has 286 cells. Three checkboxes in the smallest
of them lose the CEL escape hatch the JSON view depends on. They would
also need a second surface for it anyway. A popover anchored inside a
scroll region traps focus on scroll. The mockup ledger entry already
rejects this, for that reason.

### 6. A live cell's compact summary reads the resolved flags, not the raw entry

A live cell shows enough of its three flags to scan a column without
opening the editor. It carries a short mark per flag that departs from
`FLAG_DEFAULT`, plus a mark for "carries an expression". This is the
same `celMarked` computation `FormEditorScreen`'s card already makes. It
tests `isExpression` against each of `visible`, `required` and
`readonly`. It reuses a shape the sibling surface already draws. It does
not invent a second summary format for the same data.

### 7. The rail badge counts view-source issues; the rail count is the live-cell total

`PanelsScreen`'s `VIEW_ENTITY_TYPE` map cannot gain a `matrix` entry the
way `fields`/`dataSources`/`contract` did. `checkViewFlags`' two rules
report with `entityType: "step"`. Every other per-step issue already
carries that same entity type: a path's CEL issue, an action's registry
issue. Filtering the matrix's badge by entity type alone would count
every step issue in the draft. It would not isolate the view-flag
findings the grid represents.

`draft/panel-rail.ts` gains a second counting function,
`issueCountForSource(issues, source)`. It filters on `source` instead of
`entityType`. The matrix's badge calls it with `"view"`. This takes the
same shape `issueCountForEntityType` already takes, one field renamed.

`panelEntityCounts` gains a `matrix` key: the total count of
`view.fields[]` entries across every step. That is the same "54 against
286" number ROADMAP stage 41 already cites, the live-cell count. It is
the direct analogue of `fields` counting rail rows and `contract`
counting outcomes. Each existing count names how many of the view's own
entities exist, and a live cell is this view's entity.

### 8. Grid semantics and roving tabindex land in `spa-accessibility`, referenced here

The concrete `role="grid"` and roving-tabindex requirements form a
generic pattern. They are not field-matrix-specific. So they join
`spa-accessibility` as their own requirement. `studio-canvas` already
takes the same split, for the disclosure pattern. Its own text reads:
"the `spa-accessibility` capability requires that shape of every
disclosure".

`aria-rowindex`/`aria-colindex` stay out. Both exist in the WAI-ARIA
grid pattern for a grid that virtualizes its rows or columns. They let
a screen reader announce a position the DOM does not hold. This grid
renders all 286 cells at once. Native DOM order already carries that
position. The two attributes would only repeat what the markup already
says.

The field matrix requirement here states that the grid follows that
pattern. It adds only what is specific to this grid. That is a sticky
header row and first column, plus the accessible name on the scroll
region.

### 9. No inert-column filter, no bulk toggles

Both are real authoring-speed ideas the mockup adds. Neither is item
17b's design. A filter that removes hatched columns changes what "22 by
13" means per view.

A bulk toggle writes through every live cell in a row or column at
once. That is a batch mutation `setFlag`'s single-entry contract does
not cover today. Either stays a self-contained follow-up, once this
grid ships and an author has used it. Adding both now would answer an
authoring-speed question nobody has measured yet.

## Risks / Trade-offs

- **286 cells re-render on every keystroke in the cell editor**.
  `studio-view-flags-module`'s design accepted the same concern, for
  `checkViewFlags` running on every keystroke. `purchase-requisition` is
  the working tree's largest example, at 22 by 13. The walk still stays
  cheaper than the compile `runValidation` already runs after it.
  Accept. Revisit if a profile ever says otherwise.
- **A roving tabindex over 286 cells is a nontrivial keyboard surface to
  get right**. The below-grid editor adds to that. Arrow-key handling,
  `Home`/`End`/`PageUp`/`PageDown` semantics, and focus return after the
  editor closes all have to agree. The browser check (task section 12)
  walks keyboard traversal explicitly. Item 17b already marks this one
  mandatory, not optional.
- **A live cell's summary and the editor's controls must agree on
  wording**. Two summaries of the same three flags can drift apart. That
  is the exact mistake `studio-view-flags-module` closed for the
  checkbox and `checkViewFlags`. Both read
  `effectiveFlag`/`isExpression` from `draft/view-flags.ts` and
  `panels/shared/overrideMode.ts`. Neither recomputes a flag's resolved
  state on its own.
- **German column headers are step labels, `LocalizedText`, and can run
  40% longer than English** (`.claude/rules/design-language.md`). A
  column width derived from the English label would clip or overflow in
  German. Sticky header cells take a fixed width from the design
  language's spacing scale, not from measured text. The browser check
  covers German at 1280px explicitly.

## Migration Plan

None. No stored data changes, no published body changes, no
`definitionHash` movement, no new field on `Draft` or `DraftViewField`. A
draft authored before this change opens with an unchanged JSON view. The
grid is read-derived. It adds no key to what a draft round-trips today.

Rollback is a revert. The fourth `PanelView` member and its rail entries
disappear. The other three views keep their own code unchanged. Nothing
about them moves.

## Open Questions

None. Item 17b's design pass (`tmp/open-work-priority.md`) already
answered the open questions the mockup raised. Those are row banding,
the cell editor's placement, bulk toggles, and the inert-column filter.
Decisions 2, 5 and 9 above carry those answers forward.
