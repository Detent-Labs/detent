## ADDED Requirements

### Requirement: A DOM-attribute variant becomes a code-side style choice

A layout choice a hand-written stylesheet selected via a `data-*` attribute
SHALL, once migrated, be chosen among named StyleX styles in application
code instead. The component MAY still render the same `data-*` attribute,
as a plain fact a test or another consumer can read; no compiled or
hand-written stylesheet SHALL select on it after migration.

This does not extend a component's public props. The component decides
which named style applies from a value it already computes; a caller
passes nothing new to get this.

#### Scenario: A two-way layout switch compiles from two named styles

- **WHEN** a migrated component has a layout property with two known
  outcomes
- **THEN** the build's compiled stylesheet contains a style for each
  outcome, and the component's own code picks between them
- **AND** no rule in the compiled stylesheet is keyed on a `data-*`
  attribute selector

#### Scenario: The DOM attribute survives as a plain fact, unread by any stylesheet

- **WHEN** a migrated component still renders the `data-*` attribute that
  used to drive its styling
- **THEN** the attribute's value matches what the component's own style
  choice used to select the same layout
- **AND** no compiled or hand-written rule in the bundle selects on it
