## ADDED Requirements

### Requirement: The scratchpad checks only against the current catalog choice

The Tools screen SHALL write a version list or a field catalog only for the
newest choice. A developer can choose one process
and then a second one. The answer for the first can arrive after that. Such
an answer SHALL then change nothing. That covers the version list, the
draft flag, the field catalog and the catalog error.

A new process choice SHALL also drop a catalog answer still in flight for
the earlier process.

#### Scenario: The screen drops a late version list for an earlier process

- **WHEN** a developer chooses process A, then process B, and A's version
  list arrives after B's
- **THEN** the catalog choice lists B's versions only

#### Scenario: The screen drops a late catalog for an earlier choice

- **WHEN** a developer chooses catalog version 1, then version 2, and version
  1's body arrives last
- **THEN** the scratchpad checks the expression against version 2's fields

#### Scenario: A process change drops a catalog in flight

- **WHEN** a developer chooses a catalog of process A, then chooses process B
  before that catalog arrives
- **THEN** the scratchpad reports no check result until the developer
  chooses a catalog of process B
