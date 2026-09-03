## ADDED Requirements

### Requirement: The app area's screens render from compiled styles

Every screen and component under `packages/web/src/areas/app/` SHALL
render from compiled component styles, reading `form-ui/tokens.stylex`.
`areas/app/app.css` SHALL carry no rule this migration covers. The
rendered result SHALL match the previous stylesheet declaration for
declaration.

A task's status stamp SHALL pick its tone from a typed lookup keyed on the
task's known status values. A status the lookup does not name SHALL
render the neutral tone, with no color override.

#### Scenario: A migrated screen keeps its look

- **WHEN** a browser renders a migrated app-area screen
- **THEN** its computed layout, spacing, color and border equal the values
  the deleted stylesheet declared

#### Scenario: A task's stamp picks its tone from the lookup

- **WHEN** the My-tasks screen renders a claimed and an unclaimed task
- **THEN** each stamp's tone matches its status through the typed lookup,
  with the same visual result the deleted stylesheet produced

#### Scenario: An unmapped status renders the neutral tone

- **WHEN** a task carries a status the lookup does not name
- **THEN** its stamp renders with the base stamp style and no color
  override
