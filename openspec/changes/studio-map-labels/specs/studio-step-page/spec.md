## MODIFIED Requirements

### Requirement: One section stands open at a time

At most one section SHALL stand open. Opening a section SHALL close the open
one. Pressing the open section's header SHALL close it. A selected way out
SHALL open Ways out. A repeated open request for the selected way out SHALL
open Ways out again.

#### Scenario: Opening one closes the other

- **WHEN** Who acts stands open and the author presses the Form header
- **THEN** Form stands open
- **AND** Who acts stands closed

#### Scenario: The open header closes its section

- **WHEN** Form stands open and the author presses the Form header
- **THEN** no section stands open

#### Scenario: A selected way out opens Ways out

- **WHEN** a press on a canvas path selects a way out of this step
- **THEN** Ways out stands open
- **AND** that way out's row carries the current mark

#### Scenario: A repeated request reopens Ways out

- **WHEN** a way out of this step stays selected, and the author folded Ways
  out
- **AND** the Map tab opens that way out again
- **THEN** Ways out stands open
