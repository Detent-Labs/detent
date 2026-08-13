# data-list-administration

## Purpose

The operator-facing routes for data lists. Staff maintain value lists through
them without database access. Their write rules keep a running instance from
losing a value it holds.

## Requirements

### Requirement: Six routes maintain data lists

The HTTP wrapper SHALL expose `GET /admin/data-lists`,
`POST /admin/data-lists`, `GET /admin/data-lists/:listKey`,
`PUT /admin/data-lists/:listKey`, `PUT /admin/data-lists/:listKey/values`,
and `DELETE /admin/data-lists/:listKey`.

`GET /admin/data-lists/:listKey` SHALL return the list, its values including
inactive ones, and the processes that reference the list.

#### Scenario: The overview lists every data list
- **WHEN** an authorized actor calls `GET /admin/data-lists`
- **THEN** the response carries every row of `data_lists`

#### Scenario: The detail route reports inactive values
- **WHEN** an authorized actor reads a list holding one active and one
  inactive value
- **THEN** the response carries both, each with its `active` flag

#### Scenario: The detail route reports which processes reference the list
- **WHEN** a published body carries a `"db.list"` data source naming that
  `listKey`
- **THEN** the detail response names that process

### Requirement: Writing values replaces the whole list and never deletes a value

`PUT /admin/data-lists/:listKey/values` SHALL replace the values of that
list in one operation.

A value the request omits SHALL become inactive. The route SHALL NOT delete
a `data_list_values` row. A later request naming that value again SHALL make
it active.

The route SHALL reject a request carrying more than `MAX_DATA_LIST_VALUES`
values, and SHALL reject a request naming one value twice.

#### Scenario: An omitted value becomes inactive
- **WHEN** an authorized actor writes a value set that omits a value the list
  already holds
- **THEN** that value stays in the table with `active` false

#### Scenario: A returning value becomes active again
- **WHEN** an authorized actor writes a value set naming a value that is
  currently inactive
- **THEN** that value becomes active

#### Scenario: The route refuses a value set over the bound
- **WHEN** a request carries more than `MAX_DATA_LIST_VALUES` values
- **THEN** the route answers with a validation error and writes nothing

#### Scenario: The route refuses a duplicate value
- **WHEN** a request names one value twice
- **THEN** the route answers with a validation error and writes nothing

### Requirement: Deleting a list needs that no published body references it

`DELETE /admin/data-lists/:listKey` SHALL refuse when any published body
carries a `"db.list"` data source naming that `listKey`. This mirrors the
rule that already protects a published version an instance references.

#### Scenario: A referenced list survives a delete
- **WHEN** an authorized actor deletes a list a published body references
- **THEN** the route refuses and the list stays

#### Scenario: An unreferenced list goes away
- **WHEN** an authorized actor deletes a list no published body references
- **THEN** the route deletes the list and its values

### Requirement: The data list routes carry their own role

Write routes SHALL need `system:datalists`. Read routes SHALL accept
`system:datalists`, `system:developer` or `system:author`. The two authoring
roles read so the studio can offer the existing keys. An actor holding none of
the three SHALL receive an authorization error.

The data-source panel builds the `"db.list"` picker from that read. An author
refused it cannot bind a field to a data list at all. That binding is the
authoring path `system:author` exists to open.

Neither authoring role SHALL write. The narrow grant stays what it was.

#### Scenario: An actor without a role cannot read
- **WHEN** an actor holding none of the three roles calls `GET
  /admin/data-lists`
- **THEN** the route answers with an authorization error

#### Scenario: A developer reads but does not write
- **WHEN** an actor holding only `system:developer` calls
  `PUT /admin/data-lists/:listKey/values`
- **THEN** the route answers with an authorization error

#### Scenario: An author reads but does not write
- **WHEN** an actor holding only `system:author` calls `GET /admin/data-lists`
- **THEN** the route returns the keys
- **AND** a `PUT /admin/data-lists/:listKey/values` by that actor answers with
  an authorization error

#### Scenario: The data list role writes
- **WHEN** an actor holding `system:datalists` writes a value set
- **THEN** the route accepts it

### Requirement: The list routes carry the column declaration

`POST /admin/data-lists` and `PUT /admin/data-lists/:listKey` SHALL accept a
`columns` array. It sits beside the list's own label and description.

`GET /admin/data-lists/:listKey` SHALL return it. `GET /admin/data-lists` SHALL
return it too. A caller building a picker therefore needs one request.

`columns` SHALL be optional on a write. A request that omits it SHALL leave the
declaration as it stands. A request carrying an empty array SHALL clear it.

The route SHALL reject a declaration that breaks any rule
`db-data-source-type` states for a column. That covers a malformed key, a
duplicate key, an unknown type, and a count over `MAX_DATA_LIST_COLUMNS`. A
rejected request SHALL write nothing.

Dropping a column SHALL drop that column's attribute from every value of the
list. Both writes land in one transaction.

#### Scenario: A create declares columns
- **WHEN** an authorized actor posts a list carrying two column entries
- **THEN** the list exists with both, and the detail route returns them

#### Scenario: An update that omits columns leaves them alone
- **WHEN** an authorized actor updates a column-declaring list with a body
  carrying no `columns` key
- **THEN** the list keeps its declaration

#### Scenario: An empty array clears the declaration
- **WHEN** an authorized actor updates a column-declaring list with
  `columns: []`
- **THEN** the list declares no columns, and no value of it carries an
  attribute

#### Scenario: The route refuses a malformed column
- **WHEN** a request carries a column whose `key` breaks the key grammar
- **THEN** the route answers with a validation error and writes nothing

#### Scenario: The overview carries the declaration
- **WHEN** an authorized actor calls `GET /admin/data-lists`
- **THEN** each row carries its column declaration

### Requirement: The values route carries per-value attributes

`PUT /admin/data-lists/:listKey/values` SHALL accept an `attributes` object on
each value entry, and `GET /admin/data-lists/:listKey` SHALL return it on each
value it reports.

The route SHALL reject an attribute key that names no declared column. It SHALL
reject an attribute value whose type does not match its column's declared
`type`. A rejected request SHALL write nothing.

A value entry that omits `attributes` SHALL store an empty map for that value.
The values route already replaces the whole list in one operation. An attribute
follows its value rather than surviving beside it.

A value the request omits becomes inactive and keeps the attributes it holds.
An inactive value still resolves for an instance that holds it, so its
attributes have to survive with it.

#### Scenario: A value carries typed attributes
- **WHEN** an authorized actor writes a value with `{ "price": 12.5 }` against
  a `number` column
- **THEN** the value carries that attribute, and the detail route returns it

#### Scenario: The route refuses an undeclared attribute key
- **WHEN** a request carries an attribute key naming no declared column
- **THEN** the route answers with a validation error and writes nothing

#### Scenario: The route refuses a mistyped attribute
- **WHEN** a request carries a string against a `number` column
- **THEN** the route answers with a validation error and writes nothing

#### Scenario: An omitted attributes object clears the map
- **WHEN** a request rewrites a value and carries no `attributes` for it
- **THEN** that value carries no attribute afterwards

#### Scenario: A retired value keeps its attributes
- **WHEN** a request omits a value the list already holds
- **THEN** that value becomes inactive and keeps the attributes it held
