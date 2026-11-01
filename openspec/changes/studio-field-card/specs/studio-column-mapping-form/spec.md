# Spec Delta

## MODIFIED Requirements

### Requirement: The field catalog edits a field's columnMapping

The field catalog panel SHALL offer an editor for a field's `columnMapping`.
The editor SHALL show one row per mapped column. An author SHALL add a row
and remove one.

A row SHALL carry two controls. The first picks a column key. The second
picks the catalog field that column writes into. It SHALL print each field
by its label, or "(unnamed field)". It SHALL never print a key.

The editor SHALL write through the draft store like every other panel field.
It SHALL introduce no route and no schema key.

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live requirement. -->
A field carrying no mapping SHALL show the editor with no rows. The draft
body SHALL still carry no `columnMapping` for that field.

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live scenario. -->
#### Scenario: A field carries no mapping yet

- **WHEN** an author opens a mappable field whose `columnMapping` is absent
<!-- antislop: allow negation-habit -->
- **THEN** the editor shows no row, and the draft body carries no
  `columnMapping` for that field

#### Scenario: The author maps a column

- **WHEN** an author adds a row, picks the `price` column and a number field
  as its target
- **THEN** the draft body carries `columnMapping` with `price` against that
  field's id

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live scenario. -->
#### Scenario: Removing the last row drops the key

- **WHEN** an author removes the only mapped row
<!-- antislop: allow negation-habit -->
- **THEN** the draft body carries no `columnMapping` for that field, rather
  than an empty object

#### Scenario: The target picker prints labels

- **WHEN** an author opens a mapping row's target picker on a draft whose
  field "Unit price" carries the key `unit_price`
- **THEN** the picker offers "Unit price"
- **AND** no option reads `unit_price`
