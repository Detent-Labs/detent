# Spec Delta

## ADDED Requirements

### Requirement: A comparison value takes the type of the compared field

The report builder SHALL write a comparison value of the compared field's declared type. A number field takes a number. A boolean field takes a Yes/No choice and writes `true` or `false`. A string field, a field whose column choice has no `type`, and every other field take text. Changing the compared field keeps the value when the new field has the same value type. Otherwise the builder clears the value.

#### Scenario: A number comparison writes a number
- **WHEN** a process owner compares the number field `amount` with `eq` and types `500`
- **THEN** the query holds the number `500` for that comparison
- **AND** the query does not hold the string `"500"`

#### Scenario: A boolean comparison offers a Yes/No choice
- **WHEN** a process owner compares a boolean field
- **THEN** the value control offers an empty choice, Yes and No
- **AND** choosing Yes writes `true`

#### Scenario: A string comparison writes text
- **WHEN** a process owner compares a string field with `eq` and types `open`
- **THEN** the query holds the string `"open"`

#### Scenario: A new field type clears the value
- **WHEN** a process owner changes a comparison from a number field to a boolean field
- **THEN** the comparison has no value until the owner chooses Yes or No

### Requirement: A field that leaves the column choices keeps its last known type

A comparison can narrow the range until a response no longer names its own field. The report builder SHALL remember the type of every field a response named. It SHALL keep that type for the row. For a field it never saw named, the row follows the type of its current value, and otherwise takes text.

#### Scenario: An emptied range keeps the type
- **WHEN** a process owner types a number that matches no instance
- **AND** the next column response names no field
- **THEN** the row keeps its number input and its value

### Requirement: An in comparison takes a comma-separated list

For the operator `in`, the report builder SHALL show one text input. The owner types members separated by commas. The input keeps the typed text while the owner types. The builder trims each member and skips an empty one. It parses each member by the field's declared type and writes the list when every member parses.

#### Scenario: A comma keeps the typed text
- **WHEN** a process owner types `a,b` into an `in` comparison on a string field
- **THEN** the input shows `a,b`
- **AND** the query holds the list `["a", "b"]`

#### Scenario: Members of a number field parse as numbers
- **WHEN** a process owner types `1, 2` into an `in` comparison on a number field
- **THEN** the query holds the list `[1, 2]`

#### Scenario: A trailing comma does not add a member
- **WHEN** a process owner types `a,` into an `in` comparison on a string field
- **THEN** the query holds the list `["a"]`

### Requirement: An incomplete comparison stays out of the query

A comparison is incomplete when the builder has no value to write. That covers an empty input, an unchosen boolean, and a list with a member that does not parse. The builder SHALL mark an incomplete row. It SHALL state the reason in words when the input holds text that does not parse. It SHALL leave the row out of a preview, a save and a column request.

#### Scenario: A number field rejects text that is not a number
- **WHEN** a process owner types `abc` into a comparison on a number field
- **THEN** the row shows that the value is not a number
- **AND** the next preview request omits that comparison

#### Scenario: A new row filters nothing
- **WHEN** a process owner adds a comparison and has not yet typed a value
- **THEN** the row shows as incomplete without an error message
- **AND** the preview request omits it

#### Scenario: A save leaves the incomplete row out
- **WHEN** a process owner saves a report that holds one complete and one incomplete comparison
- **THEN** the saved report holds the complete comparison alone

### Requirement: Editing a filter requests column choices once per pause

The report builder SHALL wait 300 ms after the last change to a filter. Only then does it request column choices. A change inside that window restarts the wait. The first request after the owner picks a process does not wait.

#### Scenario: Picking a process requests column choices at once
- **WHEN** a process owner picks a process
- **THEN** the builder sends the first column request without a wait

#### Scenario: Typing a value sends one column request
- **WHEN** a process owner types the five characters `12345` into a comparison, each less than 300 ms after the last
- **THEN** the builder sends one column request after the last keystroke
