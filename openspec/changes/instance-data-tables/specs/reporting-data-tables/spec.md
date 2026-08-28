## Purpose

The process-owner-facing screen for building, saving, sharing and viewing a
report table over instance field values — a separate, save/share-capable
screen inside the reporting area, distinct from the area's three existing
read-only cycle-time/bottleneck/SLA views.

## ADDED Requirements

### Requirement: The report builder lives in the reporting area under its existing access rules

The report builder screen SHALL live at `packages/web/src/areas/reporting`,
reach the engine only over the HTTP wrapper, and require the same
sign-in-plus-reports-role gate the area's other three views already require.
It SHALL follow the same unauthenticated and missing-role handling as the
existing views: an unauthenticated visitor sees the login screen, and a
signed-in actor lacking the reports role sees an explicit refusal naming the
missing role.

#### Scenario: An unauthenticated visitor sees the login screen

- **WHEN** a visitor with no stored session opens the report builder
- **THEN** the login screen is shown and no report request is sent

#### Scenario: A signed-in actor without the role is told which role is missing

- **WHEN** an actor without the reports role opens the report builder
- **THEN** the screen states that the reports role is required, and shows no
  report data

### Requirement: A report is built from a process, filters and an ordered column list

The screen SHALL let a process owner pick one target process, the same
status and date-range filters and field comparisons the other reporting
views already expose controls for, and an ordered list of columns drawn from
the union of field catalogs the `instance-data-tables` capability returns
for that process and range. Adding a column SHALL show which of the target
process's versions in range declare the chosen field, for a field not common
to all of them.

#### Scenario: A column choice shows its version coverage

- **WHEN** a process owner adds a column for a field that only one of
  several in-range versions declares
- **THEN** the builder shows that the field is not present in every in-range
  version

### Requirement: The merge-column editor shows its collision count

Configuring a merge column SHALL let a process owner pick an ordered list of
source fields, and SHALL show, once a preview or a save has run, how many
rows the merge marked as a collision for that column. The editor SHALL NOT
hide a collision by silently picking one source value.

#### Scenario: A collision count is shown for a merge column

- **WHEN** a merge column's source fields both hold a value on some rows of
  the current result
- **THEN** the builder states how many rows collided for that column

### Requirement: A built report is saved, named and reusable

The screen SHALL let a process owner save the current configuration as a
named report, and SHALL let them reopen, re-run and further edit a report
they own or have edit access to from a list of their reports. Saving SHALL
require a non-empty name.

#### Scenario: A saved report reopens with its configuration intact

- **WHEN** a process owner saves a report and later reopens it from their
  list
- **THEN** the same process, filters and columns are shown, unchanged

### Requirement: A report is shared through viewer and editor lists

The screen SHALL let an owner or editor of a report add and remove actor
ids, roles or groups from its `viewers` and `editors` lists, and SHALL
prevent removing the report's own owner from `editors`. When a name added to
either list has no `read` permission on the report's target process, the
screen SHALL show a hint that the person will see an empty table rather than
blocking the save.

#### Scenario: Removing the owner from editors is prevented in the UI

- **WHEN** an editor attempts to remove the report's owner from the
  `editors` list
- **THEN** the screen prevents the removal

#### Scenario: Sharing to someone without process access shows a hint, not an error

- **WHEN** a name with no `read` permission on the target process is added to
  a report's `viewers` list
- **THEN** the screen shows a hint naming the limitation and still allows the
  save

### Requirement: The table renders the three empty-cell states and merge collisions distinctly

The rendered table SHALL show a value cell, a no-value cell, a
field-not-in-this-version cell, and a redacted cell as three visibly
different states, never collapsed into one blank appearance. A merge
column's collision rows SHALL be visibly marked in the rendered table, not
only in the collision count.

#### Scenario: The three empty states render differently

- **WHEN** a report's result contains a no-value cell, a
  field-not-in-this-version cell and a redacted cell in the same column
- **THEN** the three render as visibly distinct states

#### Scenario: A truncated result is stated in words

- **WHEN** a report's execution result is marked truncated
- **THEN** the screen states that the table is incomplete rather than
  presenting it as the full result

### Requirement: The reporting area renders the report builder's wording from its catalog

Every string the report builder shows SHALL come from the reporting area's
own catalog through `t(locale, key)`, following the same English/German
key-parity and locale-reactivity rules the area's existing views already
follow.

#### Scenario: A locale change re-renders the report builder

- **WHEN** a process owner switches the account menu's language while the
  report builder is open
- **THEN** the screen re-renders its wording in the newly chosen locale
