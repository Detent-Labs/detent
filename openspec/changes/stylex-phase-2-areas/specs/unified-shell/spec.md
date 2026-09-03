## ADDED Requirements

### Requirement: The account group and menu render from compiled styles

The shell's account group and its account menu SHALL render from compiled
component styles. Their rules SHALL leave `shell.css`. The rendered result
SHALL match the previous stylesheet declaration for declaration. That
covers the group's layout, the menu's positioning, spacing and border, and
each menu row's own layout.

The menu's open state SHALL compile from a StyleX conditional value keyed
on the native `:popover-open` pseudo-class. No hand-written rule SHALL
select on `:popover-open` after migration.

#### Scenario: The account group and menu keep their look

- **WHEN** a browser renders the account group and an open account menu
  after the migration
- **THEN** their computed layout, spacing and border equal the values the
  deleted stylesheet declared

#### Scenario: The menu still opens and closes through the Popover API

- **WHEN** an actor triggers the account menu
- **THEN** it opens through the native Popover API, unchanged from before
  the migration
- **AND** its open-state layout renders correctly
