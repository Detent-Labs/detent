## Purpose

A data source type whose option list lives in engine-owned tables, not in the
process body. An operator changes those values without publishing a new
process version.

## ADDED Requirements

### Requirement: The engine stores data lists in two tables

`initSchema` SHALL create `data_lists` and `data_list_values`.

`data_lists` SHALL carry `list_key` as its primary key, a `label`, an
optional `description`, `updated_at`, and `updated_by`. A list SHALL exist
with no values.

`data_list_values` SHALL carry `list_key`, `value`, a `label` holding a
`LocalizedText`, an `active` flag defaulting to true, a `sort_order`,
`updated_at`, and `updated_by`. Its primary key SHALL be
`(list_key, value)`, and `list_key` SHALL reference `data_lists`.

#### Scenario: A list exists before it has values
- **WHEN** a caller creates a row in `data_lists` and adds no values
- **THEN** the list exists and resolves to an empty option list

#### Scenario: One value per key per list
- **WHEN** a caller writes a second row with a `list_key` and `value` that a
  row already holds
- **THEN** the primary key rejects it

### Requirement: A built-in "db.list" data source handler reads a list from the database

The engine SHALL ship a built-in `"db.list"` data source handler, registered
by `createDefaultDataSourceRegistry`. Its `configSchema` SHALL accept
`{ listKey: string }` alone. The key SHALL be non-empty and within
`MAX_KEY_LENGTH`.

`resolve` SHALL return the values of that list as `FieldOption[]`, ordered by
`sort_order` then `value`. It SHALL return active values, and additionally
any value named in `ctx.heldValues`.

`createDefaultDataSourceRegistry` SHALL take the database handle, so
`DataSourceContext` carries none.

#### Scenario: An active value resolves to an option
- **WHEN** a field binds to a `"db.list"` data source whose list holds an
  active value
- **THEN** the resolved options carry that value with its label

#### Scenario: An inactive value no other instance holds stays out
- **WHEN** a field binds to a `"db.list"` data source whose list holds an
  inactive value, and `heldValues` does not name it
- **THEN** the resolved options omit that value

#### Scenario: An inactive value a holder names comes back
- **WHEN** `heldValues` names an inactive value of that list
- **THEN** the resolved options carry that value with its label

#### Scenario: Options come back in a stable order
- **WHEN** a list holds several values with distinct `sort_order` values
- **THEN** the resolved options follow `sort_order`, then `value`

### Requirement: The engine bounds the size of a data list

The engine SHALL define `MAX_DATA_LIST_VALUES`. The `"db.list"` handler SHALL
read at most `MAX_DATA_LIST_VALUES + 1` rows. It SHALL throw a plain `Error`
naming the `listKey` when it reads more rows than the bound allows. It SHALL
NOT return a truncated list.

#### Scenario: A list over the bound raises rather than truncates
- **WHEN** a list holds more than `MAX_DATA_LIST_VALUES` active values and a
  field binds to it
- **THEN** resolution throws an `Error` naming the `listKey`

### Requirement: An unknown listKey at runtime is a canary error

The `"db.list"` handler SHALL throw a plain `Error` naming its `listKey` when
`data_lists` holds no row for it.

Publish-time validation does not check that a list exists. The delete guard
in `data-list-administration` keeps this state out of reach of the API. The
error therefore matches the engine's existing canary style, not a typed
validation error.

#### Scenario: A missing list raises a canary
- **WHEN** a field binds to a `"db.list"` data source whose `listKey` names
  no row in `data_lists`
- **THEN** resolution throws a plain `Error` naming that `listKey`

### Requirement: Publishing a body does not check that its lists exist

Publish-time validation SHALL confirm only that `"db.list"` resolves in the
registry and that its `config` satisfies the `configSchema`. It SHALL NOT
read `data_lists`. Publishing therefore stays independent of the state of the
data. An identical re-publish stays a no-op, whatever the tables hold.

#### Scenario: A body naming a list that does not exist publishes
- **WHEN** an author publishes a body whose `"db.list"` data source names a
  `listKey` with no row in `data_lists`
- **THEN** the publish succeeds

#### Scenario: A malformed config fails the publish
- **WHEN** an author publishes a body whose `"db.list"` data source carries a
  `config` with no `listKey`
- **THEN** the publish fails with a data source registry validation error
