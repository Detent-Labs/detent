## ADDED Requirements

### Requirement: The panels screen and its process-wide views render from compiled styles

The panels screen has four process-wide views. They are the field
catalog, the field matrix's toolbar and legend, the data sources
panel, and the contract panel. The panels screen, the field catalog,
the field matrix and the data sources panel SHALL render from compiled
component styles. Each reads `form-ui/tokens.stylex`. The rendered
result SHALL match the previous stylesheet declaration for
declaration.

The contract panel renders no class this migration covers. It already
satisfies this requirement, unchanged, since it carries no rule to
compile.

The field matrix's cell state, hatched, blank or live, SHALL pick its
style from an exhaustive check. That check covers this closed,
three-value type in full. A blank cell carries no extra style. That
matches today's stylesheet, which declares no rule for it either.

#### Scenario: The panels screen keeps its look

- **WHEN** a browser renders the panels screen after the migration
- **THEN** the field catalog keeps its computed layout, spacing, color
  and border
- **AND** the field matrix and the data sources panel each do too
- **AND** every value matches the deleted stylesheet's own

#### Scenario: A field matrix cell's state picks the right style

- **WHEN** the field matrix renders a hatched cell, a live cell, and a
  blank cell side by side
- **THEN** each renders the same visual result the deleted stylesheet
  produced
- **AND** the blank cell carries no color override

### Requirement: The process list, its dialogs, and the templates and versions screens render from compiled styles

`screens/ProcessesScreen.tsx` (the process list, its promotion-preview
dialog and its start-picker dialog), `screens/TemplatesScreen.tsx`, and
`screens/VersionsScreen.tsx` SHALL render from compiled component
styles. The rendered result SHALL match the previous stylesheet
declaration for declaration.

#### Scenario: The process list and its dialogs keep their look

- **WHEN** a browser renders the process list, then opens its
  promotion-preview dialog and its start-picker dialog
- **THEN** each one's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared, including the dialogs'
  `::backdrop`

#### Scenario: The templates and versions screens keep their look

- **WHEN** a browser renders the templates screen and the versions
  screen
- **THEN** each one's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared

### Requirement: Discarding a draft's confirmation dialog renders from compiled styles

`panels/ProcessHeaderBar.tsx` renders the discard-confirmation dialog,
per this capability's own "Discarding a draft confirms in a modal
dialog" requirement. The dialog SHALL render from compiled component
styles. The header bar around it is a different capability's own
concern. Only the dialog itself is this requirement's scope.

#### Scenario: The discard dialog keeps its look

- **WHEN** a browser opens the discard-confirmation dialog
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared, including its `::backdrop`

### Requirement: The content-locale switcher renders from compiled styles

`panels/shared/ContentLocaleSwitcher.tsx` SHALL render from compiled
component styles. The rendered result SHALL match the previous
stylesheet declaration for declaration.

#### Scenario: The content-locale switcher keeps its look

- **WHEN** a browser renders the header bar's content-locale switcher
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared
