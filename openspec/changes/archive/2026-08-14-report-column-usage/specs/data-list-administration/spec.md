## MODIFIED Requirements

### Requirement: Six routes maintain data lists

The HTTP wrapper SHALL expose `GET /admin/data-lists`,
`POST /admin/data-lists`, `GET /admin/data-lists/:listKey`,
`PUT /admin/data-lists/:listKey`, `PUT /admin/data-lists/:listKey/values`,
and `DELETE /admin/data-lists/:listKey`.

`GET /admin/data-lists/:listKey` SHALL return the list, its values including
inactive ones, and the processes that reference the list.

Each reported process SHALL carry the column keys it maps. A process maps a
column when a field in its body carries a `columnMapping` entry under that
key. That field's data source SHALL be a `"db.list"` source naming this list.
Fields nest, so a field inside a group field counts as one of the body's own.

The reported keys SHALL carry no duplicate. Two fields mapping one column
report that column once. They SHALL come back in a stable order the storage
does not decide.

The report SHALL carry every mapped key, whether or not the list still
declares it. A mapping naming a column the list dropped is what an operator
reads this report to find.

A process that reads the list and maps no column SHALL report an empty set.
Every body written before the column declaration existed takes that case.

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

#### Scenario: The detail route reports a mapped column key
- **WHEN** a published body binds a select field to that list, and the field
  maps the list's `price` column
- **THEN** the entry for that process carries `price`

#### Scenario: A process that maps nothing reports an empty set
- **WHEN** a published body reads the list and no field carries a
  `columnMapping`
- **THEN** the entry for that process carries no column key

#### Scenario: A mapping inside a group field counts
- **WHEN** the mapping field sits inside a group field
- **THEN** the entry for that process carries the mapped key

#### Scenario: The report carries a key the list no longer declares
- **WHEN** a published body maps a column the list has since dropped
- **THEN** the entry for that process carries that key

#### Scenario: A mapping through another list is not reported
- **WHEN** a published body reads two lists, and maps a column of the other
  one alone
- **THEN** the entry under this list carries no column key
