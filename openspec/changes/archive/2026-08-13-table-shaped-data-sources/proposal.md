## Why

A `"db.list"` row carries exactly `value` and `label`. An operator maintains a
product list with more columns than those two. None of it reaches a process
today.

An author who needs the unit price of the product a participant picked has one
option. Declare a second field, and ask the participant to type the price
again.

Stage 29 names the gap. This change closes it in the shape the queue decided on
2026-08-13. A data list declares extra columns. An operator fills them per
value. A field that binds to the list maps a column onto another catalog field.
Picking a row writes those fields, so a guard reads them as ordinary
`data.<key>`.

## What Changes

- A data list declares its extra columns. Each column carries a `key`, an
  operator-facing `label` and a scalar `type`. The declaration lives on the
  list, beside its own label. Making a list table-shaped therefore needs no
  publish.
- A data list value carries an attribute per declared column. The operator
  maintains attributes on the screen that maintains values.
- The `"db.list"` handler returns those attributes on each resolved option. Its
  `configSchema` stays `{ listKey }` alone. The columns are list state, and no
  process body declares them.
- `FieldOption` gains an optional `attributes` map. A `"static"` data source and
  an inline `options` array therefore carry attributes too. Existing bodies
  parse unchanged and hash unchanged.
- `FieldDef` gains an optional `columnMapping`: column key to target `FieldId`.
  A field carrying one must bind a `dataSource`, and its type must be `select`.
- The engine resolves the picked option on submission and on instance creation.
  It checks each mapped attribute against its target field's declared type. It
  writes the matching ones into `data` before the transition commits. It drops
  a mismatching entry and never writes it.
- A drop records a new `InstanceEvent` kind, `datasource.attribute-dropped`.
  Kinds are additive, and the record shape does not move.
- The participant's picker shows the extra columns beside each option's label.
  A person choosing a row therefore sees what the row carries.
- The admin area's data list screen authors the columns and the attributes. An
  author sets the column mapping through the JSON surface. The Capabilities
  section below says why the field catalog gains no editor here.

A mapped target that the participant also submits in one request takes the
mapped value. The list owns a mapped field, and one deterministic rule beats a
merge order nobody can predict.

No **BREAKING** change. Every new key is optional. A body that carries none
behaves exactly as it does today.

## Capabilities

### New Capabilities

None. Every requirement below extends a capability that already ships.

### Modified Capabilities

- `db-data-source-type`: the `"db.list"` handler returns per-value attributes,
  bounded by the list's declared columns.
- `persistence`: `data_lists` gains a `columns` declaration, and
  `data_list_values` gains an `attributes` map.
- `data-list-administration`: the operator API reads and writes both.
- `definition-contract`: `FieldOption.attributes` and `FieldDef.columnMapping`,
  plus the publish-time invariants that bound the mapping.
- `data-source-resolution`: a resolved option carries its attributes through to
  the view.
- `runtime-api`: the write-back at submission and at creation, and the type
  check that drops a mismatch.
- `runtime-events`: the `datasource.attribute-dropped` kind.
- `form-ui`: the option row renders its attributes.
- `admin-app`: the data list screen edits columns and attributes.

Three capabilities a first pass listed carry no requirement change, so this
change writes no delta against them.

- `studio-form-editor`. `columnMapping` sits on `FieldDef`, so its no-code
  editor belongs in `panels/FieldCatalogPanel.tsx`. Item 10 of
  `tmp/open-work-priority.md` holds every change to that panel, until a visual
  decision lands. An author sets the mapping through the JSON surface, which
  this project already calls a first-class low-code path.
- `http-wrapper`. The data list route payloads belong to
  `data-list-administration`. The wrapper's own rules do not move.
- `authored-content-localization`. A column label is operator text in one
  language, exactly as `data_lists.label` already is. No requirement about
  authored `LocalizedText` moves.

The studio needs no work of its own. `draft/validation.ts` calls the engine's
own `compileProcessBody`. The new invariants land in the checks rail with no
browser-side code.

## Impact

Engine:

- `src/schema/definition.ts`: the two optional keys.
- `src/schema/compile.ts`: the mapping invariants.
- `src/engine/store.ts`: the two table columns.
- `src/engine/host.ts`: the handler read.
- `src/runtime/api.ts`: the write-back.
- `src/engine/transition.ts`: one optional argument on
  `commitManualTransition`, so a drop event lands in the commit's transaction.
- `src/http/admin-routes.ts`: the operator payloads.

Browser:

- `packages/form-ui/src/FieldForm.tsx`: the option text.
- `packages/web/src/areas/admin/api/types.ts`: the three data list types.
- `packages/web/src/areas/admin/api/client.ts`: the three write calls.
- `packages/web/src/areas/admin/screens/DataListScreen.tsx`: the two editors.
- `packages/web/src/areas/admin/screens/DataListsScreen.tsx` and
  `dataListsLogic.ts`: the summary shape they read.
- The admin area's EN and DE catalogs.

No studio file changes.

Docs: `docs/authoring-guide.md` states the rule an author follows.
`docs/current-state.md` and `ROADMAP.md` record the stage.
`docs/browser-checks.md` carries the walk. `docs/decisions.md` amends the
CEL-readable data-source deferral.

`docs/openapi.yaml` gains the `attributes` key on a view's options.
`GET /instances/:id` returns that view.

No dependency changes. No API removals. Each of the two tables gains one column
with a default, so an existing deployment needs no data migration.
