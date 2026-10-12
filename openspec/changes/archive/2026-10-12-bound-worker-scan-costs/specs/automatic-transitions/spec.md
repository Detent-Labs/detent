# Spec Delta

## ADDED Requirements

### Requirement: A finished instance has no re-resolution mark

A commit that leaves an instance not `running` SHALL clear its
re-resolution mark. The clear happens in the same statement as the commit.
This covers a terminal step, a `cancelled` override and the flip to `faulted`.
`initSchema` SHALL clear the mark of every instance that is not `running`.
The re-resolution claim then reads only instances that still move.

#### Scenario: A child that completes in its creation cascade has no mark

- **WHEN** the engine creates a subprocess child and its automatic cascade
  reaches a terminal step
- **THEN** the child reads `completed` and has no re-resolution mark

#### Scenario: A worker pass that ends on a terminal step leaves no mark

- **WHEN** the resolution worker claims a marked instance and its cascade
  commits a last hop onto a terminal step
- **THEN** the instance reads `completed` and has no re-resolution mark

#### Scenario: A cancelled instance has no mark

- **WHEN** an operator cancels a running instance that carries a
  re-resolution mark
- **THEN** the instance reads `cancelled` and has no re-resolution mark

#### Scenario: A faulted instance has no mark

- **WHEN** an automatic cascade loops and the engine flips the instance to
  `faulted`
- **THEN** the instance has no re-resolution mark

#### Scenario: Initialisation clears a stale mark

- **WHEN** `initSchema` runs on a database where a `completed` instance and a
  `running` instance both carry a re-resolution mark
- **THEN** the `completed` instance has no mark
- **AND** the `running` instance keeps its mark
