## ADDED Requirements

### Requirement: The JSON surface renders from compiled styles

`panels/JsonView.tsx` SHALL compile from typed StyleX style objects,
reading `form-ui/tokens.stylex`. The resulting layout SHALL match the
previous stylesheet declaration for declaration.

#### Scenario: The JSON surface keeps its look

- **WHEN** a browser opens the JSON surface
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared
