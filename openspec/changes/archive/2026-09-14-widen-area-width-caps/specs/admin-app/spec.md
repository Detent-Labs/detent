## ADDED Requirements

### Requirement: The admin area's screens cap their content column at 80rem

Every admin-area screen SHALL center its content in a column capped at
80rem. That keeps room to work for an operator scanning a wide table or
record.

#### Scenario: A wide viewport still keeps the column capped

- **WHEN** an operator opens an admin-area screen on a viewport wider than
  80rem
- **THEN** the screen's content column renders at 80rem, centered in the
  available width
