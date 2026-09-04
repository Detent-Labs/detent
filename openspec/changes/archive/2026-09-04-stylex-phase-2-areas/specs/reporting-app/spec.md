## ADDED Requirements

### Requirement: The reporting area's screens render from compiled styles

Every screen and component under `packages/web/src/areas/reporting/`
SHALL render from compiled component styles, reading
`form-ui/tokens.stylex`. `areas/reporting/app.css` SHALL carry no rule
this migration covers. The rendered result SHALL match the previous
stylesheet declaration for declaration.

The duration bar's tone and layout classes SHALL compile from StyleX. Its
numeric width SHALL stay a literal inline style instead, computed at
render time from the fraction it depicts. StyleX has no mechanism for an
arbitrary runtime number.

A report cell's data kind SHALL pick its style from a typed lookup keyed
on that view's known kind values.

#### Scenario: A migrated screen keeps its look

- **WHEN** a browser renders a migrated reporting-area screen
- **THEN** its computed layout, spacing, color and border equal the values
  the deleted stylesheet declared

#### Scenario: The duration bar renders with seeded data

- **WHEN** a view renders a duration bar for a real fraction
- **THEN** the bar's computed width matches that fraction
- **AND** its tone class matches the deleted stylesheet's visual result

#### Scenario: A report cell picks its style from the lookup

- **WHEN** a table renders a cell whose data kind the lookup names
- **THEN** the cell's style matches the deleted stylesheet's visual result
  for that kind
