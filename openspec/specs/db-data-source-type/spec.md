# db-data-source-type

## Purpose

A data source type whose option list lives in engine-owned tables, not in the
process body. An operator changes those values without publishing a new
process version.

## Requirements

### Requirement: The engine stores data lists in two tables

The values of a `"db.list"` data source SHALL live in `data_lists` and
`data_list_values`, not in the process body. The `persistence` capability owns
the shape of both relations. A list SHALL exist with no values.

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

### Requirement: The engine bounds the offered values of a data list

The engine SHALL define `MAX_DATA_LIST_VALUES`. The bound SHALL count the
active values of a list. The `"db.list"` handler SHALL throw a plain `Error`
naming the `listKey` when a list offers more active values than the bound
allows. It SHALL NOT return a truncated list.

A value named in `ctx.heldValues` SHALL NOT count against the bound. The
handler's read SHALL leave room for those rows on top of it. A list sitting
exactly on the bound therefore keeps resolving for an instance holding a
retired value of that list. Bounding the row count instead would fail the
instances the retirement rule exists to protect.

#### Scenario: A list over the bound raises rather than truncates
- **WHEN** a list holds more than `MAX_DATA_LIST_VALUES` active values and a
  field binds to it
- **THEN** resolution throws an `Error` naming the `listKey`

#### Scenario: A list on the bound still resolves for a holder of a retired value
- **WHEN** a list holds exactly `MAX_DATA_LIST_VALUES` active values plus a
  retired value, and `heldValues` names that retired value
- **THEN** resolution returns `MAX_DATA_LIST_VALUES + 1` options, including
  the retired one

#### Scenario: A held value does not rescue a list that is over the bound
- **WHEN** a list holds more than `MAX_DATA_LIST_VALUES` active values and
  `heldValues` names a retired value of that list
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
