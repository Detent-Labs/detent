## REMOVED Requirements

### Requirement: The steps rail lists each step by number and label

**Reason**: Its order paragraph and one of its scenarios both state the walk
over the paths. The rail now follows the draft's own order.

**Migration**: The requirement added below keeps every other rule of it: the
number, the label, and the absent summary line.

## ADDED Requirements

### Requirement: The steps rail lists each step in the draft's own order

The rail SHALL list every step of the draft, in the order `workflow.steps`
holds them. No walk over the paths SHALL decide where a row stands.

A row's number SHALL name the step's place in that order. Moving a row earlier
or later SHALL move it in the rail and in the draft together.

Each row SHALL carry a number and the step's label. A row SHALL have no summary
line under the label. That holds for every step kind: a task step, a call to
another process, and an end step. The step page names who works a step, the
fields its form carries, the process it calls and its outcome.

#### Scenario: The rail numbers steps in the draft's own order

- **WHEN** a draft holds a call step, then an end step, then a task step
- **THEN** the rail numbers the call one, the end two and the task three

#### Scenario: A move control moves its own row

- **WHEN** an author presses Move earlier on the rail's third row
- **THEN** that row stands second
- **AND** the row that stood second stands third

#### Scenario: A task row names no assignment and no field count

- **WHEN** a task step names a group as its assignment and carries four view
  fields
- **THEN** its rail row carries the step's number and label
- **AND** the row names neither who works the step nor a field count

#### Scenario: A call row names no process

- **WHEN** a subprocess step calls the process labeled "Credit check"
- **THEN** its rail row has no line naming that process

#### Scenario: An end row names no outcome

- **WHEN** an end step declares the outcome `approved`
- **THEN** its rail row has no line naming that outcome
