## ADDED Requirements

### Requirement: The reporting area's screens cap their content column at 80rem

Every reporting-area screen SHALL center its content in a column capped at
80rem — the same cap the admin and studio areas use for a scanning,
tool-like screen.

#### Scenario: A wide viewport still keeps the column capped

- **WHEN** a process owner opens a reporting-area screen on a viewport
  wider than 80rem
- **THEN** the screen's content column renders at 80rem, centered in the
  available width
