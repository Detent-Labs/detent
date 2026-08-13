## ADDED Requirements

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
