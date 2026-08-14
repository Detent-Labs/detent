## Context

See proposal.md for motivation.

`FieldCatalogPanel.tsx` is 230 lines. `FieldRow` renders one field, and its
`optionsLegend` fieldset already holds the `dataSource` picker beside the
inline options editor. The two are mutually exclusive, and each disables the
other.

`listDataListKeys` in `api/client.ts` reads `GET /admin/data-lists` and maps
each item to its `listKey` alone. The route returns `columns` per item, and
this drops them. `DataSourcesPanel` holds that fetch.

`checkColumnMapping` in `src/schema/compile.ts` carries seven rules. Two of
them gate a mapping at all: the field needs a `dataSource`, and it must be a
`select`. The other five bound the keys and the targets.

## Goals / Non-Goals

**Goals:**

- An author maps a column with no JSON.
- The editor offers real column keys, not free text.
- One answer to every publish rule, and it stays in the engine.

**Non-Goals:**

- No schema work, no engine work, no new invariant.
- The three panels keep their shape. This adds a fieldset to one row.
- The JSON view stays the escape hatch.

## Decisions

**The editor sits in the options fieldset, under the `dataSource` picker.**
That fieldset already groups where a field's choices come from. A mapping
answers what a chosen row then writes. Its own legend names it.

**A shared hook, in the shape the studio already uses.** `useRegistry` in
`panels/shared/` fetches `GET /registry` once per mount. Two panels call it,
`DataSourcesPanel` and `StepsPanel`. `useDataLists` joins it, over the data
list route.

`listDataListKeys` returns `{ listKey, columns }` per list, and its name
becomes `listDataLists`. The route already returns both.

The alternative was lifting one fetch into `PanelsScreen` and passing it down.
Nothing in the studio does that today. `DataSourcesPanel` holds its own state.
The draft store carries the draft alone, not server data. A new plumbing shape
for one screen buys nothing `useRegistry` does not already give.

`FieldCatalogPanel` takes no props today, so it gains `token`, as
`DataSourcesPanel` already has.

**The editor reads the list through the field's own data source.** A field
names a `dataSource` id. That data source carries `config.listKey`. So the
column keys for a row come from `lists.find(l => l.listKey === ds.config.listKey)`.

A field bound to an unreported source falls to the no-column case.
`studio-app` already draws a warning on that source. The author reads it once,
where the fault sits.

**A hidden editor keeps its data.** Switching a field's type to `multiselect`
hides the editor. It does not delete `columnMapping`. The author asked for a
different type, not for the mapping to go. Switching back restores the rows.

That leaves a field carrying a mapping that cannot publish. The checks rail
reports it, which is the same place every other publish rule surfaces.

**The panel validates nothing.** `draft/validation.ts` runs
`compileProcessBody`, so all seven rules already reach the rail. A duplicate
target reaches the rail, rather than a disabled control. An author passes
through that state mid-edit, and a panel refusing the keystroke fights them.

The field picker is the one exception, and it is shape rather than validation.
A group field takes no value. The mapping field cannot target itself. Neither
becomes correct by any later edit, so offering them invites a rule the author
cannot satisfy.

**A pure helper carries the logic.** `columnMappingRows` turns a field, its
source and the list set into the editor's rows. It marks a row
whose key the list no longer declares. `mappableTargets` returns the field
picker's own choices. Both live beside the panel and take a test, the rule
`studio-app` states for testable studio logic.

## Risks / Trade-offs

- An author maps a column, then an operator drops it -> the row stays and the
  editor marks it. The route reports the same key, so the two surfaces agree.
- A list declaring ten columns gives a ten-entry picker ->
  `MAX_DATA_LIST_COLUMNS` is 10. That is the bound, and a `<select>` holds it.
- The field catalog calls the data list route itself -> so do `useRegistry`'s
  two callers, for the same class of data. That route is an admin one, off
  every instance path. The screen mounts each panel once.
- A field bound to a source the draft later deletes -> `definition.ts` refuses
  a `dataSource` id resolving to no source. The checks rail reports it, and the
  editor falls to the no-column case meanwhile.

## Migration Plan

No data moves. No published body changes. `columnMapping` already parses, and
a body written before this reads the same.

Rollback is a code revert. A mapping an author built with the editor stays in
the draft and still publishes. The editor writes what the JSON view writes.

## Open Questions

- Should the row print the target field's type beside its name? An author
  would then see the mismatch that drops an attribute. The engine drops a
  mismatched attribute and records `datasource.attribute-dropped`, so the
  record carries it either way. The answer changes no requirement here. It is
  worth taking after an author has built one mapping.
