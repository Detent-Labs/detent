<!-- antislop: allow-file em-dash passive-voice run-ons sentence-length trailing-negation -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: An identity migration does not spawn a second child

A migration whose target step id equals the instance's current step id SHALL suppress
the subprocess spawn.

A parent parked at a subprocess step already has a live child. The spawn's
idempotency is keyed on the transition sequence. The child id derives from the
parent, that sequence, and the step id. A migration advancing the sequence
therefore derives a **different** child id. Unsuppressed, it would leave the step
visit that owns the live child. It would cancel that child and spawn a replacement.

Idempotency protects redelivery of one commit, not a second commit onto one step.

The suppressed migration SHALL also carry the parent's `awaitedChild` over
unchanged. The sequence advanced. The carried value is the only record that the
existing child is still awaited.

A migration that relocates the instance onto a subprocess step it was not on SHALL
spawn normally: that is a genuine entry.

#### Scenario: An identity migration of a parked parent spawns nothing

- **WHEN** a parent parked at a subprocess step migrates onto the same step id
- **THEN** no spawn is enqueued and the instance still has exactly one child

#### Scenario: An identity migration keeps the child's return deliverable

- **WHEN** a parent parked at a subprocess step migrates onto the same step id
- **AND** the child then reaches a terminal step
- **THEN** the migration leaves the parent's `awaitedChild` unchanged
- **AND** the child's return drives the parent off the step

#### Scenario: A relocation onto a subprocess step spawns a child

- **WHEN** an instance is relocated onto a subprocess step it was not previously on
- **THEN** the spawn is enqueued and a linked child is created

## ADDED Requirements

### Requirement: A relocation off a subprocess step whose spawn is still queued commits

A migration that relocates a parent off a subprocess step SHALL commit when the
step has no live child. A spawn row that is `pending`, or `claimed` with an expired
lease, does not block it. A live-claimed row still defers the migration as
`pending-actions`. The relocation is a commit that leaves the step. It clears the
parent's `awaitedChild` and enqueues the cancellation of that child. The queued
spawn then finds the parent no longer awaiting its child and creates nothing.

The live-child gate applies whenever the parent leaves a subprocess step. That
covers a changed step id and a kept id whose step is no longer a subprocess
step. A live child defers the migration with the `child-in-flight` reason, and a
migration SHALL NOT cancel a running child. The gate SHALL NOT widen to an
undelivered spawn row. A dead-lettered spawn would then block the migration of
the parent an operator wants to move.

#### Scenario: A queued spawn does not block the relocation

- **WHEN** a parent whose spawn row is still pending is relocated off its
  subprocess step by a migration
- **THEN** the instance migrates, and it is not recorded as skipped

#### Scenario: The late spawn creates no child

- **WHEN** the relocated parent's queued spawn is delivered afterwards
- **THEN** no child instance exists for that visit, and the delivery succeeds

#### Scenario: A running child still defers the relocation

- **WHEN** the spawn was delivered and its child is running, and the parent is
  relocated off the step
- **THEN** the instance is skipped with the `child-in-flight` reason, as before

#### Scenario: A kept step id with a new step type defers while the child runs

- **WHEN** the plan keeps the step id of a parked subprocess step but the target
  version declares it as another step type, and the child is running
- **THEN** the instance is skipped with the `child-in-flight` reason
- **AND** the migration cancels nothing
