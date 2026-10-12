# Spec Delta

## MODIFIED Requirements

### Requirement: Report execution reuses the instance-query filter axes and its bounding

A report's query configuration SHALL accept exactly the filter axes the
`instance-data-query` capability's read accepts. Those axes are target
process, instance status, a date range, and field comparisons. Executing a
report SHALL bound its result by the report row limit: 1000 rows, newest
first. More matching instances may exist than the execution can return. The
result SHALL then say so explicitly. The result SHALL NOT silently return a
partial table that looks complete.

#### Scenario: The engine marks an oversized result truncated

- **WHEN** a report's query matches more instances than the execution's
  bound
- **THEN** the engine marks the returned table truncated, and the table
  does not silently appear complete

#### Scenario: The engine does not mark a within-bound result truncated

- **WHEN** a report's query matches fewer instances than the execution's
  bound
- **THEN** the engine does not mark the returned table truncated

#### Scenario: A report returns up to the report row limit

- **WHEN** a report's query matches 1200 instances
- **THEN** the execution returns 1000 rows and marks the table truncated

## ADDED Requirements

### Requirement: An update cannot displace the current owner

An update to a report's `owner` SHALL name an actor already in the report's
current `editors`. An update from any actor but the current owner SHALL keep
the current owner in `editors`. The engine SHALL reject an update that breaks
either rule. The stored `owner` and `editors` then stay unchanged.

#### Scenario: An editor cannot remove the owner's access

- **WHEN** an editor who is not the owner sends an update
- **AND** it sets `owner` to themself and `editors` to a list without the
  current owner
- **THEN** the engine rejects the update, and the stored `owner` and `editors`
  stay unchanged

#### Scenario: An owner can transfer ownership

- **WHEN** the current owner sends an update that sets `owner` to an editor and
  `editors` to a list without the former owner
- **THEN** the engine accepts the update

#### Scenario: A new owner must already be an editor

- **WHEN** an update sets `owner` to an actor outside the current `editors`
- **AND** the same update adds that actor to the new `editors` list
- **THEN** the engine rejects the update, and the stored `owner` and `editors`
  stay unchanged
