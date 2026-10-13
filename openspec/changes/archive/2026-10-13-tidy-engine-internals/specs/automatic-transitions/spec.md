# Spec Delta

<!-- Why: each directive below covers text copied from the base requirement; its wording stays unchanged so the archive diff shows only the real edits. -->

## ADDED Requirements

### Requirement: An instance that leaves running clears its own re-resolution mark

A commit that leaves an instance not `running` SHALL clear its
re-resolution mark. The clear happens in the same statement as the commit.
This covers a terminal step, a `cancelled` override and the flip to `faulted`.
`initSchema` SHALL run no cleanup of marks. The re-resolution claim then reads
only instances that still move, because each instance clears its own mark.

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

#### Scenario: Initialisation leaves every mark as it is

- **WHEN** `initSchema` runs on a database where a `completed` instance and a
  `running` instance both carry a re-resolution mark
- **THEN** both instances keep their mark

## REMOVED Requirements

### Requirement: A finished instance has no re-resolution mark

**Reason**: The base text says `initSchema` clears the mark of every instance that is not `running`. `initSchema` no longer runs that cleanup. The renamed requirement "An instance that leaves running clears its own re-resolution mark" holds the commit rule.

**Migration**: None for a running engine. Drop a local database that holds a stale mark on a finished instance, and seed it again.
