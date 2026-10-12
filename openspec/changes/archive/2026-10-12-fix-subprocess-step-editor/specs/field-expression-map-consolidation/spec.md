## ADDED Requirements

### Requirement: The shared editor keeps every row and every target distinct

`FieldExpressionMapEditor` SHALL keep a row after the author clears its CEL
text. The row stays as an entry with an empty `src` and the same target. Only
the row's remove control SHALL take a row out.

The target select of a row SHALL disable each target that another row already
has. Choosing a target therefore never overwrites another row's expression.
The select SHALL offer no `group` field, since a group has no value of its own.

A caller supplies the target list. The subprocess `inputMapping` editor passes
the child's input fields. Every other caller passes the calling process's
fields.

#### Scenario: Clearing a row's CEL text

- **WHEN** an author clears all text from the CEL input of the row for target
  A
- **THEN** the mapping still has an entry for A with an empty `src`
- **AND** the row stays on screen with its target

#### Scenario: A taken target stays disabled

- **WHEN** an `outputMapping` has rows for targets A and B
- **THEN** the select in row A shows B as disabled
- **AND** the select in row B shows A as disabled

#### Scenario: A group field is not a target

- **WHEN** the calling process has a `group` field and two scalar fields
- **THEN** the target select of an `outputMapping` row offers the two scalar
  fields
- **AND** it offers no group field

#### Scenario: The remove control takes the row out

- **WHEN** an author presses the remove control of a row
- **THEN** the mapping no longer has that row's target
