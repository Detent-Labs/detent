## REMOVED Requirements

### Requirement: The steps rail numbers every step in reachability order

**Reason**: Its summary line leaves the rail row, and both its scenarios test
that line.

**Migration**: The requirement added below keeps the rail's order and
numbering.

## ADDED Requirements

### Requirement: The steps rail lists each step by number and label

The rail SHALL list every step of the draft, in reachability order. Non-end
steps the initial step reaches over paths SHALL come first, nearest first. The
other non-end steps SHALL follow, in the draft's own order. Every end step
SHALL come last, in the draft's own order.

Each row SHALL carry a number and the step's label. A row SHALL have no summary
line under the label. That holds for every step kind: a task step, a call to
another process, and an end step. The step page names who works a step, the
fields its form carries, the process it calls and its outcome.

#### Scenario: The rail numbers steps in reachability order

- **WHEN** a draft's initial step reaches a call step, which reaches an end
  step
- **THEN** the rail numbers the initial step one, the call two and the end
  three

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
