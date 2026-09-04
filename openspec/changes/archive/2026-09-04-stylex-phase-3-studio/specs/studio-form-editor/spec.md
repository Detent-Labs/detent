## ADDED Requirements

### Requirement: The form editor renders from compiled styles

`screens/FormEditorScreen.tsx` SHALL render from compiled component
styles, reading `form-ui/tokens.stylex`. The rendered result SHALL
match the previous stylesheet declaration for declaration.

The "How it will look" preview has a two-column layout. It SHALL pick
its style from a parameterized style function, keyed on the column
count. That is the same pattern `form-ui`'s own field renderer uses
for its own columns/span choice. The preview MAY still render a
`data-columns` fact on its container, for a test or another consumer
to read. No stylesheet SHALL select on it after migration.

#### Scenario: The form editor keeps its look

- **WHEN** a browser renders the form editor
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared

#### Scenario: The two-column preview switches correctly

- **WHEN** an author toggles a field group between one and two columns
- **THEN** the preview's computed grid layout matches the deleted
  stylesheet's own two-column and one-column rules
- **AND** no compiled or hand-written stylesheet rule selects on a
  `data-columns` or `data-span` attribute after the migration
