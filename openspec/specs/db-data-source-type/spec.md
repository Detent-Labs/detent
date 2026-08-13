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

### Requirement: A data list declares its extra columns

A data list SHALL carry a column declaration. Each entry SHALL declare a `key`,
a `label` and a `type`. The `key` SHALL match `/^[a-z_][a-z0-9_]*$/` and stay
within `MAX_KEY_LENGTH`. The `label` SHALL be plain operator-facing text. The
`type` SHALL be one of `string`, `number` or `boolean`.

A column `key` SHALL be unique within its list. A list SHALL declare no more
than `MAX_DATA_LIST_COLUMNS` columns. The engine SHALL define that bound.

A list that declares no columns SHALL keep behaving as it does today. The
declaration lives on the list, so an operator makes a list table-shaped with no
publish and no migration.

#### Scenario: A list declares a typed column
- **WHEN** an operator declares a column `{ key: "price", label: "Price", type: "number" }`
- **THEN** the list carries that column, and the process body stays unchanged

#### Scenario: The write refuses a duplicate column key
- **WHEN** an operator declares two columns with the key `price`
- **THEN** the write fails and the list keeps its previous declaration

#### Scenario: The write refuses a column count over the bound
- **WHEN** an operator declares more than `MAX_DATA_LIST_COLUMNS` columns
- **THEN** the write fails and the list keeps its previous declaration

#### Scenario: A list with no columns behaves as before
- **WHEN** a field binds to a list that declares no columns
- **THEN** the resolved options carry `value` and `label` alone

### Requirement: A data list value carries an attribute per declared column

A value of a data list SHALL carry an attribute map. A key of that map SHALL
name a column the list declares. A value of that map SHALL be a JSON scalar
whose type matches the column's declared `type`.

A value MAY omit an attribute for a declared column. An omitted attribute
SHALL resolve to no entry, not to a null or an empty string.

A column the operator deletes SHALL take its attribute out of every value of
the list. Nothing keeps an attribute whose column no longer exists.

#### Scenario: The write keeps an attribute matching its column type
- **WHEN** an operator writes `{ "price": 12.5 }` on a value of a list whose
  `price` column declares `number`
- **THEN** the write succeeds and the value carries that attribute

#### Scenario: The write refuses an attribute of the wrong type
- **WHEN** an operator writes `{ "price": "cheap" }` on a value of a list whose
  `price` column declares `number`
- **THEN** the write fails and the value keeps its previous attributes

#### Scenario: The write refuses an attribute naming no declared column
- **WHEN** an operator writes an attribute whose key names no column the list
  declares
- **THEN** the write fails and the value keeps its previous attributes

#### Scenario: Deleting a column takes its attributes out
- **WHEN** an operator deletes the `price` column from a list whose values
  carry a `price` attribute
- **THEN** no value of that list carries a `price` attribute afterwards

### Requirement: The "db.list" handler returns a value's attributes

`resolve` SHALL carry each value's attributes onto the `FieldOption` it
returns. It SHALL include an entry only for a column the list declares and the
value fills.

It SHALL walk the list's `columns` declaration, and look each key up in the
row's stored attributes. It SHALL NOT walk the stored attributes. Postgres
normalizes a `jsonb` object's key order. The stored order is therefore not the
operator's order. A renderer that walks the resulting map walks the order the
operator chose.

An option of a list that declares no columns SHALL carry no `attributes` key at
all, rather than an empty map.

The handler's `configSchema` SHALL stay `{ listKey: string }` alone. The
columns are list state, and no process body declares them.

#### Scenario: A resolved option carries its attributes
- **WHEN** a field binds to a list whose active value fills a `price` column
- **THEN** the resolved option carries `attributes.price` with that value

#### Scenario: An unfilled column produces no entry
- **WHEN** a value of a column-declaring list fills no attribute
- **THEN** its resolved option carries an `attributes` map with no entry for
  that column

#### Scenario: Attributes follow the declared column order
- **WHEN** a list declares `sku` before `price` and a value fills both
- **THEN** the resolved option's `attributes` map carries `sku` before `price`

#### Scenario: The declared order beats the stored order
- **WHEN** a list declares a long key before a short one, and `jsonb` stores
  that pair in the reverse order
- **THEN** the resolved option's `attributes` map follows the declaration

#### Scenario: A retired value a holder names keeps its attributes
- **WHEN** `heldValues` names an inactive value of a column-declaring list
- **THEN** the resolved option carries that value, its label and its attributes
