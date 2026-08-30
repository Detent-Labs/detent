## ADDED Requirements

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
and a redacted cell. Each of the three SHALL
carry its own distinct, non-empty marker text. A spreadsheet reader must
never mistake one state for another. This mirrors the table's own rule:
the three states never collapse into one blank appearance.

#### Scenario: The three empty states export as three different markers

- **WHEN** a report's result contains a no-value cell, a
  field-not-in-this-version cell and a redacted cell in the same column
- **THEN** the exported CSV shows three different, non-empty marker
  strings for the three cells
