<!-- antislop: allow-file passive-voice -->
<!-- Why: a scenario states an outcome, and the actor is the system under test. -->
## ADDED Requirements

### Requirement: A step's checks stand at their sections

The step page SHALL route each open issue naming a step to the section that
owns it. An issue naming a way out, a time limit or an action under the step
SHALL take the same route. The section's header SHALL carry the count.

The body SHALL print a step-level issue as a sentence above its controls. It
SHALL leave a row's own issue at that row. The masthead SHALL keep only an
issue no section owns. The Checks tab SHALL keep listing every one of them.

#### Scenario: A time limit's check counts on Time limit

- **WHEN** a check names a step's time limit
- **THEN** the Time limit header carries a badge reading 1
- **AND** the sentence stands at that time limit's row inside the body
- **AND** the Checks tab lists the same check

#### Scenario: A step-level check stands above the controls

- **WHEN** a structural check names a step's assignment
- **THEN** the Who acts body prints the sentence above the assignment controls
- **AND** no other section prints it

#### Scenario: An unowned check stays on the masthead

- **WHEN** a check names a step's own key
- **THEN** the masthead prints it
- **AND** no section header counts it
