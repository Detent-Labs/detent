## ADDED Requirements

### Requirement: The admin area's screens render from compiled styles

Every screen and component under `packages/web/src/areas/admin/` SHALL
render from compiled component styles, reading `form-ui/tokens.stylex`.
`areas/admin/app.css` SHALL carry no rule this migration covers. The
rendered result SHALL match the previous stylesheet declaration for
declaration.

Three badges carry an open-ended status value: an outbox delivery's, an
instance's, and any other admin badge like them. Each SHALL pick its tone
from a typed lookup, keyed on that screen's known status values. A status
the lookup does not name SHALL render the neutral tone, with no color
override.

#### Scenario: A migrated screen keeps its look

- **WHEN** a browser renders a migrated admin-area screen
- **THEN** its computed layout, spacing, color and border equal the values
  the deleted stylesheet declared

#### Scenario: The outbox badge renders with seeded data

- **WHEN** the outbox screen lists a delivered and a dead-letter row
- **THEN** each row's badge tone matches its status through the typed
  lookup
- **AND** the visual result matches what the deleted stylesheet produced

#### Scenario: An unmapped status renders the neutral tone

- **WHEN** a row carries a status a screen's lookup does not name
- **THEN** its badge renders with the base badge style and no color
  override
