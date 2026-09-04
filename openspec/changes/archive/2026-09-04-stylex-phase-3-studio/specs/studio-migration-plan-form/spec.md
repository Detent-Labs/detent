## ADDED Requirements

### Requirement: The migration-plan screen renders from compiled styles

`screens/MigrationPlanScreen.tsx` and `panels/MigrationSpecEditor.tsx`
SHALL render from compiled component styles, reading
`form-ui/tokens.stylex`. The rendered result SHALL match the previous
stylesheet declaration for declaration, including the raw-JSON textarea
fallback state.

#### Scenario: The migration-plan screen keeps its look in both states

- **WHEN** a browser renders the migration-plan form and its raw-JSON
  textarea fallback
- **THEN** each state's computed layout, spacing, color and border
  equal the values the deleted stylesheet declared
