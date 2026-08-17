## Why

The studio's panels screen renders every field expanded at once.
`examples/purchase-requisition.json` declares 22 fields. One field carries a
key, a label, a description and a type. It carries an options fieldset with
its data source and its column mapping, a validation editor and an issue list.
A group field repeats all of that per child. The Fields view stacks 22 of those
blocks under one scrollbar. `panels/DataSourcesPanel.tsx` stacks its own rows
the same way.

Neither panel carries any CSS. `.field-catalog-panel`, `.field-row`,
`.option-row` and `.data-source-row` appear in no stylesheet. The area holds
one label rule, `.steps-panel label` in `app.css`, which sets a label
above its control at `--space-1`. The design language states that rule for
every field in the area. These two panels never got it.

## What Changes

- The panels rail becomes the master for the Fields view. Choosing a field
  selects it, and the view renders that one field's editor instead of all of
  them. The scroll shrinks from 22 fields to one.
- The Data sources view takes the same shape. Its rail entry gains a sub-list
  of data sources, and the view renders one data source's editor.
- Each rail entry under Fields and Data sources carries its own issue mark. A
  broken entity stays visible while another one is open.
- The rail renders a sub-list only under the open view. Two sub-lists at once
  fill the 16rem column.
- A group field keeps its recursive editor. Choosing a child selects the parent
  group and scrolls the child into view inside it.
- Both panels gain the area's field CSS. A label sits above its control. A
  `key` and a `type` print in mono. A hairline divides rail rows, and a 2px
  rule sits under the heading.

Selection is component state and takes no address. Mount selects the first
entity, Add selects the new one, and Remove selects the neighbour. Contract
holds a single editor already and takes no sub-list. The field matrix is a
table and keeps its own shape.

Three things stay out. The rail gets no filter, since 22 fields do not earn
one. The screen gets no overview table, since the field matrix maps a field
against a step already. Neither panel gains a duplicate or a reorder control.
Neither of those drove the change.

## Capabilities

### New Capabilities

None. The `studio-app` spec covers the screen and its rail already.

### Modified Capabilities

- `studio-app`: the rail's scroll-into-view requirement becomes a selection.
  The Data sources entry gains a sub-list. Each entity entry gains its own
  issue mark, and a sub-list renders only under the open view.

## Impact

- `packages/web/src/areas/studio/screens/PanelsScreen.tsx`: the rail gains a
  data-source sub-list and a per-entity issue mark. It holds the selection for
  both views and renders one sub-list rather than all of them.
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: renders the
  selected field, keeps its recursive group editor and its `field-row-<id>`
  anchors.
- `packages/web/src/areas/studio/panels/DataSourcesPanel.tsx`: renders the
  selected data source.
- `packages/web/src/areas/studio/draft/panel-rail.ts`: `RailFieldRow` gains
  `rootId`; a new `issueCountForEntityId` helper joins
  `issueCountForEntityType`.
- `packages/web/src/areas/studio/app.css`: the field rule for both panels, the
  rail sub-list rows, the heading rule.
- `packages/web/src/i18n/catalogs/studio.ts`: strings for an empty selection
  and for the issue mark.
- A real browser check covers the selection, the Add and Remove follow-ups, the
  group child scroll and the issue mark.

This change lands after `studio-editor-dock`. Both append to `app.css` and to
`src/i18n/catalogs/studio.ts`.
