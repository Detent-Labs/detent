## ADDED Requirements

### Requirement: The publish-confirmation dialog renders from compiled styles

`panels/ProcessHeaderBar.tsx` renders the publish-confirmation dialog.
This capability's own requirement names it: "Publishing confirms in a
modal dialog that names the version and its immutability." The dialog
SHALL render from compiled component styles, including its
`::backdrop`. The header bar around it is a different capability's own
concern. Only the dialog itself is this requirement's scope.

This is a first use of `::backdrop` for this repo's StyleX adoption. A
task verifies it against a real build first, before this requirement's
own implementation task runs. That follows `web-styling`'s own
requirement: a phase verifies an unproven compiler feature against a
real build first.

#### Scenario: The publish dialog keeps its look

- **WHEN** a browser opens the publish-confirmation dialog
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared, including its `::backdrop`

#### Scenario: The dialog still opens, traps focus, and dismisses correctly

- **WHEN** an author opens the publish-confirmation dialog with the
  keyboard, then presses Escape
- **THEN** the dialog still opens through the native `showModal()` call,
  unchanged from before the migration
- **AND** focus returns to the control that opened it
