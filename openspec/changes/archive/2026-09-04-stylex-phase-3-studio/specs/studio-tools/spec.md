## ADDED Requirements

### Requirement: The Tools screen renders from compiled styles

`screens/ToolsScreen.tsx` SHALL render from compiled component styles,
reading `form-ui/tokens.stylex`. The rendered result SHALL match the
previous stylesheet declaration for declaration.

#### Scenario: The Tools screen keeps its look

- **WHEN** a browser renders the Tools screen
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared
