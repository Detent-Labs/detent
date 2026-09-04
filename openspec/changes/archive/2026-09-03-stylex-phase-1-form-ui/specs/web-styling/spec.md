## ADDED Requirements

### Requirement: A DOM-attribute variant becomes a code-side style choice

A hand-written stylesheet once picked a layout via a `data-*` attribute
selector. Once migrated, the component's own code SHALL pick among named
StyleX styles instead. The component MAY still render the same `data-*`
attribute as a plain fact. A test or another consumer can read it. No
compiled or hand-written stylesheet SHALL select on it after migration.

This does not extend a component's public props. The component decides
which named style applies. It reads a value it already computes. A
caller passes nothing new to get this.

#### Scenario: A two-way layout switch compiles from two named styles

- **WHEN** a migrated component has a layout property with two known
  outcomes
- **THEN** the build's compiled stylesheet contains a style for each
  outcome, and the component's own code picks between them
- **AND** no rule in the compiled stylesheet names a `data-*` attribute
  selector as its key

#### Scenario: The DOM attribute survives as a plain fact, unread by any stylesheet

- **WHEN** a migrated component still renders the `data-*` attribute that
  used to drive its styling
- **THEN** the attribute's value matches what the component's own style
  choice used to select the same layout
- **AND** no compiled or hand-written rule in the bundle selects on it
