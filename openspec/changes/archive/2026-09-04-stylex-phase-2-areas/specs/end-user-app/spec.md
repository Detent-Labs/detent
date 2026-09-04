## ADDED Requirements

### Requirement: The app area's screens render from compiled styles

Every screen and component under `packages/web/src/areas/app/` SHALL
render from compiled component styles, reading `form-ui/tokens.stylex`.
`areas/app/app.css` SHALL carry no rule this migration covers. The
rendered result SHALL match the previous stylesheet declaration for
declaration.

A task's status stamp reads a closed, four-value status: open, settled,
dormant or refusal. On a multi-tone screen, the stamp SHALL pick its tone
from an exhaustive typed lookup, keyed on all four values. TypeScript
SHALL reject a lookup missing one. On a screen where every task shares
one tone by construction, the stamp MAY apply that tone directly,
unconditionally.

#### Scenario: A migrated screen keeps its look

- **WHEN** a browser renders a migrated app-area screen
- **THEN** its computed layout, spacing, color and border equal the values
  the deleted stylesheet declared

#### Scenario: A task's stamp picks its tone from the exhaustive lookup

- **WHEN** the "Cases I started" or "Cases I took part in" screen renders
  tasks in more than one status
- **THEN** each stamp's tone matches its status through the lookup, with
  the same visual result the deleted stylesheet produced

#### Scenario: The My-tasks screen applies one tone directly

- **WHEN** the My-tasks screen renders a claimed and an unclaimed task
- **THEN** both stamps render in the same open tone
- **AND** this matches the deleted stylesheet, whose
  `.app-stamp-mine`/`.app-stamp-open` rule was already one shared
  declaration
