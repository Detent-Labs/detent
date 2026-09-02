<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the rest of this repo's specs use; that grammar is structurally passive. -->

## ADDED Requirements

### Requirement: The report reads by the same rule, the aggregates never do

The engine SHALL narrow a report's rows by the rule the visible scope lists
by. A row a viewer may not see SHALL be absent from the table. No error, no
marker, no count.

The rule is the one the list and the direct read carry. A live assignment on
the current step admits, and consults no revocation. Participation admits
too, unless a revocation names the actor. Taking part means the starter, or a
match between the actor's principals and the instance's principal set.

The engine SHALL narrow the report through the same row set the visible list
uses. It SHALL NOT carry a second predicate for one rule. The list, the direct
read and the report SHALL agree on which instances an actor may see.

An `ADMIN_ROLE` caller SHALL read unnarrowed, as they do on the list and the
direct read.

The three aggregate views SHALL stay unfiltered permanently. Those are cycle
time, bottleneck and SLA. They return distributions over steps. They return no
instance id and no field value. A narrowed population would hand two readers
two different cycle times, and no screen would explain the difference.

`reporting-analytics-api` owns those three views and keeps its own gate. This
requirement binds them from outside and asks nothing of them.

#### Scenario: A report withholds a row the list withholds

- **WHEN** an instance matches a report's query
- **AND** the visible list does not return that instance to the viewer
- **THEN** the report's table holds no row for it

#### Scenario: A report returns a row the list returns

- **WHEN** an instance matches a report's query
- **AND** the visible list returns that instance to the viewer
- **THEN** the report's table holds its row

#### Scenario: A live assignment admits a revoked viewer's row

- **WHEN** a revoked viewer holds the current step's claim on a matching
  instance
- **THEN** that instance's row is present

#### Scenario: An operator reads the whole table

- **WHEN** an actor holding `ADMIN_ROLE` executes a report
- **THEN** no row is withheld

#### Scenario: The aggregates answer the same numbers to every reader

- **WHEN** two actors with different visible sets read the cycle-time view
  for one process
- **THEN** both receive the same distribution
