## Why

`"static"` is the only data source type that ships. Its option list lives in
`config.options` inside the process body, which is immutable and hashed. Every
change to one value therefore costs a new published version, plus a migration
for running instances. Value lists that business staff own, such as cost
centres or departments, do not belong on a release cycle.

## What Changes

- A second data source type, `"db.list"`, whose values live in two
  engine-owned tables instead of the process body.
- Two tables, `data_lists` and `data_list_values`, created by `initSchema`.
- `DataSourceContext` gains an optional `heldValues: string[]`, so a value the
  admin retires stays visible to the instances that already hold it.
- Six admin routes to maintain lists, behind a new `system:datalists` role.
- Two admin screens, a list overview and a value editor with a usage report.
- The studio's `DataSourcesPanel` offers the existing `listKey` values as a
  choice instead of a free-text field.
- No change to `src/schema/definition.ts`, so `definitionHash` stays the same
  and published bodies stay valid.

## Capabilities

### New Capabilities
- `db-data-source-type`: the `"db.list"` handler, its two tables, its size
  bound, and the query that keeps a retired value visible to holders.
- `data-list-administration`: the six admin routes and the two admin screens.
  Its write-side invariants: a `PUT` deactivates rather than deletes, and a
  `DELETE` refuses a referenced list.

### Modified Capabilities
- `data-source-resolution`: `DataSourceContext` gains `heldValues`;
  `resolveFields` passes the values the instance holds and extends the memo
  key with them.
- `authorization`: a new `system:datalists` role, narrow like the existing
  ones and implying none of them.
- `persistence`: `initSchema` creates `data_lists` and `data_list_values`.
- `admin-app`: the area gains two screens and their navigation entry.
- `studio-app`: `DataSourcesPanel` picks a `listKey` from the server, and a
  body pointing at a missing list draws a warning.

## Impact

- `src/engine/store.ts`: two `CREATE TABLE IF NOT EXISTS` statements.
- `src/engine/host.ts`: `createDefaultDataSourceRegistry` takes `db` and
  registers `"db.list"`.
- `src/engine/registry.ts`: `DataSourceContext` gains `heldValues`.
- `src/runtime/api.ts`: `resolveFields` passes held values and keys its memo
  on them. `optionValuesValid` needs no change.
- `src/http/admin-routes.ts`, `src/http/server.ts`: six routes.
- `src/auth/authorize.ts`: `DATALISTS_ROLE`.
- `packages/web/src/areas/admin/`: two screens plus their logic module.
- `packages/web/src/areas/studio/panels/DataSourcesPanel.tsx`: the picker.
- No dependency changes. No change to the definition contract.
