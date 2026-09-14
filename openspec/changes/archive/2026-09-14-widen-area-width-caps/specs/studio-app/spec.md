## ADDED Requirements

### Requirement: The studio area's bare screens cap their content column at 80rem

Every studio-area screen that is not the process surface SHALL center its
content in a column capped at 80rem. This covers Processes, Templates,
Tools, Versions, the Player, and the rest. The process surface itself,
the edit screen's ten-tab body, has no cap of its own. It is exempt from
this requirement, per its existing, unchanged layout.

#### Scenario: A wide viewport still keeps a bare studio screen's column capped

- **WHEN** a developer opens a bare studio screen, not the process surface,
  on a viewport wider than 80rem
- **THEN** the screen's content column renders at 80rem, centered in the
  available width

#### Scenario: The process surface stays uncapped

- **WHEN** a developer opens the process surface on any viewport width
- **THEN** its tab row and body fill the viewport width, unaffected by this
  requirement
