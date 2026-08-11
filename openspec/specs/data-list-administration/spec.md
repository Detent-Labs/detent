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
