## Context

See proposal.md for the motivation. What the code holds today:

- `screens/PanelsScreen.tsx:102-153` renders the rail. One entry per
  `PANEL_VIEWS`, each with an entity count and an issue count. Only the
  Fields entry carries a sub-list, and it renders whatever view is open.
- The Fields sub-list lists `flattenRailFields(draft.fields)`
  (`draft/panel-rail.ts:57-67`), a depth-first walk capped at one indent
  level. Choosing a row calls `scrollToField` (`PanelsScreen.tsx:81-83`),
  which scrolls `field-row-<id>` into view. The click selects nothing.
- `panels/FieldCatalogPanel.tsx:315-324` maps every top-level field. Its
  `FieldRow` recurses into a group's children and anchors each one as
  `field-row-<id>` (`FieldCatalogPanel.tsx:99`).
- `panels/DataSourcesPanel.tsx:51-87` maps every data source. No anchor,
  no sub-rail.
- All four panels stay mounted. The screen hides three with the `hidden`
  attribute (`PanelsScreen.tsx:156-168`), so a panel's own state survives
  a view switch.
- `issueCountForEntityType` (`draft/panel-rail.ts:71-73`) counts issues by
  `entityType`. Nothing counts them by `entityId`.
- `packages/web/test/` holds no DOM test at all. Every studio test drives
  a pure module.

## Goals / Non-Goals

**Goals:**

- One entity's editor on screen at a time, for Fields and for Data
  sources.
- A rail that says which entity is open and which entities are broken.
- The area's field CSS on both panels.
- Every new rule that can be a pure function is one, with a `bun:test`
  case beside the four `panel-rail.ts` helpers already covered.

**Non-Goals:**

- A DOM or component test harness. `packages/web` has none, and this
  change is not the place to introduce one.
- Any change to `EditorIssue`, to the draft shape, or to the definition
  contract.
- Any change to the four view routes, the `hidden` mounting rule, or the
  checks rail.

## Decisions

### The screen owns the selection, one state per view

`PanelsScreen` holds `selectedFieldId` and `selectedDataSourceId`. Both
are `useState`, both start unset, and both resolve to the first entity
when unset.

The rail needs the selection to mark the open entry, and the panel needs
it to pick what to render. One owner above both is the shorter wiring.
The alternative, state inside each panel with a callback upward, gives
the rail a second copy to keep in step.

The `hidden` mounting rule already keeps a panel's own state across a
view switch. State in the screen survives for the same reason. A switch
to the canvas and back is another matter. The screen itself unmounts
there. That round trip resets the selection to the first entity, and the
spec says so.

### The panels take `selectedId`, `onAdd` and `onRemove`

`FieldCatalogPanel` renders the one top-level field whose `id` matches
`selectedId`, through the same `FieldRow` it uses today. The recursion,
the anchors and the group editor stay exactly as they are. Only the
`fields.map` at the top narrows to one entry.

`DataSourcesPanel` narrows its own map the same way.

Both controls move up to the screen. Each panel calls the prop.
Two reasons. The screen must select the added entity, so it needs the
new id at the call site. It must select the neighbour after a Remove, so
it needs the removed index. Both facts live at the call, not after it.

That move also closes a divergence the code carries today. The rail's
Add mints `{key: "", type: "string"}` through `mintId("field")`
(`PanelsScreen.tsx:71-78`). The panel's Add mints through
`mintCatalogField("text", ...)` (`FieldCatalogPanel.tsx:297-299`). The
two produce different fields from one control name. One owner ends that.

### A rail row carries its top-level ancestor

`RailFieldRow` (`draft/panel-rail.ts:39-44`) gains a `rootId`: the id of
the top-level field the row sits under, equal to `id` for a top-level
row. Choosing a row selects `rootId` and scrolls `field-row-<id>`.

This keeps the existing depth cap honest. A twice-nested field takes its
own top-level rail entry and still resolves to the real ancestor.
Choosing it opens the group editor that contains it. `scrollToField`
stays as it is, since `FieldRow` already anchors at every depth.

The alternative is a lookup from row id to ancestor at click time. That
walks the field tree a second time. `flattenRailFields` already walks it
once and already carries the parent in hand.

### The per-entity issue mark is a new pure helper

`issueCountForEntityId(issues, entityId)` joins
`issueCountForEntityType` in `draft/panel-rail.ts`. The rail calls it per
sub-list row. It takes the same `readonly EditorIssue[]` and returns a
number, so `studio-edit-panel-rail.test.ts` covers it the way it covers
its four siblings.

The mark reuses `.studio-panels-rail-issues`, the refusal tone the view
entries already carry. A sub-list row shows it only above zero.

### The sub-list follows the open view

The rail renders a sub-list only when `view === openView`. Today the
Fields sub-list renders under a Data sources view too. That is harmless
while one view has a sub-list, and wrong once two do. Two sub-lists at
once overflow the 16rem column.

### The CSS lands as new rules, not a refactor

`.field-catalog-panel`, `.field-row`, `.option-row` and
`.data-source-row` exist in the markup and in no stylesheet. The change
appends rules for them to `app.css`, beside the panel rules already
there. It renames no class and touches no existing rule.

Several labels in these panels reach the screen as literal strings.
`key`, `label`, `description`, `type` and `dataSource` do
(`FieldCatalogPanel.tsx:101,105,115,124,155`). So do `key` and
`data list` (`DataSourcesPanel.tsx:57,61`). Catalogue them in the same
pass. The new field rule makes each one a visible label. A hard-coded
label ships an untranslatable screen. `i18n-catalog-parity` requires an
EN and a DE entry for each.

## Risks / Trade-offs

- **Removing the last entity leaves nothing to select.** → Both panels
  render an empty state already (`FieldCatalogPanel.tsx:314`,
  `DataSourcesPanel.tsx:50`). The screen falls back to it. The rail keeps
  its Add entry.
- **A stale selection after the JSON view drops the selected field.**
  → The screen resolves `selectedFieldId` against the draft on every
  render. It falls back to the first entity when the id fails to
  resolve.
- **`app.css` and `src/i18n/catalogs/studio.ts` both take an append from
  `studio-editor-dock` as well.** → This change lands after that one. Both
  append, and neither rewrites a line the other holds.
- **No DOM test can see the selection.** → The pure helpers carry their
  own cases. A real browser check covers the selection, the Add and
  Remove follow-ups, the group child scroll and the issue mark. That
  split is the rule `development-toolchain` already states.
- **A 200-field draft gives the rail a long sub-list.** → The rail scrolls
  its own overflow today (`app.css:1123-1127`). A filter is the first
  thing that scale demands, and 22 fields do not demand it.
