## MODIFIED Requirements

### Requirement: Claim the current step of a running instance

`claimStep(instanceId, actor, db?)` SHALL row-lock the instance. When
`status === "running"`, it SHALL require that the current step has a declared
`instance.assignment`. It SHALL require that the actor is an eligible
candidate: `actor.id` or any of `actor.roles` appears in
`assignment.candidates`. It SHALL require that `claimedBy` is unset.

On success it SHALL set `claimedBy = actor.id` and `claimedAt` to the current
time. It SHALL append an `assignment.claimed` `InstanceEvent`. It SHALL return
the write result that "A write call answers a write result, never the
instance" states.

It SHALL throw `NotAssignedError` when the current step has no declared
`assignment`. It SHALL throw `NotACandidateError` when the actor is not
eligible. It SHALL throw `AlreadyClaimedError` when `claimedBy` is already set.

At the runtime boundary, a non-running instance throws
`InstanceNotRunningError`, as "An operation targeting a non-running instance is
rejected at the boundary" states. Only the engine function of the same name
returns the instance unchanged, a silent no-op (see
`assignment-claim-release-consolidation`).

The candidate requirement above widens on an instance whose `kind` is
`"test"`. There, `claimStep` SHALL also admit the instance's `startedBy` actor
and any `system:admin` holder. The `draft-test-instances` capability states
that rule. `NotACandidateError` there means the actor is neither an eligible
candidate nor one of those two.

#### Scenario: An eligible candidate claims successfully
- **WHEN** an eligible candidate calls `claimStep` on a running instance's
  unclaimed, assignment-bearing current step
- **THEN** it returns the write result with `assignment.claimedBy`
  set to the actor's id

#### Scenario: A non-running instance is a no-op
- **WHEN** the engine's `claimStep` targets an instance whose `status` is not
  `"running"`
- **THEN** it returns the instance unchanged, throws no error and appends no
  `assignment.claimed` event

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A step with no declared assignment cannot be claimed
- **WHEN** `claimStep` targets a running instance whose current step has no
  declared `assignment`
- **THEN** it throws `NotAssignedError`

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A non-candidate is rejected
- **WHEN** a non-candidate actor calls `claimStep` on a published instance
- **THEN** it throws `NotACandidateError` and leaves the instance as it was

#### Scenario: A test instance's starter claims without candidacy
- **WHEN** a test instance's starter, matching no candidate, calls
  `claimStep` on its unclaimed, assignment-bearing current step
- **THEN** it returns the write result with `assignment.claimedBy`
  set to that actor's id

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: An already-claimed step is rejected
- **WHEN** `claimStep` targets a step whose `assignment.claimedBy` is already
  set
- **THEN** it throws `AlreadyClaimedError` and leaves the existing claim as it
  was

### Requirement: Release a claim on the current step of a running instance

`releaseClaim(instanceId, actor, db?)` SHALL row-lock the instance. When
`status === "running"`, it SHALL require `assignment.claimedBy === actor.id`.
On success it SHALL clear `claimedBy` and `claimedAt`, append an
`assignment.released` `InstanceEvent`, and return the write result that "A write
call answers a write result, never the instance" states.

It SHALL throw `NotClaimantError` when the calling actor does not hold the
claim. At the runtime boundary, a non-running instance throws
`InstanceNotRunningError`, as "An operation targeting a non-running instance is
rejected at the boundary" states. Only the engine function of the same name
returns the instance unchanged, a silent no-op (see
`assignment-claim-release-consolidation`).

#### Scenario: The claimant releases successfully
- **WHEN** the actor holding the claim calls `releaseClaim`
- **THEN** it returns the write result with `assignment.claimedBy`
  and `assignment.claimedAt` cleared

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A non-claimant is rejected
- **WHEN** an actor who does not hold the current claim calls `releaseClaim`
- **THEN** it throws `NotClaimantError` and leaves the existing claim as it was

### Requirement: Delegate the claim on the current step of a running instance

`delegateClaim(instanceId, actor, toActorId, db?)` SHALL row-lock the instance
and check that `assignment.claimedBy === actor.id`. On success it SHALL set
`claimedBy = toActorId` and refresh `claimedAt`. It SHALL append an
`assignment.delegated` `InstanceEvent` and return the write result that "A
write call answers a write result, never the instance" states.

It SHALL throw `NotClaimantError` when the calling actor does not hold the
claim, the same error `releaseClaim` throws for the same reason. No check
validates `toActorId` against `assignment.candidates`.

`delegateClaim` SHALL check `toActorId` against the local account directory,
but only when the calling actor's own id resolves there. A target the directory
does not hold SHALL raise `UnknownDelegateError`, naming the target. The claim
SHALL stay where it is. A deployment on an external identity provider has no
directory entry for its own actors. The check finds no delegator there and runs
no target check. That condition keeps this rule from rejecting every delegation
in such a deployment.

The target check SHALL run under the same row lock as the claimant check, and
only after it. A caller who does not hold the claim SHALL therefore meet
`NotClaimantError`, whatever target it names. The other order would make this
route answer whether an arbitrary `user_id` exists. Any actor holding a claim
on any instance could ask, one try at a time.

#### Scenario: The claimant delegates successfully

- **WHEN** the actor holding the current claim calls `delegateClaim` and names
  a target actor id
- **THEN** it returns the write result with `assignment.claimedBy`
  set to the target actor's id and `assignment.claimedAt` refreshed

#### Scenario: A non-claimant cannot delegate

- **WHEN** an actor who does not hold the current claim calls `delegateClaim`
- **THEN** it throws `NotClaimantError` and leaves the existing claim as it was

#### Scenario: A delegate target need not be an eligible candidate

- **WHEN** `delegateClaim` names a target actor id absent from
  `assignment.candidates`
- **THEN** the call still succeeds, and that actor becomes the claimant

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A target outside the directory is rejected

- **WHEN** the calling actor's id resolves in the local account directory,
  and `delegateClaim` names a target id that does not
- **THEN** it throws `UnknownDelegateError`, the claim stays with the calling
  actor, and the engine appends no `assignment.delegated` event

#### Scenario: A non-claimant learns nothing about the target

- **WHEN** an actor who does not hold the current claim calls
  `delegateClaim` with a target id absent from the directory
- **THEN** it throws `NotClaimantError`, the same error it throws for a
  target the directory does hold

#### Scenario: A deployment with no local accounts delegates as before

- **WHEN** the calling actor's id does not resolve in the local account
  directory, and `delegateClaim` names any target id
- **THEN** the call succeeds, exactly as it does today

### Requirement: Save an instance form draft through the runtime API

`saveInstanceDraft(instanceId, data, actor, db?)` SHALL persist the
participant's unfinished form input for a running instance. The input goes into
the per-instance draft of the `instance-form-drafts` capability. It SHALL
authorize the actor by the same relationship rule `submitAndTransition`
enforces. On a step with an assignment, the current claimant alone may save. On
a step without one, the instance starter or an `ADMIN_ROLE` holder may save.

It SHALL reject a non-running instance with `InstanceNotRunningError`, but only
for a caller who may read the instance. Any other caller gets
`AuthorizationError`, as "A write call reveals a finished instance only to a
reader" states. It SHALL store the data leniently, with no field validation,
and record the instance's current step as the draft's step.

#### Scenario: The claimant saves a draft

- **WHEN** the current claimant calls `saveInstanceDraft` on a running,
  assignment-bearing instance
- **THEN** the engine stores the draft with the instance's current step and
  the supplied data

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A non-claimant is refused

- **WHEN** an actor who does not hold the claim calls `saveInstanceDraft` on a
  running, assignment-bearing instance
- **THEN** it throws `NotClaimedError` or `NotClaimantError` and stores
  nothing

#### Scenario: A starter on an assignment-less step saves

- **WHEN** the instance starter calls `saveInstanceDraft` on a running
  instance whose current step declares no assignment
- **THEN** the engine stores the draft

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A non-running instance is refused

- **WHEN** the instance starter, whom no revocation names, calls
  `saveInstanceDraft` on a completed, cancelled, or faulted instance
- **THEN** it throws `InstanceNotRunningError` and stores nothing

#### Scenario: A caller who may not read the instance learns no status

- **WHEN** an actor who may not read a completed instance calls
  `saveInstanceDraft` on it
- **THEN** it throws `AuthorizationError` and stores nothing

<!-- antislop: allow passive-voice - the requirement title must match the live spec verbatim, or archive drops it -->
### Requirement: An operation targeting a non-running instance is rejected at the boundary

`submitAndTransition`, `claimStep`, `releaseClaim`, and `delegateClaim` SHALL
throw `InstanceNotRunningError` when the target instance's status is not
`running`. The error carries the instance id and the observed status. The check
SHALL run after the call loads the instance under its row lock and before the
engine commits any work. The rejection is therefore exact, and no optimistic
check races it.

`submitAndTransition` SHALL report that error to a caller who may read the
instance. Any other caller gets `AuthorizationError`, as "A write call reveals
a finished instance only to a reader" states. `claimStep`, `releaseClaim` and
`delegateClaim` keep the order above. Their status check comes before any
claimant guard.

The engine-level no-op SHALL remain. `commitManualTransition` and
`updateAssignment` keep returning the instance unchanged for a non-running
instance. Internal idempotent re-entry must not throw, for example a timer
firing against an instance a cascade already completed. The runtime boundary
tells only a *caller-initiated* operation.

This rule stops an operation that did nothing from reporting success. Without
the check, a submission against a `cancelled`, `completed` or `faulted`
instance row-locks it and hash-checks its body. The call enforces the claim and
validates the data. It then calls the engine, which returns the untouched
instance. The call commits zero writes and answers a normal `200`, and the
submitted data vanishes. The permanent case is a `faulted` instance, where every
later submission answers success forever.

The concurrent case is the same mistake with a race in front of it. Of two
submissions to the same instance, the loser's data vanishes once the winner's
transition leaves the step. Without the check, the loser hears that it
succeeded. With the check, the loser receives `InstanceNotRunningError` if the
instance no longer runs. Otherwise the loser meets one of the ordinary errors:
a claim error, a validation error or a guard refusal. No outcome keeps the
loser's data, because the instance has left the step the data belonged to.

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A submission to a cancelled instance is rejected

- **WHEN** the instance starter calls `submitAndTransition` on an instance
  whose status is `cancelled`
- **THEN** it throws `InstanceNotRunningError` naming that status, and writes
  no data

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A submission to a faulted instance is rejected every time

- **WHEN** the automatic cascade's loop guard parks an instance as `faulted`
  and the starter retries a submission against it
- **THEN** each retry throws `InstanceNotRunningError` rather than
  answering success

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: Claim and release are rejected the same way

- **WHEN** `claimStep` or `releaseClaim` targets a non-running instance
- **THEN** it throws `InstanceNotRunningError`, rather than returning the
  instance unchanged

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: Delegate is rejected the same way claim and release are

- **WHEN** `delegateClaim` targets a non-running instance
- **THEN** it throws `InstanceNotRunningError`. The call runs no claimant
  guard, writes nothing and appends no event

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: The engine-level no-op is unchanged

- **WHEN** an internal caller re-enters `commitManualTransition` or
  `updateAssignment` for a non-running instance
- **THEN** it returns the instance unchanged, as today. The rejection lives
  at the runtime-API boundary and nowhere in the engine

#### Scenario: Of two concurrent submissions, the loser learns it lost

- **WHEN** two `submitAndTransition` calls target the same instance
  concurrently and the winner's transition leaves the instance non-running
- **THEN** exactly one fulfils and the other rejects with
  `InstanceNotRunningError`, rather than both fulfilling

#### Scenario: A caller who may not read the instance learns no status

- **WHEN** an actor who may not read a cancelled instance calls
  `submitAndTransition` on it
- **THEN** it throws `AuthorizationError` and never `InstanceNotRunningError`

## ADDED Requirements

### Requirement: A write call answers a write result, never the instance

`cancelInstance`, `claimStep`, `releaseClaim` and `delegateClaim` SHALL
return a write result. The result SHALL carry `instanceId`, `status` and
`transitionSeq`. It SHALL carry `assignment` only while the instance is
running and has one. It SHALL NOT carry `data`, `startedBy`, `version` or any
other member of the instance. A stored `null` assignment SHALL NOT reach the
result.

These calls authorize the actor to change an instance. They do not authorize
the actor to read it. Four callers write without a read right: a holder of
`system:cancel-any`, a holder of a stored `cancel` grant, a candidate on a
test instance, and a starter whom a revocation names. The write result gives each of them what the call changed
and nothing else.

A caller who needs the instance reads it through `getInstanceView`. That call
applies the read rule.

#### Scenario: Cancel returns no instance data

- **WHEN** a holder of `system:cancel-any` cancels a running instance
- **THEN** the result carries `instanceId`, `status` `cancelled` and
  `transitionSeq`
- **AND** the result has no `data` member and no `startedBy` member

#### Scenario: Cancelling a completed instance returns no data

- **WHEN** a holder of `system:cancel-any`, who may not read the instance,
  cancels a completed instance
- **THEN** the call returns the write result with `status` `completed`
- **AND** the result has no `assignment` member
- **AND** the engine changes nothing on the instance

#### Scenario: A candidate on a test instance claims and reads no data

- **WHEN** a candidate who did not start a test instance claims its step
- **THEN** the result carries the new `assignment`
- **AND** the result has no `data` member

#### Scenario: Release and delegate answer the same shape

- **WHEN** the claimant releases the claim, or delegates it
- **THEN** each call returns the write result with the new `assignment`
- **AND** neither result has a `data` member
