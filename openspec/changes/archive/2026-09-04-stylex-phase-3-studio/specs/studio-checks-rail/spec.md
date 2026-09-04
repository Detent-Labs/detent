## ADDED Requirements

### Requirement: The checks rail renders from compiled styles

`panels/ChecksRail.tsx` SHALL render from compiled component styles,
reading `form-ui/tokens.stylex`. The rendered result SHALL match the
previous stylesheet declaration for declaration. That covers its
collapsed one-line summary state and its full, grouped-by-source state.

#### Scenario: The checks rail keeps its look in both states

- **WHEN** a browser renders the checks rail collapsed and expanded
- **THEN** each state's computed layout, spacing, color and border
  equal the values the deleted stylesheet declared
