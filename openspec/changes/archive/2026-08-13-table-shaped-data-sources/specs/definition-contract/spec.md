## ADDED Requirements

### Requirement: A field option may carry attributes

`FieldOption` SHALL gain an optional `attributes` map. A key of that map SHALL
be a string. A value SHALL be a JSON scalar: a string, a number or a boolean.

The key is optional everywhere `FieldOption` appears. An inline
`FieldDef.options` array carries it, a `"static"` data source config carries
it, and a resolved `"db.list"` option carries it. One type serves all three.

An existing body declares the key nowhere, so its `definitionHash` SHALL stay
what it is. The read path SHALL keep parsing a stored body unchanged.

#### Scenario: An option with no attributes hashes as before
- **WHEN** the engine hashes a body carrying inline options with no `attributes`
- **THEN** the hash equals the hash that body produced before this change

#### Scenario: A static data source declares attributes
- **WHEN** an author declares a `"static"` data source whose option carries
  `attributes`
- **THEN** the config passes its schema and the option resolves with them

#### Scenario: The schema refuses a non-scalar attribute value
- **WHEN** an author declares an option whose attribute value is an object
- **THEN** the body fails to parse

### Requirement: A field may map data source columns onto other fields

`FieldDef` SHALL gain an optional `columnMapping`, an object whose key is a
column key and whose value is a `FieldId`.

The compile pass SHALL enforce every rule below, and SHALL reject a body that
breaks one. These are write-path checks, not read-path refinements. A stored
immutable body has to keep deserializing whatever a later rule tightens.

- A field declaring `columnMapping` SHALL declare `dataSource`. A mapping over
  inline options names a column no list declares.
- A field declaring `columnMapping` SHALL have `type` `"select"`. A
  `multiselect` picks several rows, and one target field cannot take several
  values.
- Each key SHALL match `/^[a-z_][a-z0-9_]*$/` and stay within `MAX_KEY_LENGTH`.
- Each target SHALL resolve against the body's recursive field set.
- A target SHALL NOT be the mapping field itself.
- A target SHALL NOT be a `group` field. A group holds fields and takes no
  value.
- Two keys SHALL NOT name one target. Two columns writing one field give the
  write no order.

The compile pass SHALL NOT check a key against any data list. Publishing stays
independent of the state of the data, exactly as `db-data-source-type` already
requires. A key naming no declared column writes nothing at runtime.

#### Scenario: A valid mapping publishes
- **WHEN** an author publishes a `select` field bound to a data source, mapping
  `price` onto a `number` field of the catalog
- **THEN** the publish succeeds

#### Scenario: A mapping without a data source fails the publish
- **WHEN** a field declares `columnMapping` and inline `options`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A mapping on a multiselect fails the publish
- **WHEN** a `multiselect` field declares `columnMapping`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: An unresolvable target fails the publish
- **WHEN** a `columnMapping` value names a `FieldId` the body does not declare
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A self-target fails the publish
- **WHEN** a `columnMapping` value names the mapping field itself
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A group target fails the publish
- **WHEN** a `columnMapping` value names a field whose type is `"group"`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: Two columns onto one target fail the publish
- **WHEN** two `columnMapping` keys name one `FieldId`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A key naming no declared column still publishes
- **WHEN** an author maps a column key that the bound list does not declare
- **THEN** the publish succeeds, because publishing reads no data list
