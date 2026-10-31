## ADDED Requirements

### Requirement: The Form section states the form's size in words

The Form section SHALL state the step's form in one sentence. It counts field
entries as a Forms tab card counts them (`studio-forms-overview`). A group
entry and a note add nothing. Where a counted entry declares `required:
true`, the sentence SHALL state how many do. A view with no counted entry,
and a step with no view, SHALL read "No fields yet".

The section SHALL print no count of the whole catalog.

#### Scenario: A form with a required field

- **WHEN** a step's view holds four field entries and one declares
  `required: true`
- **THEN** the Form section reads "4 fields, 1 required"

#### Scenario: A step with no form yet

- **WHEN** a step declares no view
- **THEN** the Form section reads "No fields yet"

### Requirement: The Form section opens the step's form

The Form section SHALL carry one control that opens the form editor for the
step. It SHALL read "Start the form" while the section reads "No fields
yet", and "Open the form" otherwise. Those are the Forms card's own words.

#### Scenario: The control names an existing form

- **WHEN** a step's view holds one field entry
- **THEN** the Form section's control reads "Open the form"

#### Scenario: The control names a form to start

- **WHEN** a step declares no view
- **THEN** the Form section's control reads "Start the form"

#### Scenario: The control opens the form editor

- **WHEN** the author presses the Form section's control on the Approve
  step
- **THEN** the form editor opens for Approve, under the tab row with Steps
  current
