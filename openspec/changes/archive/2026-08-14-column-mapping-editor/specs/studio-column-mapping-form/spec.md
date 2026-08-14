## Purpose

The studio area's per-field editor for `FieldDef.columnMapping`. It defines
how an author sends a picked row's attributes into ordinary catalog fields
without opening the JSON view. It also defines when that editor appears.

It is the third per-field editor in the field catalog.
`studio-field-validation-form` holds the first.

## ADDED Requirements

### Requirement: The field catalog edits a field's columnMapping

The field catalog panel SHALL offer an editor for a field's `columnMapping`.
The editor SHALL show one row per mapped column. An author SHALL add a row
and remove one.

A row SHALL carry two controls. The first picks a column key. The second
picks the catalog field that column writes into.

The editor SHALL write through the draft store like every other panel field.
It SHALL introduce no route and no schema key.

A field carrying no mapping SHALL show the editor with no rows. The draft
body SHALL still carry no `columnMapping` for that field.

#### Scenario: A field carries no mapping yet

- **WHEN** an author opens a mappable field whose `columnMapping` is absent
- **THEN** the editor shows no row, and the draft body carries no
  `columnMapping` for that field

#### Scenario: The author maps a column

- **WHEN** an author adds a row, picks the `price` column and a number field
  as its target
- **THEN** the draft body carries `columnMapping` with `price` against that
  field's id

#### Scenario: Removing the last row drops the key

- **WHEN** an author removes the only mapped row
- **THEN** the draft body carries no `columnMapping` for that field, rather
  than an empty object

### Requirement: The editor appears only where a mapping can publish

The editor SHALL appear for a `select` field bound to a `"db.list"` data
source, and for no other field.

Two of those conditions come from the engine. `checkColumnMapping` refuses a
mapping on a field carrying no `dataSource`. It refuses one on a field that is
not a `select`. An editor offered there would invite an author to build a
publish error, which the checks rail then reports.

The `"db.list"` narrowing is this editor's own. Only a data list declares
columns, so no other source type gives the picker anything to offer. A mapping
on such a source stays authorable in the JSON view, since the engine permits
it.

Losing either condition SHALL hide the editor. The field's stored
`columnMapping` SHALL survive that, so restoring the condition restores the
rows. A `multiselect` picks several rows for one target, and the author who
switches back has not asked to drop the mapping.

#### Scenario: A select field bound to a data list shows the editor

- **WHEN** an author opens a `select` field bound to a `"db.list"` source
- **THEN** the editor appears

#### Scenario: A field with inline options shows no editor

- **WHEN** an author opens a `select` field carrying inline `options`
- **THEN** the editor does not appear

#### Scenario: A multiselect shows no editor

- **WHEN** an author switches a mapping field's type to `multiselect`
- **THEN** the editor does not appear, and the draft keeps the field's
  `columnMapping`

#### Scenario: Restoring the type restores the rows

- **WHEN** that author switches the type back to `select`
- **THEN** the editor shows the rows the field still carried

### Requirement: The column picker offers what the bound list declares

The first control of a row SHALL offer the column keys the field's own list
declares. The editor SHALL resolve that list through the field's `dataSource`
id, to the data source's `listKey`.

A key the list no longer declares SHALL stay in its row, and the editor SHALL
mark that row. Such a mapping outlives the column it names, and the data list
route reports it for that reason. An editor that dropped the row would hide
the mapping an operator reads that report to find.

Where the list declares no column, the editor SHALL say so in words. An empty
picker SHALL NOT stand in for that sentence.

#### Scenario: The picker offers the declared keys

- **WHEN** the bound list declares `sku` and `price`
- **THEN** the row's column picker offers both

#### Scenario: A key the list dropped stays, and the editor marks it

- **WHEN** a field maps a column the list no longer declares
- **THEN** that row stays, carries its key, and the editor marks it

#### Scenario: A list declaring no column says so

- **WHEN** the bound list declares no column
- **THEN** the editor states that in words, and offers no row to add

### Requirement: The editor leaves every publish rule to the checks rail

The editor SHALL NOT re-implement the rules `checkColumnMapping` enforces.
`draft/validation.ts` runs the engine's own `compileProcessBody`, so all seven
reach the checks rail already. A second copy in the panel would be a second
answer that can drift from the first.

The editor SHALL therefore permit an author to build a mapping the checks rail
then refuses. A duplicate target is the common case. Two rows writing one
field breaks a rule, and an author passes through that state mid-edit.

The field picker SHALL offer every catalog field the mapping could target. It
SHALL omit a group field, which takes no value, and the mapping field itself.
Those two are shape, not validation: neither can ever become correct.

#### Scenario: A duplicate target reaches the checks rail

- **WHEN** an author maps two columns onto one field
- **THEN** the editor accepts both rows, and the checks rail reports the
  duplicate

#### Scenario: The field picker omits a group field

- **WHEN** the catalog holds a group field
- **THEN** the row's field picker does not offer it

#### Scenario: The field picker omits the mapping field

- **WHEN** an author opens the picker on the mapping field's own row
- **THEN** that field does not appear among the choices
