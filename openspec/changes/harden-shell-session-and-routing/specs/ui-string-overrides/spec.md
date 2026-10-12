## ADDED Requirements

### Requirement: The override read stops after five seconds

The read that runs before the first render SHALL stop when 5000 ms have passed without a complete answer. The system SHALL treat that stop as a failed read: the override map stays empty, and every screen renders its builtin value. The login screen SHALL render at that point.

#### Scenario: The override route never answers

- **WHEN** the override read gets no response for 5000 ms
- **THEN** the login screen renders from the builtin catalog
- **AND** no screen waits on the read any longer

#### Scenario: A fast answer is used

- **WHEN** the override read answers within 5000 ms
- **THEN** the stored overrides are in place before the first render
