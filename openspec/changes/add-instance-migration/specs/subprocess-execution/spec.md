## ADDED Requirements

### Requirement: A migrating parent repairs every child's parent link

When a migrating parent's step is remapped, the `parent.stepId` of its children
SHALL be updated through the same mapping, in the transaction that commits the
parent's migration.

The repair SHALL cover **every** child linked to that parent, not only the ones
still running. A child that has already reached its terminal step is exactly the one
whose return is still in flight, and the return resolves the parked parent through
that link; leaving a terminal child's link stale reproduces the failure the repair
exists to prevent — the return finds no parent parked at the named step, treats it
as "moved on", marks the row delivered, and the parent waits forever.

A child SHALL NOT otherwise be affected by its parent's migration. It keeps its own
`{processId, version, definitionHash}` and its own step, and is migrated only by an
invocation covering its own process and version.

#### Scenario: An active child's link is repaired

- **WHEN** a parent parked at a subprocess step migrates under a remapping `stepMap`
  while its child is still running
- **THEN** the child's `parent.stepId` names the mapped step, and its later return
  drives the parent off the wait-state

#### Scenario: A terminal child's link is repaired too

- **WHEN** a child reaches its terminal step, and its parent then migrates under a
  remapping `stepMap` before the return is delivered
- **THEN** the terminal child's `parent.stepId` is also updated, and the return finds
  the parent and drives it off the wait-state

#### Scenario: An identity migration leaves links untouched

- **WHEN** a parent migrates onto the same step id
- **THEN** no child's `parent.stepId` changes

#### Scenario: A child is not migrated by its parent

- **WHEN** a parent with a child migrates
- **THEN** the child keeps its own pin and its own step
