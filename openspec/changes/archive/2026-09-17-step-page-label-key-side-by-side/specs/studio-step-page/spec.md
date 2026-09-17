## MODIFIED Requirements

### Requirement: The step page names its step and renames it in place

The step page SHALL open with a kicker naming the step's number and its kind.
The step's label SHALL sit under that kicker as a writable line. Typing in
that line SHALL rename the step in the draft.

The step's label and its key SHALL stand side by side in one row, the label
in the wider column. Under the step page's narrow-viewport breakpoint the row
SHALL collapse to one column, label over key. The label's missing-translation
warning SHALL stand under the label's own column, never spanning the row
under the key.

The page SHALL mark the draft's first step. The page SHALL carry one control
that removes the step.

#### Scenario: Renaming the step on the page

- **WHEN** an author types a new label in the step page's name line
- **THEN** the draft carries the new label
- **AND** the rail row for that step reads the new label

#### Scenario: The page marks the first step

- **WHEN** the step page holds the draft's initial step
- **THEN** the page carries a mark naming it the first step

#### Scenario: The label and key stand in one row

- **WHEN** an author opens a step on a wide viewport
- **THEN** the label and its key stand in one row
- **AND** the label's column is wider than the key's column

#### Scenario: The row collapses under the narrow breakpoint

- **WHEN** an author opens a step under the step page's narrow-viewport
  breakpoint
- **THEN** the label stands over the key, each its own full-width row

#### Scenario: A missing-translation warning stays under the label

- **WHEN** the step's label is missing a translation for the content locale
- **THEN** the warning stands under the label's own column
- **AND** the warning does not span the width of the key's column
