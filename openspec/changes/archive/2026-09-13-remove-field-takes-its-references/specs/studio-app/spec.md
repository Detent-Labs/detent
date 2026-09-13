## ADDED Requirements

### Requirement: Removing a field that reaches past the field catalog confirms first

A removed field is the field an author removes on the Fields tab, or any field
inside it. A removal reaches past the field catalog when a removed field meets
any of these conditions:

- a step's view carries an entry naming it
- it is a group that holds a field
- an action output or a subprocess output mapping writes it
- the contract lists it as an input field or an output field
- another field's column mapping targets it
- a CEL expression the removal keeps reads its key
- a plugin's `config` names its id

Remove field SHALL remove a field with no such reach at once, with no dialog.
A removal with reach SHALL first confirm in a modal dialog of the studio's own.
It SHALL NOT use the browser's `confirm()` prompt.

The dialog SHALL take the treatment `studio-publish` fixes for the publish
dialog. That means the native `dialog` element opened with `showModal()`, an
accessible name through `aria-labelledby`, and a platform cancel read as a
decline. The studio SHALL place the initial focus on the declining control
itself. The confirming control SHALL NOT hold it, since the studio has no undo.
The dialog SHALL render from compiled component styles.

Declining SHALL leave the draft untouched. Focus SHALL then return to Remove
field.

#### Scenario: A field no step shows and nothing names leaves at once

- **WHEN** the author presses Remove field on a field that has no reach
- **THEN** the field leaves the field catalog
- **AND** no dialog opens

#### Scenario: A field whose own rule reads its key leaves at once

- **WHEN** no step shows a field, and only its own `validation.rule` reads its
  key
- **AND** the author presses Remove field on that field
- **THEN** the field leaves the field catalog
- **AND** no dialog opens

#### Scenario: A field on four steps asks first

- **WHEN** four step views in the IT Offboarding draft carry "Access Excel
  updated or prepared"
- **AND** the author presses Remove field on that field
- **THEN** a modal dialog opens
- **AND** the draft still carries the field and its four view entries

#### Scenario: The confirming control never holds the opening focus

- **WHEN** the removal dialog opens
- **THEN** the declining control holds the focus
- **AND** the confirming control does not hold it

#### Scenario: Declining keeps the draft and the focus place

- **WHEN** the author cancels the removal dialog, or dismisses it with Escape
- **THEN** the draft stays unchanged
- **AND** Remove field holds the focus again

### Requirement: The removal dialog counts each kind of reach

The dialog's heading SHALL name the removed field by its label. Its facts SHALL
name the field's key beside the label, when the field carries a key. For a
group, the heading SHALL say that the removal takes a group.

The facts SHALL state one count per kind of reach the removal carries. The
kinds are these:

- the fields inside a removed group, at every depth
- the steps whose view carries an entry naming a removed field
- the action outputs and subprocess output mappings that write a removed field
- the contract list entries naming a removed field
- the column mapping entries that target a removed field
- the CEL expressions the removal keeps that read a removed field's key
- the plugin config values that name a removed field's id

The facts SHALL state no row for a kind the removal does not carry. The dialog
SHALL name no step, no expression and no config by itself. The "Used in" zone
already lists the steps.

#### Scenario: A group states the fields inside it and its steps

- **WHEN** the author presses Remove field on the group "Processing (Fabrikam)" in
  the IT Offboarding draft
- **THEN** the dialog's heading says the removal takes a group
- **AND** its facts state 18 fields inside and 10 steps

#### Scenario: Only the kinds a removal carries appear

- **WHEN** the author presses Remove field on "Booking Status" in the Expense
  Approval draft
- **THEN** the facts state 2 steps, 1 writing action output, 1 contract list
  entry and 2 CEL expressions
- **AND** the facts lack a column mapping row and a plugin config row

### Requirement: Removing a field clears its view, output, contract and mapping references in one draft change

A removal SHALL take every removed field from the field catalog. The same
draft change SHALL remove every reference outside a plugin `config` that names
a removed field's id:

- every view entry whose `ref` names it, on every step
- every action output entry that targets it, in each of the five action
  positions
- every subprocess output mapping entry keyed by it
- every contract `inputFields` and `outputFields` entry naming it
- every column mapping entry that targets it

Once a group has left, its key names nothing, unless the key is empty or
another group field holds it. The same draft change SHALL also remove every
view entry and note whose `group` names a key that now names nothing. An
emptied action output map or column mapping SHALL leave the draft too. A
subprocess output mapping stays as an empty map, since the definition contract
requires that key.

The removed fields, and the entries the removal takes out, leave with the CEL
expressions they hold. Outside those, the removal SHALL keep every CEL
expression and plugin `config` as it stands. A guard that reads a removed key
keeps its text, and the checks rail reports it. No part of the removal SHALL
land in a separate draft change. A reader between two writes would see a
catalog and references that disagree.

#### Scenario: A removed group keeps another group's entries

- **WHEN** two group fields in a draft hold the key `dup`
- **AND** the author confirms the removal of the first
- **THEN** the second group's card, its members and every note naming `dup`
  stay in place

#### Scenario: A removed field leaves every step view

- **WHEN** the author confirms the removal of "Access Excel updated or
  prepared" in the IT Offboarding draft
- **THEN** no step view carries an entry naming that field
- **AND** the checks rail reports no view check for it

#### Scenario: A removed group takes its members and notes along

- **WHEN** a step view carries a group's card, two field members and one note
  inside it
- **AND** the author confirms the removal of that group
- **THEN** that step view carries neither the card nor its three members
- **AND** every other entry on that step keeps its place

#### Scenario: A writing action stays on its step

- **WHEN** the author confirms the removal of "Booking Status" in the Expense
  Approval draft
- **THEN** the action on Book no longer writes that field
- **AND** the action stays on its step

#### Scenario: The contract stops listing the field

- **WHEN** the author confirms the removal of a field the contract lists as an
  output field
- **THEN** the contract's `outputFields` no longer name that field's id

#### Scenario: An emptied column mapping leaves the draft

- **WHEN** the author confirms the removal of the one field a column mapping
  targets
- **THEN** the mapping field has no `columnMapping` key

#### Scenario: A guard that reads the key keeps its text

- **WHEN** the author confirms the removal of "Booking Status" in the Expense
  Approval draft
- **THEN** the guard on the path from Book to Booked still reads
  `data.booking_status == 'booked'`
- **AND** the checks rail reports that guard's unknown key

### Requirement: A removal on the Fields tab moves focus to the next rail entry and announces itself

After a removal, keyboard focus SHALL land on the entity rail entry of the
field the tab selects next. The tab selects that field by its neighbour rule.
When the last field leaves the catalog, focus SHALL land on the control that
adds the first field.

The tab SHALL announce each removal through its live region. The announcement
SHALL name the removed field by its label. A group's announcement SHALL also
state how many fields left with it, when any did. A declined dialog SHALL
announce nothing.

#### Scenario: Focus lands on the rail entry the tab selects next

- **WHEN** the author confirms the removal of a field that has a next sibling
- **THEN** that sibling's rail entry holds keyboard focus

#### Scenario: Removing the last field focuses the first-field control

- **WHEN** the author removes the only field the catalog holds
- **THEN** the control that adds the first field holds keyboard focus

#### Scenario: The tab announces the removed field

- **WHEN** the author confirms the removal of "Booking Status"
- **THEN** the tab's live region names "Booking Status" as removed

#### Scenario: A group's announcement counts the fields that left

- **WHEN** the author confirms the removal of the group "Processing (Fabrikam)"
- **THEN** the tab's live region names the group and states 18 fields
