# Spec Delta

## ADDED Requirements

### Requirement: The instance.query form writes a literal of the compared field's declared type

The form SHALL write a comparison literal of the compared field's declared type. It reads that type from the published versions of the target process. The newest version that declares the field decides.

A number field takes a number. A boolean field takes a Yes/No choice and writes `true` or `false`. A string field, a plugin-typed field and any other field take text.

#### Scenario: A number field writes a number
- **WHEN** a developer picks the number field `priority`, keeps `eq` and types `1`
- **THEN** the committed comparison holds the number `1`
- **AND** it does not hold the string `"1"`

#### Scenario: A boolean field writes true or false
- **WHEN** a developer picks a boolean field and chooses Yes
- **THEN** the committed comparison holds the boolean `true`

#### Scenario: A string field keeps text
- **WHEN** a developer picks a string field and types `open`
- **THEN** the committed comparison holds the string `"open"`

#### Scenario: Text that does not parse leaves the entry without a value
- **WHEN** a developer types `abc` into the literal of a number field
- **THEN** the input keeps `abc`
- **AND** the row states that the value is not a number
- **AND** the committed comparison holds neither `value` nor `valueFromField`

#### Scenario: A saved number reopens as a number
- **WHEN** the config holds the number `1` for a number field
- **THEN** the literal input shows `1`

#### Scenario: A plugin-typed field takes text
- **WHEN** the catalog holds the compared field with a plugin envelope as its type
- **THEN** the literal control takes text

#### Scenario: A new field of another value type clears the literal
- **WHEN** a developer changes the compared field from a number field to a boolean field
- **THEN** the committed comparison has no literal until the developer chooses Yes or No

### Requirement: The literal control stays disabled while the type is unknown

The literal control SHALL refuse input while the compared field's type is unknown. The type is unknown in three cases. The catalog still loads. The catalog fetch ended in an error. The catalog lacks the picked field.

#### Scenario: The literal control waits for the type
- **WHEN** the target catalog is loading, or the developer has not picked a field
- **THEN** the literal control refuses input

#### Scenario: A field the catalog lacks refuses input
- **WHEN** the loaded catalog does not hold the compared field
- **THEN** the literal control refuses input
- **AND** the form marks the field reference as stale

### Requirement: An in comparison takes a comma-separated list

For the operator `in`, the form SHALL show one text input for a comma-separated list. It SHALL NOT offer a field of the process the developer is editing as the right side. The input keeps the typed text. The form trims each member, skips an empty one and parses the rest by the field's declared type. It writes the list when every member parses.

#### Scenario: A list of numbers parses
- **WHEN** a developer types `1, 2` into an `in` comparison on a number field
- **THEN** the committed comparison holds the list `[1, 2]`

#### Scenario: A comma keeps the typed text
- **WHEN** a developer types `a,b` into an `in` comparison on a string field
- **THEN** the input shows `a,b`
- **AND** the committed comparison holds the list `["a", "b"]`

#### Scenario: The own-field right side is absent for in
- **WHEN** a developer picks the operator `in`
- **THEN** the right-side choice offers the literal list alone

#### Scenario: Switching the operator drops the old right side
- **WHEN** a developer changes the operator from `eq` to `in`
- **THEN** the committed comparison has no scalar `value` and no `valueFromField`

### Requirement: An unreadable target catalog shows an error and marks nothing stale

When the fetch of the target catalog fails, the form SHALL show one error row. The row sits where the step and field pickers would sit. The form SHALL mark no reference as stale. A fetch still in flight shows neither the error nor a stale mark.

#### Scenario: A failed fetch marks no reference stale
- **WHEN** the fetch of the target catalog fails
- **AND** the config names a step id, a label field and a compared field
- **THEN** the form shows the error row
- **AND** the form marks none of those references as stale

#### Scenario: Another process clears the error
- **WHEN** a developer picks a second process whose catalog loads
- **THEN** the error row disappears

### Requirement: Attribute rows keep their identity while the developer types a key

Each attribute row SHALL keep its identity while the developer types its column key. The key input keeps focus across keystrokes. The form SHALL write a row's key only when the key is non-empty and no earlier row holds it. It SHALL mark a row whose key an earlier row holds. A row with an empty key SHALL NOT block the add control. A change to `attributes` through the raw JSON view SHALL show in the rows.

#### Scenario: Typing a key keeps focus
- **WHEN** a developer adds an attribute row and types `cost_center`
- **THEN** the key input keeps focus after each character
- **AND** the committed config holds the key `cost_center`

#### Scenario: A duplicate key gets a mark and stays unmerged
- **WHEN** a developer types a key that an earlier row holds
- **THEN** the form marks the later row and keeps its typed text
- **AND** the committed config keeps the earlier row's entry unchanged

#### Scenario: A second add works while a key is empty
- **WHEN** a row has an empty key and the developer presses add attribute
- **THEN** the form shows a second row

#### Scenario: A raw JSON change shows in the rows
- **WHEN** the developer changes `attributes` in the raw JSON view and returns to the form
- **THEN** the rows show the new attributes
