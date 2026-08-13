<!-- antislop: allow-file all -->

## ADDED Requirements

### Requirement: The data list screen edits the column declaration

The data list detail screen SHALL let an operator declare the list's columns.
Each row of that editor SHALL carry a key input, a label input and a type
picker over `string`, `number` and `boolean`. The screen SHALL let the operator
add a row and remove one.

Removing a column SHALL warn the operator that the removal drops that column's
value from every value of the list. The warning appears before the save, not
after it.

The screen SHALL report a rejected declaration where the data would otherwise
sit, the way every other failed request in this area already reports.

Every string the screen shows SHALL come from the admin catalog through
`t(locale, key)`, in EN and DE.

#### Scenario: An operator declares a column
- **WHEN** an operator adds a column row, fills its key, label and type, and
  saves
- **THEN** the list carries that column, and the screen shows it after the
  reload

#### Scenario: A removal warns before it saves
- **WHEN** an operator removes a column row from a list whose values fill it
- **THEN** the screen states that the values go with it, before the save

#### Scenario: A rejected declaration reports in place
- **WHEN** the save fails because a key breaks the grammar
- **THEN** the screen shows the error where the declaration sits, and keeps the
  operator's input

### Requirement: The data list screen edits per-value attributes

The value editor SHALL show one input per declared column, beside the value and
its label. The input SHALL match the column's declared type: a checkbox for
`boolean`, a number input for `number`, and a text input for `string`.

A list that declares no columns SHALL show the value editor exactly as it looks
today. No empty attribute area appears.

An inactive value SHALL show its attributes as readonly. The values route
retires such a value rather than editing it, so an editable input there would
promise a write that does not happen.

#### Scenario: A column adds an input to every value row
- **WHEN** a list declares a `price` column of type `number`
- **THEN** every value row carries a number input for it

#### Scenario: A list with no columns looks unchanged
- **WHEN** an operator opens a list that declares no columns
- **THEN** the value editor shows the value and its label alone

#### Scenario: An inactive value shows its attributes readonly
- **WHEN** a list holds an inactive value carrying attributes
- **THEN** the screen shows those attributes and refuses to edit them
