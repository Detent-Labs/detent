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

### Requirement: The rest of shell.css renders from compiled styles

`shell.css`'s remaining rules SHALL render from compiled component
styles. Five things carry them. One is the shared nav wrapper every
area's root component renders. The rest are the login screen, the error
banner, the error boundary fallback, and the profile page. `shell.css`
SHALL carry no rule this migration covers. The rendered result SHALL
match the previous stylesheet declaration for declaration.

The shared nav wrapper's class SHALL migrate at every call site
together. That includes the studio area's own root component. Deferring
that one call site would leave it carrying a literal class no compiled
rule matches. Nothing else in studio needs to change to make that true.

#### Scenario: The nav wrapper keeps its look everywhere

- **WHEN** a browser renders any area's nav wrapper after the migration,
  studio's included
- **THEN** its computed layout equals the value the deleted stylesheet
  declared

#### Scenario: The login, error and profile screens keep their look

- **WHEN** a browser renders the login screen after the migration
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared
- **AND** the same holds for an error banner, the error boundary
  fallback, and the profile page
