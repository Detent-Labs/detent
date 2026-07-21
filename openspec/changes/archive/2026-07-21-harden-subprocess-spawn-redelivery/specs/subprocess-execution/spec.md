## MODIFIED Requirements

### Requirement: Spawn is idempotent under at-least-once dispatch

Because spawn dispatch is at-least-once, re-dispatching the same spawn MUST NOT
create a second child. The child instance id MUST be a deterministic function of
the parent instance id, the parent's `transitionSeq` at entry, and the subprocess
step id (a UUIDv5), so a re-delivered spawn resolves to the same child and
skips only the creation of a new row.

A redelivered spawn MUST NOT also skip the work that follows creation: driving
the child to rest along any all-automatic paths from its current step, and the
cancel-orphan backstop that self-cancels a child left `running` under a parent
that is not. Both MUST be attempted on every delivery — the one that inserted
the child's row and every redelivery after it — using the child's state as read
at that delivery, not only on the delivery that happened to create the row.
Neither is a fresh mechanism: both are already safe to invoke more than once
(driving an already-rested or already-terminal child to rest is a no-op; the
backstop only acts when a fresh read shows the parent non-running and the child
still running), so redelivery reaching them is sufficient — no new
idempotency bookkeeping is introduced by this requirement.

#### Scenario: Re-dispatched spawn does not create a second child
- **WHEN** the same subprocess spawn is dispatched more than once (retry or crash recovery)
- **THEN** exactly one child instance exists, identified by the deterministic child id, and the redelivery is a no-op with respect to creation

#### Scenario: Redelivery completes a drive-to-rest a crash interrupted
- **WHEN** a first delivery creates the child but crashes before driving it to rest, and the spawn is redelivered
- **THEN** the redelivery drives the existing child along its all-automatic paths, and a child that reaches a terminal step on this pass has its return enqueued exactly as it would have on an uninterrupted first delivery

#### Scenario: Redelivery completes an interrupted cancel-orphan backstop
- **WHEN** a first delivery creates the child, the parent is cancelled before the backstop check runs, and the spawn is redelivered before the backstop has self-cancelled the child
- **THEN** the redelivery finds the parent non-running and the child still running, and self-cancels the child

#### Scenario: Redelivery after both repairs already completed is a no-op
- **WHEN** a spawn is redelivered after an earlier delivery already drove the child to rest and, if applicable, ran the cancel-orphan backstop
- **THEN** the redelivery re-attempts both, finds nothing left to do, and leaves the child's state unchanged
