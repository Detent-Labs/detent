## ADDED Requirements

### Requirement: The app area's screens cap their content column at 61rem

Every app-area screen SHALL center its content in a column capped at
61rem. The cap holds regardless of viewport width; on a narrower viewport
the column shrinks with it, down to the screen's own side padding.

#### Scenario: A wide viewport still keeps the column capped

- **WHEN** a participant opens an app-area screen on a viewport wider than
  61rem
- **THEN** the screen's content column renders at 61rem, centered in the
  available width

#### Scenario: A narrow viewport shrinks the column below the cap

- **WHEN** a participant opens an app-area screen on a viewport narrower
  than 61rem
- **THEN** the screen's content column shrinks with the viewport, down to
  the screen's own side padding
