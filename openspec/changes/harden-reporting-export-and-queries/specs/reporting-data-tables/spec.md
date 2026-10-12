# Spec Delta

## MODIFIED Requirements

### Requirement: A saved report's table downloads as CSV under the same rules as its JSON execution

The engine SHALL expose a CSV export of a saved report's table. The export
SHALL use the same two gates `executeReport` already applies to the JSON
execution. The first gate is report membership: owner, editor or viewer.
The second is the target process's own `read` permission.

The engine SHALL refuse a caller failing the membership gate. It refuses
that caller the same way the JSON route does. A caller who passes membership
but fails `read` SHALL get an empty CSV. That CSV holds a header row and no
data rows, never a refusal. This matches the JSON route's "sharing narrows
access, never widens it" rule.

The CSV SHALL contain the identical row and column set. The JSON execution
route returns that same set for the same report at the same moment. A cell's
text may differ from the JSON value by the neutralizing prefix only.

One column header SHALL name
a field column's own field id. A merge column's header SHALL name its joined
source field ids. A plain-text header has no locale-dependent label. The
table's own header has one.

#### Scenario: A member with read access downloads the full table

- **WHEN** an owner, editor or viewer of a report, holding `read` on the
  report's target process, requests the report's CSV export
- **THEN** the response is a CSV file
- **AND** its rows match the report's JSON execution result, apart from a
  neutralizing prefix

#### Scenario: The engine refuses a non-member

- **WHEN** an actor who is neither owner, editor nor viewer of a report
  requests its CSV export
- **THEN** the engine refuses the request, the same way it refuses the
  JSON execution route

<!-- antislop: allow trailing-negation -->
<!-- The scenario name is the base spec's; MODIFIED cannot reword it. -->
#### Scenario: A member without read access gets an empty CSV, not a refusal

- **WHEN** an editor or viewer of a report lacks `read` on the report's
  target process and requests its CSV export
- **THEN** the response is a CSV file containing only the header row

## ADDED Requirements

### Requirement: The CSV export neutralizes a formula in a string cell

A spreadsheet reads a cell as a formula when its text starts with `=`, `+`,
`-`, `@`, a tab or a CR. The CSV export SHALL put one apostrophe before such
text in a string value cell. It SHALL NOT prefix a number, a boolean, the
header row or the three empty-cell markers. The JSON execution SHALL return
the value unchanged.

#### Scenario: A string cell that starts with an equals sign gets the prefix

- **WHEN** a report's result holds the string value `=1+1` in a cell
- **THEN** the exported CSV shows `'=1+1` for that cell

#### Scenario: A negative number keeps its sign

- **WHEN** a report's result holds the number value `-5` in a cell
- **THEN** the exported CSV shows `-5` for that cell

#### Scenario: The JSON execution keeps the raw value

- **WHEN** a report's result holds the string value `=1+1` in a cell
- **THEN** the JSON execution of the same report returns `=1+1` for that cell

### Requirement: The CSV export states a truncated result

When a report matches more instances than the report row limit, the CSV SHALL
end with one more line. Its first column reads `(truncated: first 1000 rows only)`, and its other
columns stay empty. A complete result SHALL have no such line.

#### Scenario: A truncated result ends with the marker line

- **WHEN** a report matches more instances than the report row limit
- **THEN** the CSV holds 1000 data rows
- **AND** the line after them reads `(truncated: first 1000 rows only)`

#### Scenario: A complete result has no marker line

- **WHEN** a report matches fewer instances than the report row limit
- **THEN** the CSV has no marker line
