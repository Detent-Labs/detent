## ADDED Requirements

### Requirement: The admin area's screens render from compiled styles

Every screen and component under `packages/web/src/areas/admin/` SHALL
render from compiled component styles, reading `form-ui/tokens.stylex`.
`areas/admin/app.css` SHALL carry no rule this migration covers. The
rendered result SHALL match the previous stylesheet declaration for
declaration.

An outbox delivery's status is open-ended: `OutboxRow.status` carries no
fixed set of values at the type level. Its badge SHALL pick its tone
from a typed lookup, keyed on the statuses `admin/app.css` named. A
status the lookup does not name SHALL render the neutral tone, with no
color override.

An instance's status carries a fixed four-value union instead. Its
badge SHALL pick its tone from an exhaustive typed lookup keyed on all
four values. TypeScript SHALL reject a lookup missing one. A
boolean-shaped badge, such as a data list's retired flag, MAY instead
pick between two named styles directly.

#### Scenario: A migrated screen keeps its look

- **WHEN** a browser renders a migrated admin-area screen
- **THEN** its computed layout, spacing, color and border equal the values
  the deleted stylesheet declared

#### Scenario: The outbox badge renders with seeded data

- **WHEN** the outbox screen lists a delivered and a dead-letter row
- **THEN** each row's badge tone matches its status through the typed
  lookup
- **AND** the visual result matches what the deleted stylesheet produced

#### Scenario: An unmapped outbox status renders the neutral tone

- **WHEN** an outbox row carries a status the lookup does not name
- **THEN** its badge renders with the base badge style and no color
  override

#### Scenario: The instance badge picks its tone from the exhaustive lookup

- **WHEN** the instances screen lists a running and a completed instance
- **THEN** each row's badge tone matches its status through the lookup
- **AND** the visual result matches what the deleted stylesheet produced
