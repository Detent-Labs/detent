## ADDED Requirements

### Requirement: The Contract tab stores an outcome trimmed

The Contract tab SHALL store a new outcome without leading or trailing white
space. It SHALL compare the trimmed text against the declared outcomes, so
`approved` and ` approved ` count as one outcome. An outcome that trims to
nothing SHALL add nothing.

A parent guard compares `child.outcome` to the stored string exactly. Storing
the text as typed would make the guard never match.

#### Scenario: Adding an outcome typed with spaces

- **WHEN** an author types ` approved ` and presses Add
- **THEN** `contract.outcomes` holds `approved`

#### Scenario: Adding an outcome that already exists

- **WHEN** `contract.outcomes` holds `approved` and the author adds ` approved `
- **THEN** `contract.outcomes` still holds one `approved`
