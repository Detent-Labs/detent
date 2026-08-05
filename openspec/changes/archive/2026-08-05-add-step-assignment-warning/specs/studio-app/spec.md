## ADDED Requirements

### Requirement: A non-terminal step with no assignment draws a publish-time warning

For a non-terminal step whose `assignment` is absent, the studio SHALL draw
a warning next to the assignment editor. The warning SHALL NOT be an
`EditorIssue`, and SHALL NOT block or delay publishing. A self-service
step legitimately has no assignment, so this stays informational, matching
the rule the `"db.list"`-missing-key warning already follows.

A terminal step has no outgoing paths, so nothing is ever submitted on it.
The warning SHALL NOT draw on a terminal step, regardless of whether it
carries an `assignment`.

#### Scenario: A non-terminal step with no assignment draws a warning

- **WHEN** a draft's non-terminal step carries no `assignment`
- **THEN** the studio shows a warning next to that step's assignment editor

#### Scenario: A terminal step draws no warning

- **WHEN** a draft's step sets `terminal: true` and carries no `assignment`
- **THEN** the studio shows no warning for that step

#### Scenario: The warning does not block publishing

- **WHEN** an author publishes a draft carrying the no-assignment warning
- **THEN** the publish succeeds

## MODIFIED Requirements

### Requirement: The data sources panel picks a list key rather than accepting free text

For a data source of type `"db.list"`, `DataSourcesPanel` SHALL offer the
`listKey` values the server reports, rather than a free-text field. The
studio reads them through the data list read route, which its
`system:developer` role already grants.

A draft whose `"db.list"` data source names a `listKey` the server does not
report SHALL draw a warning, never a validation error. Publishing does not
read the tables, so a missing list cannot be an invariant here. The warning
matches the one for a step with no `assignment`.

#### Scenario: The panel offers the existing keys
- **WHEN** an author edits a `"db.list"` data source and the server reports
  two lists
- **THEN** the panel offers both keys as a choice

#### Scenario: A key the server does not report draws a warning
- **WHEN** a draft names a `listKey` the server does not report
- **THEN** the studio shows a warning for that data source

#### Scenario: The warning does not block publishing
- **WHEN** an author publishes a draft carrying that warning
- **THEN** the publish succeeds
