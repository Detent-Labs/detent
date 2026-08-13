## ADDED Requirements

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
