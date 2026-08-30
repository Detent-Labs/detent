# reporting-data-tables Specification

## Purpose

The report builder is the process-owner-facing screen for building, saving,
sharing and viewing a report table over instance field values. It is a
separate, save/share-capable screen inside the reporting area. It is
distinct from the area's three existing read-only
cycle-time/bottleneck/SLA views.

## Requirements

### Requirement: The report builder lives in the reporting area under its existing access rules

The report builder screen SHALL live at `packages/web/src/areas/reporting`
and reach the engine only over the HTTP wrapper. It SHALL need the same
sign-in-plus-reports-role gate the area's other three views already need.
It SHALL follow the same unauthenticated and missing-role handling as the
existing views. An unauthenticated visitor sees the login screen. A
signed-in actor lacking the reports role sees an explicit refusal naming
the missing role.

#### Scenario: An unauthenticated visitor sees the login screen

- **WHEN** a visitor with no stored session opens the report builder
- **THEN** the report builder shows the login screen and sends no report
  request

#### Scenario: The screen tells an actor without the role which role is missing

- **WHEN** an actor without the reports role opens the report builder
- **THEN** the screen states that it needs the reports role, and shows no
  report data

### Requirement: A process owner builds a report from a process, filters and an ordered column list

The screen SHALL let a process owner pick one target process. It SHALL let
the owner pick the same status and date-range filters the other views
already expose controls for. It SHALL let the owner pick the same field
comparisons those views already expose controls for. It SHALL let the
owner pick an ordered list of columns.

The columns SHALL come from the union of field catalogs the
`instance-data-tables` capability returns for that process and range.
Adding a column SHALL show which of the target process's versions in
range declare the chosen field. It SHALL do this only for a field not
common to all of them.

#### Scenario: A column choice shows its version coverage

- **WHEN** a process owner adds a column for a field that only one of
  several in-range versions declares
- **THEN** the builder shows that the field is absent from at least one
  in-range version

### Requirement: The merge-column editor shows its collision count

Configuring a merge column SHALL let a process owner pick an ordered list
of source fields. Once a preview or a save has run, the editor SHALL show
a collision count. The count states how many rows the merge marked as a
collision for that column. The editor SHALL NOT hide a collision by
silently picking one source value.

#### Scenario: The builder shows a collision count for a merge column

- **WHEN** a merge column's source fields both hold a value on some rows of
  the current result
- **THEN** the builder states how many rows collided for that column

### Requirement: A process owner saves a built report under a name and reuses it

The screen SHALL let a process owner save the current configuration as a
named report. It SHALL let them reopen, re-run and further edit a report
they own or have edit access to. They SHALL do this from a list of their
reports. Saving SHALL need a non-empty name.

#### Scenario: A saved report reopens with its configuration intact

- **WHEN** a process owner saves a report and later reopens it from their
  list
- **THEN** the builder shows the same process, filters and columns,
  unchanged

### Requirement: An owner or editor shares a report through viewer and editor lists

The screen SHALL let an owner or editor manage a report's `viewers` and
`editors` lists. They SHALL be able to add an actor id, a role or a group
to either list. They SHALL also be able to remove one. The screen SHALL
prevent removing the report's own owner from `editors`.

Someone might add a name with no `read` permission on the report's target
process to either list. When that happens, the screen SHALL show a hint.
The hint SHALL state that the person will see an empty table. The screen
SHALL still allow the save.

#### Scenario: The screen prevents removing the owner from editors

- **WHEN** an editor attempts to remove the report's owner from the
  `editors` list
- **THEN** the screen prevents the removal

#### Scenario: Sharing to someone without process access shows a hint, not an error

- **WHEN** someone adds a name with no `read` permission on the target
  process to a report's `viewers` list
- **THEN** the screen shows a hint naming the limitation and still allows
  the save

### Requirement: The table shows the three empty-cell states and merge collisions distinctly

The table SHALL show a value cell and three states: a no-value, a
field-not-in-this-version and a redacted cell. None of the three collapses
into one blank appearance. The table SHALL visibly mark a merge column's
collision rows, not only the collision count.

#### Scenario: The three empty states show differently

- **WHEN** a report's result contains a no-value cell, a
  field-not-in-this-version cell and a redacted cell in the same column
- **THEN** the three show as visibly distinct states

#### Scenario: The screen states a truncated result in words

- **WHEN** a report's execution marks its result truncated
- **THEN** the screen states that the table is incomplete rather than
  showing it as the full result

### Requirement: A saved report's table downloads as CSV under the same rules as its JSON execution

The engine SHALL expose a CSV export of a saved report's table. The export
SHALL use the same two gates `executeReport` already applies to the JSON
execution. The first gate is report membership: owner, editor or viewer.
The second is the target process's own `read` permission.

The engine SHALL refuse a caller failing the membership gate. It refuses
that caller the same way the JSON route does. The engine SHALL answer a
caller who passes membership but fails `read` with an empty CSV. That CSV
holds a header row and no data rows, never a refusal. This matches the
JSON route's "sharing narrows access, never widens it" rule.

The CSV SHALL contain the identical row and column set. The JSON
execution route returns that same set for the same report at the same
moment. One column header SHALL name a field column's own field id. A
merge column's header SHALL name its joined source field ids. A
plain-text header carries no locale-dependent label, unlike the table's
own header.

#### Scenario: A member with read access downloads the full table

- **WHEN** an owner, editor or viewer of a report, holding `read` on the
  report's target process, requests the report's CSV export
- **THEN** the response is a CSV file whose rows match the report's JSON
  execution result exactly

#### Scenario: The engine refuses a non-member

- **WHEN** an actor who is neither owner, editor nor viewer of a report
  requests its CSV export
- **THEN** the engine refuses the request, the same way it refuses the
  JSON execution route

#### Scenario: A member without read access gets an empty CSV, not a refusal

- **WHEN** an editor or viewer of a report lacks `read` on the report's
  target process and requests its CSV export
- **THEN** the response is a CSV file containing only the header row

### Requirement: The CSV export marks the three empty-cell states distinctly

The CSV export SHALL NOT collapse three cell states into the same blank
text. Those states are a no-value cell, a field-not-in-this-version cell
and a redacted cell. Each of the three SHALL carry its own distinct,
non-empty marker text. A spreadsheet reader must never mistake one state
for another. This mirrors the table's own rule: the three states never
collapse into one blank appearance.

#### Scenario: The three empty states export as three different markers

- **WHEN** a report's result contains a no-value cell, a
  field-not-in-this-version cell and a redacted cell in the same column
- **THEN** the exported CSV shows three different, non-empty marker
  strings for the three cells

### Requirement: The reporting area shows the report builder's wording from its catalog

Every string the report builder shows SHALL come from the reporting
area's own catalog through `t(locale, key)`. It SHALL follow the same
English/German key-parity and locale-reactivity rules the area's existing
views already follow.

#### Scenario: A locale switch shows the report builder's new wording

- **WHEN** a process owner switches the account menu's language while the
  report builder is open
- **THEN** the screen shows its wording in the newly chosen locale
