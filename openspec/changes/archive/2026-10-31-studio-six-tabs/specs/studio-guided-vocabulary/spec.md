# Spec Delta

## MODIFIED Requirements

### Requirement: The vocabulary table words kinds, sources, outcomes and flags

The rows below complete the vocabulary. `.claude/rules/ui-glossary.md`
SHALL carry the same rows.

| Contract word | Author's word |
|---|---|
| terminal step | an end |
| subprocess step | a call to another process |
| data source | where values come from |
| outcome | how it ended |
| required / readonly / visible | Required / Read-only / Asked |
| contract | what this process takes in and gives back |

#### Scenario: The contract reads as what the process takes in and gives back

- **WHEN** an author reads the Settings tab's sub-row
- **THEN** the contract's view reads "What it takes in and gives back"
- **AND** the change list's contract group reads the same words

#### Scenario: The glossary carries the remaining rows

- **WHEN** a reader compares these rows with the glossary's table
- **THEN** every row stands in the glossary
