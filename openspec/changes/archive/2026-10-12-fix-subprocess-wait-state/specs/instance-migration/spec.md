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
unchanged while the target step is still a subprocess step. The sequence advanced.
The carried value is the only record that the existing child is still awaited. A
kept step id whose target is another step type leaves the subprocess step. That
migration clears the field. It enqueues the cancellation when the field still names
a child (see "A relocation off a subprocess step whose spawn is still queued commits").

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

### Requirement: A relocation off a subprocess step with a live child is deferred

A migration that vacates a **subprocess-typed** source step SHALL check whether
that step has a live linked child, and SHALL skip the instance when one exists rather than commit the
relocation. A migration vacates the step when the step id changes, and when a kept id's target
is another step type. A child is **live** when its `status` is `running`, OR when it holds any undelivered outbox
row — a terminal child whose `core.returnSubprocess` return has not yet delivered. The skip is
transient: the instance keeps its pin and step, is recorded as a `migration.skipped` event with the
`child-in-flight` reason, and is migrated by a later invocation once the child settles.

The engine SHALL NOT repoint a child's `parent.stepId` under migration. Repointing a live child
misdirects its pending return: relocating onto another subprocess step lets the old child's return
drive the parent off the new step under that step's `outputMapping` — orphaning the genuinely-spawned
new child — while relocating onto a non-subprocess step makes the return dead-letter (`return: not a
subprocess step`), orphaning the child forever. Declining is chosen over reconciling, consistent with
the in-flight-actions gate: a pending return is keyed to the enqueuing version's step and contract, so
re-pointing it is a snapshot-versus-live race preserving a result a later invocation delivers anyway.

A settled child — terminal with every outbox row delivered, including the parked-forever
`outcome-unmatched` case — SHALL NOT block the migration and SHALL NOT have its link repointed. A
settled child's `parent.stepId` is inert: `core.returnSubprocess` no longer fires for it, and the only
other reader, `cancelInstance`'s cascade sweep, keys on `parent.instanceId` and `status = 'running'`,
never on `parent.stepId`.

#### Scenario: A running child blocks the parent's relocation

- **WHEN** a parent parked at a subprocess step with a running child is relocated to a different step
- **THEN** the instance is not migrated, keeps its pin and step, and is recorded as skipped with the
  `child-in-flight` reason

#### Scenario: A kept step id with a new step type defers while the child runs

- **WHEN** the plan keeps the step id of a parked subprocess step but the target
  version declares it as another step type, and the child is running
- **THEN** the instance is skipped with the `child-in-flight` reason
- **AND** the migration cancels nothing

#### Scenario: A terminal child with an undelivered return blocks the relocation

- **WHEN** the child has reached a terminal step but its `core.returnSubprocess` row is not yet
  delivered, and the parent is relocated to a different step
- **THEN** the instance is skipped with the `child-in-flight` reason, and the child's link is unchanged

#### Scenario: A settled child does not block the relocation and is not repointed

- **WHEN** the parent is relocated off a subprocess step whose child is terminal with all outbox rows
  delivered
- **THEN** the instance migrates normally and the child's `parent.stepId` is left unchanged

#### Scenario: A later invocation migrates the parent once the child settles

- **WHEN** the blocking child settles and the migration is invoked again
- **THEN** the parent migrates normally

#### Scenario: A relocation off a non-subprocess step is unaffected

- **WHEN** an instance not on a subprocess step is relocated
- **THEN** the live-child gate does not apply and the migration proceeds

## ADDED Requirements

### Requirement: A relocation off a subprocess step whose spawn is still queued commits

A migration that relocates a parent off a subprocess step SHALL commit when the
step has no live child. A spawn row that is `pending`, or `claimed` with an expired
lease, does not block it. A live-claimed row still defers the migration as
`pending-actions`. The relocation is a commit that leaves the step. It clears the
parent's `awaitedChild` and enqueues the cancellation of that child. The queued
spawn then finds the parent no longer awaiting its child and creates nothing.

The live-child gate (see "A relocation off a subprocess step with a live child is
deferred") still defers the migration while a child is live, and a migration SHALL
NOT cancel a running child. The gate SHALL NOT widen to an undelivered spawn row.
A dead-lettered spawn would then block the migration of the parent an operator
wants to move.

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

#### Scenario: A type flip with a settled child clears the awaited child

- **WHEN** the plan keeps the step id of a parked subprocess step but the target
  version declares it as another step type, and the child is settled
- **THEN** the instance migrates and its `awaitedChild` is cleared
