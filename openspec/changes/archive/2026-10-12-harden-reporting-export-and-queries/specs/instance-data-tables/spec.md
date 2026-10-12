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

### Requirement: Report sharing narrows access, never widens it

Executing a report SHALL additionally need `can(actor, "read", processId,
db)` to answer true on the report's target process. An actor may pass the
report's owner, editor or viewer check. That actor might still lack
`read` permission on the target process. Such an actor SHALL receive an
empty table rather than a refusal.

Passing both checks SHALL NOT return every instance of the process. A caller
without `ADMIN_ROLE` SHALL receive only the rows they may see, by the
`instance-visibility-set` capability's rule. A row outside that set SHALL be
absent. There SHALL be no error, no marker and no count of what was withheld.
That is the rule the empty table above already follows.

An `ADMIN_ROLE` caller SHALL receive every matching row. That role reads any
instance directly and lists every one under `scope=all`, so a report of theirs
narrows nothing.

The bound SHALL apply after that narrowing, and the truncation flag SHALL
report the narrowed set. A viewer SHALL NOT receive a short table reported as
complete.

The report itself does not name every field a source instance might expose.
An empty result reveals nothing about instances that exist. Sharing a
report with an actor SHALL therefore never grant that actor visibility into
data they could not otherwise read.

#### Scenario: A viewer without process read access gets an empty table

- **WHEN** an actor listed in a report's `viewers` list lacks `read`
  permission on the report's target process
- **THEN** executing the report returns an empty table, with neither a refusal
  nor an error

#### Scenario: A viewer with process read access gets the full table

- **WHEN** an actor listed in a report's `viewers` list also holds `read` on
  the report's target process
- **AND** that actor may see every matching instance
- **THEN** executing the report returns the matching rows

#### Scenario: A viewer sees only the rows they may see

- **WHEN** an actor passes both the membership check and the `read` check
- **AND** some matching instances lie outside that actor's visible set
- **THEN** the returned table holds the rows inside it and no others
- **AND** the response names no error and no withheld count

#### Scenario: A revoked viewer loses one row and keeps the rest

- **WHEN** an administrator has revoked a viewer from one matching instance
- **AND** that viewer has no claim and no candidacy on its current step
- **THEN** that instance's row is absent and every other row stands

#### Scenario: An operator's report stays unnarrowed

- **WHEN** an actor holding `ADMIN_ROLE` executes the report
- **THEN** the report returns every matching row

#### Scenario: Truncation reports the narrowed set

- **WHEN** 1010 instances match the query and the viewer may see 1001 of them
- **THEN** the table holds 1000 rows and reports truncation
- **AND** with 1000 visible among the same 1010 it holds 1000 rows and reports none

#### Scenario: The CSV export narrows the same way

- **WHEN** a viewer downloads the same report as CSV
- **THEN** the file holds exactly the rows the table holds

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
