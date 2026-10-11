<!-- antislop: allow-file passive-voice -->
<!-- Passive WHEN/THEN scenario phrasing matches the convention of every
     existing spec.md in openspec/specs/. -->
# Spec Delta

## ADDED Requirements

### Requirement: Leaving a subprocess step cancels the awaited child

A commit that moves a parent off a subprocess step SHALL cancel the child the
parent awaited. The child's own return is the one exception. Three routes
trigger the rule: a timer exit, a migration relocation, and a re-entry of the
same step. The cancellation SHALL run the
child's `onCancel` actions. It SHALL cascade to the child's own running
children, as any other cancellation does.

The leaving commit SHALL enqueue the cancellation as an engine-internal outbox
row, in the same transaction. The row is durable and at-least-once. A crash
between the commit and the delivery SHALL NOT leave the child running.

The cancellation SHALL do nothing in three cases. The child does not exist, the
child is not running, or the child names another instance as its parent. A
conflict with the child's own concurrent commit SHALL retry through the outbox.

A cancel commit of the parent itself SHALL NOT enqueue this row. The existing
sweep of running children covers it.

A child that this cancellation stops reaches the cancel sink. That enqueues a
return with the reserved `cancelled` outcome. The parent no longer awaits that
child, so the return SHALL be a no-op.

#### Scenario: A timer exit cancels the running child

- **WHEN** a transition timer forces a parent off its subprocess step while the
  child waits on a manual task
- **THEN** the child is cancelled and its `onCancel` actions run
- **AND** the child's own running children are cancelled

#### Scenario: A re-entry cancels the first visit's child

- **WHEN** a timer moves a parent off a subprocess step and a path leads back
  to the same step
- **THEN** the first visit's child is cancelled
- **AND** the second visit has its own child

#### Scenario: The cancelled child's return does not reach the parent

- **WHEN** the cancelled child's `cancelled` return arrives after the parent
  left the step
- **THEN** no writeback is applied and the parent does not move

#### Scenario: A queued spawn and a cancel meet

- **WHEN** a timer moves the parent off the step before the spawn is delivered,
  and the cancellation arrives first
- **THEN** the cancellation does nothing, and the spawn then creates no child

#### Scenario: A child that finished before the cancel is left alone

- **WHEN** the awaited child is already terminal when the cancellation arrives
- **THEN** the cancellation does nothing

#### Scenario: A parent cancel enqueues no leaving row

- **WHEN** a parked parent is cancelled
- **THEN** the cancel commit enqueues no cancellation row
- **AND** the sweep cancels the running child

#### Scenario: A foreign child is not cancelled

- **WHEN** the cancellation row names an instance whose parent link points at
  another instance
- **THEN** that instance keeps running
