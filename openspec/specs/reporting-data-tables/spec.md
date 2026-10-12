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

### Requirement: A comparison value takes the type of the compared field

The report builder SHALL write a comparison value of the compared field's declared type. A number field takes a number. A boolean field takes a Yes/No choice and writes `true` or `false`. A string field, a field whose column choice has no `type`, and every other field take text. Changing the compared field keeps the value when the new field has the same value type. Otherwise the builder clears the value.

#### Scenario: A number comparison writes a number
- **WHEN** a process owner compares the number field `amount` with `eq` and types `500`
- **THEN** the query holds the number `500` for that comparison
- **AND** the query does not hold the string `"500"`

#### Scenario: A boolean comparison offers a Yes/No choice
- **WHEN** a process owner compares a boolean field
- **THEN** the value control offers an empty choice, Yes and No
- **AND** choosing Yes writes `true`

#### Scenario: A string comparison writes text
- **WHEN** a process owner compares a string field with `eq` and types `open`
- **THEN** the query holds the string `"open"`

#### Scenario: A new field type clears the value
- **WHEN** a process owner changes a comparison from a number field to a boolean field
- **THEN** the comparison has no value until the owner chooses Yes or No

### Requirement: A field that leaves the column choices keeps its last known type

A comparison can narrow the range until a response no longer names its own field. The report builder SHALL remember the type of every field a response named. It SHALL keep that type for the row. For a field it never saw named, the row follows the type of its current value, and otherwise takes text.

#### Scenario: An emptied range keeps the type
- **WHEN** a process owner types a number that matches no instance
- **AND** the next column response names no field
- **THEN** the row keeps its number input and its value

### Requirement: An in comparison takes a comma-separated list

For the operator `in`, the report builder SHALL show one text input. The owner types members separated by commas. The input keeps the typed text while the owner types. The builder trims each member and skips an empty one. It parses each member by the field's declared type and writes the list when every member parses.

#### Scenario: A comma keeps the typed text
- **WHEN** a process owner types `a,b` into an `in` comparison on a string field
- **THEN** the input shows `a,b`
- **AND** the query holds the list `["a", "b"]`

#### Scenario: Members of a number field parse as numbers
- **WHEN** a process owner types `1, 2` into an `in` comparison on a number field
- **THEN** the query holds the list `[1, 2]`

#### Scenario: A trailing comma does not add a member
- **WHEN** a process owner types `a,` into an `in` comparison on a string field
- **THEN** the query holds the list `["a"]`

### Requirement: An incomplete comparison stays out of the query

A comparison is incomplete when the builder has no value to write. That covers an empty input, an unchosen boolean, and a list with a member that does not parse. The builder SHALL mark an incomplete row. It SHALL state the reason in words when the input holds text that does not parse. It SHALL leave the row out of a preview, a save and a column request.

#### Scenario: A number field rejects text that is not a number
- **WHEN** a process owner types `abc` into a comparison on a number field
- **THEN** the row shows that the value is not a number
- **AND** the next preview request omits that comparison

#### Scenario: A new row filters nothing
- **WHEN** a process owner adds a comparison and has not yet typed a value
- **THEN** the row shows as incomplete without an error message
- **AND** the preview request omits it

#### Scenario: A save leaves the incomplete row out
- **WHEN** a process owner saves a report that holds one complete and one incomplete comparison
- **THEN** the saved report holds the complete comparison alone

### Requirement: Editing a filter requests column choices once per pause

The report builder SHALL wait 300 ms after the last change to a filter. Only then does it request column choices. A change inside that window restarts the wait. The first request after the owner picks a process does not wait.

#### Scenario: Picking a process requests column choices at once
- **WHEN** a process owner picks a process
- **THEN** the builder sends the first column request without a wait

#### Scenario: Typing a value sends one column request
- **WHEN** a process owner types the five characters `12345` into a comparison, each less than 300 ms after the last
- **THEN** the builder sends one column request after the last keystroke

### Requirement: A saved report's date bounds must parse

A report query's `createdAfter` and `createdBefore` SHALL each be an ISO-8601
instant. Create, save, draft preview and column choices SHALL answer `400`
with `error.type` equal to `"request-shape"` for a bound that is not one. A
stored query with such a bound SHALL answer `400` with the same type when the
report runs. The owner and every viewer with `read` on the report's process
get that answer. A member without `read` keeps the empty table.

#### Scenario: A caller creates a report with a bound that is no date

- **WHEN** `POST /reporting/reports` has `query.createdAfter` equal to
  `"letzte Woche"`
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`
- **AND** the server stores no report

#### Scenario: A stored invalid bound fails when the report runs

- **WHEN** a viewer with `read` on the report's process runs a saved report
- **AND** its stored `createdBefore` is not an ISO-8601 instant
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`
- **AND** the log has no `unhandled error` entry

#### Scenario: The CSV export answers the same

- **WHEN** that viewer downloads the same report as CSV
- **THEN** the response is the same JSON `400` envelope

#### Scenario: A valid bound still runs

- **WHEN** a report has `createdAfter` equal to `"2026-10-01T00:00:00Z"`
- **THEN** it runs as before
