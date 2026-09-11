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
