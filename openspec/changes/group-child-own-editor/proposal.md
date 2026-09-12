## Why

The owner's screenshot of 2026-09-12 shows the Fields tab of the IT Offboarding
draft. The author chose "Forward to this address" inside the group "Data backup
and email". The tab selected the whole group instead. All nine child entries
took the selection mark, and the editor scrolled down to a short child row.

That row lacks the Default value zone, the preview and the whole effect half.
It prints the raw legend "options / dataSource (mutually exclusive)" instead of
a zone heading. A field inside a group holds a value like any other field. The
owner asked for it to open the same editor a top-level field opens.

The owner approved the behavior below on 2026-09-12, after
[a clickable mockup](https://claude.ai/code/artifact/6c932e86-9806-4da7-ba91-ce9008e2103d)
built on the same draft.

## What Changes

- Choosing a field inside a group selects that field. The rail marks that one
  entry. The tab opens the field's own `FieldEditor`, with both halves.
- A newly chosen field's editor opens at its top.
- The rail keeps its indent under a group. The scroll to a child row goes, and
  so does `RailFieldRow.rootId`, since nothing reads it any more.
- A group's editor draws no child rows. A zone "Fields inside this group"
  follows "Validation" and holds one button, "+ Add field to this group". The
  button appends a field to the group and selects it. Keyboard focus lands in
  the new field's label input, and the rail brings the new entry into view.
- Remove on a field inside a group selects the next field of that group. It
  falls back to the previous one, then to the group. Remove at the top level
  keeps the rule it follows today.
- A move keeps the moved field itself selected. Focus returns to the move
  control in that field's own editor.
- A check on a field inside a group names that field. It stands at the zone it
  names, in that field's own editor. It marks that field's own rail entry.
  Today the studio's resolver hands such a check to the outermost group.
- `SubFieldRow` goes, together with the two catalog keys only it reads.
- `docs/browser-checks.md` rewrites three passages that state the old
  behavior. A new walk covers selection, Add and Remove inside a group.
- Two live sentences that this change makes false get new wording. One pins
  the count of `LocalizedTextInput` sites. The other points the field matrix at
  the panel's child list.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: nine requirements change.
  - "The panels screen keeps every change and states so": a child entry
    selects its own field, and Add and Remove name the field they select. A
    newly chosen field's editor opens at its top.
  - "The field catalog's definition half offers a Technical control": a nested
    field offers the control in its own editor.
  - "The field catalog's field key auto-derives from the field label": the
    nested case no longer names a group's child editor.
  - "The Fields view divides into a definition half and an effect half": a
    group field gains the zone "Fields inside this group".
  - "A field's checks stand at the zone each one belongs to": the child row
    and its own check list go.
  - "The Fields view's definition half states values, a default and a
    preview": the halves belong to the selected field, at any depth.
  - "A field moves into a group and out of it from the catalog rail": a nested
    field's move control stands in its own editor.
  - "The field matrix lists every catalog field against every workflow step":
    a group's children follow the order the entity rail lists them.
  - "A LocalizedText entry missing the current locale draws an inline
    warning": the pinned site count follows a removed site too.

## Impact

- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: `SubFieldRow`,
  the scroll effect and both `field-row-<id>` anchors go. The panel finds the
  selected field at any depth. A group gains its add zone.
- `packages/web/src/areas/studio/panels/EntityTabs.tsx`: the selection names
  the chosen entry. A new selection resets the editor pane's scroll. Add takes
  an optional group. Remove takes a field id. A move keeps its own field
  selected.
- `packages/web/src/areas/studio/panels/fieldCatalogLogic.ts`: pure helpers
  answer which field Remove selects next. Two more append a field to a group
  and remove a field at any depth. Two id helpers name the label input and the
  rail entry that the add control reaches.
- `packages/web/src/areas/studio/draft/issues.ts`: `resolveLoc` follows a
  nested field's whole index path.
- `packages/web/src/areas/studio/panels/shared/LocalizedTextInput.tsx`: an
  optional `id`, so focus can find a field's label input.
- `packages/web/src/areas/studio/draft/panel-rail.ts`: `rootId` goes.
- `packages/web/src/i18n/catalogs/studio.ts`: `fieldCatalog.addSubField` reads
  "+ Add field to this group". `fieldCatalog.subFieldsLegend` and
  `fieldCatalog.optionsLegend` go.
- Comments that describe the old editor, in `draft/field-usage.ts`,
  `draft/mintField.ts` and `panels/shared/FieldValidationEditor.tsx`.
- Seven test files:
  - `studio-fieldCatalogPanel.test.tsx` and `studio-panelsRailFieldRow.test.tsx`
  - `studio-edit-panel-rail.test.ts` and `studio-fieldCatalogLogic.test.ts`
  - `studio-issues.test.ts` and `studio-fieldCheckZone.test.ts`
  - `boundaries.test.ts`, which counts `LocalizedTextInput` sites. `SubFieldRow`
    holds three of its ten.
- `docs/browser-checks.md`, `docs/current-state.md` and `docs/decisions.md`.
- No engine code changes, and the definition contract stays as it is.
