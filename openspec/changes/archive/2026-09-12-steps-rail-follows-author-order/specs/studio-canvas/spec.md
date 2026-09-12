## REMOVED Requirements

### Requirement: The steps register lists every step in reachability order

**Reason**: Its header, its body and one of its scenarios all name the walk
over the paths. The steps rail now follows the draft's own order.

**Migration**: The requirement added below keeps every rule of it. No register
stands, the rail and its rows belong to `studio-step-page`, and the process
links stay retired.

## ADDED Requirements

### Requirement: The Canvas tab stands without a steps register

The steps register SHALL NOT stand. The Canvas tab carries the canvas alone,
and no register of rows beside it.

The steps rail carries every step of the draft, in the draft's own order. That
rail and its rows belong to `studio-step-page`.

The process links SHALL NOT stand either. Those were Fields, Data sources,
Contract, Field matrix, Changes and Paths. The tab row carries each one now,
per `studio-process-tabs`.

#### Scenario: Every step takes a row

- **WHEN** a draft holds seven steps and an author opens the Canvas tab
- **THEN** the canvas draws seven nodes
- **AND** no register of rows stands beside them

#### Scenario: Rows follow the draft's own order

- **WHEN** an author reads the draft's steps in the order `workflow.steps`
  holds them
- **THEN** the steps rail carries that order, per `studio-step-page`
- **AND** the Canvas tab has no such list

#### Scenario: An issue count prints on its row

- **WHEN** one step carries two open issues and another carries none
- **THEN** the first step's rail row carries a count of two
- **AND** the Canvas tab has no row and no row count

#### Scenario: A row is a real control

- **WHEN** a keyboard author tabs through the Canvas tab
- **THEN** no register row takes focus, because no register stands
- **AND** the canvas keeps the one tab stop its keyboard requirement states

## MODIFIED Requirements

### Requirement: The canvas bar reports one selected step's reachability

The canvas bar SHALL report the reachability of a single selected step. A step
the draft's initial step reaches through paths reads as nothing. A step no
chain of paths reaches reads as unconnected.

A step counts as reached when the draft's initial step reaches it over paths.
That rule stands on its own. The steps rail's order no longer applies it. A
draft naming no initial step leaves every step unconnected. The rule reaches a
terminal step the same way it reaches any other.

The report SHALL stand only for a selection of exactly one step. A selection
of none has no report. A selection of several carries the count instead.

#### Scenario: An unreached step reads as unconnected

- **WHEN** an author selects a step no path reaches
- **THEN** the bar reads as unconnected

#### Scenario: A reached step has no report

- **WHEN** an author selects the draft's initial step
- **THEN** the bar has no reachability report

#### Scenario: Several selected steps carry the count instead

- **WHEN** an author selects two steps, one of them unreached
- **THEN** the bar reports a count of two and no reachability
