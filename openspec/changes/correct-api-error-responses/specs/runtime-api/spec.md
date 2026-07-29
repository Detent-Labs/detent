## ADDED Requirements

### Requirement: An operation targeting a non-running instance is rejected at the boundary

`submitAndTransition`, `claimStep` and `releaseClaim` SHALL throw
`InstanceNotRunningError`, carrying the instance id and the observed status,
when the target instance's status is not `running`. The check SHALL happen
after the instance is loaded under its row lock and before any work is
committed, so the rejection is exact rather than optimistic.

The engine-level no-op SHALL remain: `commitManualTransition` and
`updateAssignment` keep returning the instance unchanged for a non-running
instance, because internal idempotent re-entry (a timer firing against an
instance a cascade already completed) must not throw. What changes is only
that a *caller-initiated* operation is told.

Reporting success for an operation that did nothing is the defect this closes.
Today a submission against a `cancelled`, `completed` or `faulted` instance
row-locks it, hash-checks its body, enforces the claim, validates the data,
calls the engine, receives the untouched instance, commits zero writes, and is
returned as a normal `200` — the submitted data silently discarded. The
permanent case is a `faulted` instance, where every later submission answers
success forever.

The concurrent case is the same defect with a race in front of it: of two
submissions to the same instance, the loser's data is discarded once the
winner's transition leaves the step, and the loser is currently told it
succeeded. After this change the loser receives `InstanceNotRunningError` if
the instance is no longer running — or one of the ordinary errors that already
apply (a claim error, a validation error, a guard refusal) if it is. There is
no outcome in which the loser's data is kept: the step it belonged to has been
left.

#### Scenario: A submission to a cancelled instance is rejected

- **WHEN** `submitAndTransition` targets an instance whose status is
  `cancelled`
- **THEN** it throws `InstanceNotRunningError` naming that status, and no
  data is written

#### Scenario: A submission to a faulted instance is rejected every time

- **WHEN** an instance was parked `faulted` by the automatic cascade's loop
  guard and a submission is retried against it
- **THEN** each attempt throws `InstanceNotRunningError` rather than
  answering success

#### Scenario: Claim and release are rejected the same way

- **WHEN** `claimStep` or `releaseClaim` targets a non-running instance
- **THEN** it throws `InstanceNotRunningError`, rather than returning the
  instance unchanged

#### Scenario: The engine-level no-op is unchanged

- **WHEN** an internal caller re-enters `commitManualTransition` or
  `updateAssignment` for a non-running instance
- **THEN** it returns the instance unchanged, as today — the rejection lives
  at the runtime-API boundary, not in the engine

#### Scenario: Of two concurrent submissions, the loser learns it lost

- **WHEN** two `submitAndTransition` calls target the same instance
  concurrently and the winner's transition leaves the instance non-running
- **THEN** exactly one fulfils and the other rejects with
  `InstanceNotRunningError`, rather than both fulfilling
