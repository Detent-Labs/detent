## Why

Stage 29 shipped `FieldDef.columnMapping` whole: the contract, the engine, the
admin editor and the renderer. It shipped no builder. An author writes a
mapping as JSON today.

That contradicts the direction stage 27 set. The builders cover the canvas, the
form editor, plugin config, path guards, view overrides, migration plans and
templates. Three sites keep a raw input on purpose, and a mapping is none of
them.

Stage 36 held every change to the field catalog panel until somebody took its
visual decision. That decision landed on 2026-08-14, and the panel now sits on
the panels screen. The hold ends there.

## What Changes

- The field catalog gains a `columnMapping` editor, one row per mapped column.
- The left control of a row picks a column key the bound list declares. The
  right control picks a catalog field.
- The editor appears only where a mapping can publish: a `select` field bound
  to a `"db.list"` data source. Those are two of the seven rules
  `checkColumnMapping` enforces. No other field can carry a mapping.
- A key the list no longer declares stays in the editor, marked. The route
  reports such a key already. An editor that dropped it would hide the
  mapping an operator went looking for.
- `listDataListKeys` widens to carry each list's declared columns. The route
  returns them today, and the studio's own read drops them.

No schema change, no engine change, no new invariant. The JSON view stays the
escape hatch for what no builder expresses.

## Capabilities

### New Capabilities

- `studio-column-mapping-form`: the field catalog's per-field editor for
  `FieldDef.columnMapping`, and the rules deciding when it appears.

### Modified Capabilities

- `studio-app`: the data sources panel's list read carries each list's
  declared columns. The field catalog needs them to offer real column keys.

## Impact

- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: the editor.
- `packages/web/src/areas/studio/api/client.ts`: `listDataListKeys` returns
  each list's columns beside its key.
- `packages/web/src/areas/studio/panels/shared/useDataLists.ts`: the shared
  read, beside `useRegistry`.
- `packages/web/src/areas/studio/panels/DataSourcesPanel.tsx`: it fetches for
  itself today, and reads the hook instead.
- `packages/web/src/areas/studio/screens/PanelsScreen.tsx`: the field catalog
  takes no props today, and needs `token`.
- `packages/web/src/i18n/catalogs/studio.ts`: the editor's own wording. The
  studio catalog is EN-only.
- Tests: a pure helper beside the panel, with its own suite under
  `packages/web/test/`.
- `ROADMAP.md`, `docs/current-state.md`, `docs/browser-checks.md` and
  `tmp/open-work-priority.md`.
- The checks rail needs no work. `draft/validation.ts` calls the engine's own
  `compileProcessBody`. All seven invariants already reach it.
