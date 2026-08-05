## Context

See `proposal.md` for the motivation. Today `EditScreen.tsx` renders
`EditorArea`. `EditorArea` stacks `FieldCatalogPanel`, `DataSourcesPanel`,
and `ContractPanel` above `CanvasView`. `StepsPanel` mounts as a
fixed-width inspector column beside the canvas. `StepsPanel` already
nests `PathsPanel` per step. It drives an accordion off canvas selection
(`studio-canvas`'s "Selecting a node or edge expands its detail"
requirement).

The codebase already has one native `<dialog>` pattern for a studio
modal: `StartPickerDialog` and `PromotionPreviewDialog` in
`ProcessesScreen.tsx`. Both hold a `useRef<HTMLDialogElement>`, call
`showModal()` on mount, and wire the `<dialog>`'s own `onCancel` for
Escape. This change reuses that pattern. It does not invent a second one.

## Goals / Non-Goals

**Goals:**
- Move the three panels into one modal without changing what they
  validate, mutate, or persist.
- Keep canvas selection and inspector selection as one selection.
- Reuse the existing native `<dialog>` pattern, not a new modal library.

**Non-Goals:**
- No change to the draft persistence model, the revision-based optimistic
  concurrency, or the Save/Discard/Publish toolbar's own behavior.
- No change to `packages/form-ui` or any other studio screen: D5 JSON,
  D6 versions, D7 migration plan, D8 player.
- No new schema field. Layout-only fields for a step's view belong to a
  separate change (`view-layout-and-form-editor`).

## Decisions

**Decision: one modal component, three views.**
A single `EditPanelsModal` component renders the `<dialog>` and the
rail. It renders whichever of `FieldCatalogPanel`, `DataSourcesPanel`, or
`ContractPanel` is open.

All three panels read the draft through `useDraft()` and take no draft
props today. The field catalogue and contract panels take zero props at
their mount site. The data sources panel takes only `token`.

`EditPanelsModal` renders inside the same `DraftProvider`, so it
threads no draft state either. It passes `token` through, and nothing
else. Each panel's own props stay unchanged.

*Alternative considered:* three separate dialogs, one per panel. This
change rejects that option. The rail's cross-view navigation would then
need to close one dialog and open another. Jumping from Fields to
Contract would flash the backdrop and lose focus twice.

**Decision: the rail holds view selection as component state.**
`EditPanelsModal` holds `openView: "fields" | "dataSources" |
"contract"` in `useState`. Whichever toolbar link opened the modal
seeds it.

*Alternative considered:* put `openView` in the route, for example
`?panel=fields`. This change rejects that option too, matching the
proposal's resolved question. No existing studio route carries
sub-panel state. A modal that always opens fresh from its toolbar link
needs no shareable deep link today.

**Decision: the accordion becomes a section index that scrolls, not a
modal trigger.**

`StepsPanel` covers a step's own sections. They are identity (key,
label, description, type, terminal), assignment, paths, timers, actions,
subprocess spec, and view. These stay docked beside the canvas. The
shared modal never opens them.

The assignment section keeps its `assignmentWarning` rendered beside the
editor. `studio-app`'s no-assignment-warning requirement puts it there,
so the section index must not drop the section that anchors it.

Instead of expanding every section inline at once, `StepsPanel` renders
a compact list of sections with their entity counts. Choosing one
scrolls to and expands that section beneath the canvas, the same target
the old accordion already rendered. Only the summary above it changes.

**Decision: three toolbar links open the shared modal, independent of
step selection.**

`FieldCatalogPanel`, `DataSourcesPanel`, and `ContractPanel` cover the
whole process, not one step. They do not belong in a per-step section
index. The screen renders three links instead: Fields, Data sources,
Contract, at the top of the Structure surface. Each opens
`EditPanelsModal` straight to its own view, whether or not the author
has selected a step on the canvas.

The links sit inside the Structure branch, not beside the surface tabs.
The tabs stay on both surfaces. All three panels mutate the draft body.
`studio-json-view` requires that no draft-body-mutating control stays
reachable while the JSON surface is active. A link beside the tabs
would let an author open the modal over a live JSON textarea and
clobber it. That is the one issue the JSON surface exists to prevent.

*Alternative considered:* fold these three into the per-step section
index shown after the author selects a step. This change rejects that
option. Fields, data sources, and contract have no per-step scope.
Gating them behind a step selection would block an author from
reaching them before placing a single step.

**Decision: the rail enforces the nesting cap, not the schema.**
The two-level cap means a group field's children indent once. A
grandchild gets its own top-level rail entry instead of a deeper indent.
This stays a rail-rendering rule. `FieldDef`'s `group` nesting has no
depth limit today, and this change adds none. The rail flattens anything
past depth two into sibling entries. The underlying field tree keeps its
own shape.

**Decision: the rail counts issues per view; the index counts them per
step, not per section.**

`draft/issues.ts` already computes the issue list, and the panels
already surface it inline. The rail's three per-view counts read from
that same list, one `EntityType` each: `field`, `dataSource`,
`contract`. That keeps one source of issue truth.

The section index shows one count for the step as a whole. A per-section
count is not available. `issues.ts` declares `EntityType` as `"process"
| "field" | "dataSource" | "step" | "path" | "timer" | "action" |
"contract"`. It carries no `view`, `assignment` or `subprocess` member.
`resolveLoc` falls through to `{ entityType: "step" }` for all three.
Paths, timers and actions do have their own members, so a per-section
count there would be possible. A partial column that goes blank on four
of seven sections reads as "no issues" rather than "not measured".

*Alternative considered:* widen `EntityType` with the missing members so
every section carries its own count. This change rejects that option.
`resolveLoc` is the one place four validators' `loc` conventions get
reconciled. Widening it means re-reading all four. That is its own
change, not a side effect of a layout one.

## Risks / Trade-offs

- **Risk:** Moving three panels behind a modal adds a click. An author
  now needs it to reach a field they used to see on screen.

  **Mitigation:** The rail carries a per-view entity count, and the
  section index carries one per section. An author sees there is
  something to open before opening it. The always-visible accordion did
  not summarize that either.
- **Risk:** A native `<dialog>` traps focus. A workflow that expected to
  glance at the canvas while a panel was open no longer works. An
  example: checking a step's key while naming a field.
  **Mitigation:** This trade-off already exists for D2 and D3 today.
  The proposal accepts it as consistent with the rest of the studio's
  modal behavior. It is not a regression specific to this change.
- **Risk:** Recursion into a group field's children inside the modal
  could run deep. The two-level cap might then surprise an author who
  expects the child to nest, not relocate to the rail.

  **Mitigation:** The rail always shows the field's own name at
  whatever level it renders. The relocation stays visible, never silent.

## Migration Plan

No data migration applies. This is a frontend-only change with no draft
schema change. An in-progress draft renders identically before and
after deployment. Roll out as a normal `packages/web` build and deploy.
Rollback means redeploying the previous build.

**This change archives before `view-layout-and-form-editor`.** Both
carry a MODIFIED block for one `studio-canvas` requirement. That
requirement is `Selecting a node or edge expands its detail in a
permanent inspector beside the canvas`. The other change wrote its
block against this one's merged text. It keeps the scroll behavior
below and adds one exception for the view entry.

Archiving in the other order merges a requirement describing a section
index the live spec does not have yet. This change would then overwrite
that exception.

## Open Questions

None. The proposal resolved both questions the source wireframe left
open. It resolved URL state for the open rail view, and whether JSON
becomes a fourth rail entry.
