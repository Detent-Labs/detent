## MODIFIED Requirements

### Requirement: Submit data and trigger a manual transition atomically under a row lock

`submitAndTransition(instanceId, pathId, data, actor, db?)` SHALL, inside one
transaction, read the instance row with a row lock (`SELECT ... FOR UPDATE`),
resolve and hash-verify its pinned `ProcessBody`, and — if the current step
has a declared (non-unset) `instance.assignment` — require
`actor.id === instance.assignment.claimedBy`, throwing `NotClaimedError`
when `claimedBy` is unset and `NotClaimantError` when it is set to a
different actor, before any submission validation runs. A step with no
declared `assignment` is unaffected by this check, identical to today's
behavior. Once this check passes (or is not applicable), it SHALL validate
`data` against the current step's resolved view and against
`FieldValidation`, and — on success — commit the data write and the manual
transition on `pathId` atomically via `commitManualTransition`. The row lock
is held for exactly this one commit, not for any subsequent automatic-path
cascade.

The row lock exists because a wholesale `data` patch is not protected by the
`transitionSeq` optimistic-concurrency predicate: a concurrent `Action.output`
writeback (`outbox.ts`) patches a single field of `data` without advancing or
checking `transitionSeq`, so a wholesale patch computed from an unlocked read
taken before such a writeback lands, but committed after, would silently
discard it. `submitAndTransition` SHALL NOT use an unlocked read (such as
`store.ts::rehydrate` alone) for the read its commit is based on.

`submitAndTransition` SHALL take `instanceId`, never a caller-supplied
`Instance` snapshot, so the whole read-validate-commit sequence stays inside
one call and one transaction.

Every key in `data` SHALL lie within the current step's visible-and-editable
field set (`visible && !readonly`, excluding any `ViewField` resolving to a
group-container ref, resolved the same way `getInstanceView` resolves
`fields`, against the pre-submission committed data). A key outside that set
SHALL be rejected as `unknown-field` (not present in the resolved view) or
`readonly-field` (present but not editable) without touching the instance.

All located validation issues SHALL be collected into one thrown
`SubmissionValidationError` rather than failing on the first found. Only
once every submitted field passes SHALL the target path's guard be evaluated
against the merged (data applied, not yet committed) instance; a guard that
evaluates false SHALL throw the existing `GuardRefused`, leaving the instance
uncommitted.

After the commit's transaction completes, `submitAndTransition` SHALL run the
resulting instance through `resolveAutomatic` using the ordinary (unlocked)
`db`, matching the transactional granularity every other automatic-cascade
caller already uses. If this cascade raises the engine's existing
`AutomaticCascadeLoop`, the submitted data and the manual transition have
already committed — this is not a rejected submission, and the instance is
left `faulted`.

#### Scenario: A field outside the current view is rejected
- **WHEN** `data` includes a key for a field not visible on the instance's
  current step
- **THEN** it throws `SubmissionValidationError` with an `unknown-field`
  issue for that key, and the instance is uncommitted

#### Scenario: A field marked readonly on the current view is rejected
- **WHEN** `data` includes a key for a field the current step's view marks
  `readonly`
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and the instance is uncommitted

#### Scenario: A group-container field is never an accepted submission key
- **WHEN** `data` includes a key for a `FieldDef` of `type: "group"`, even
  one the current step's view marks visible
- **THEN** it throws `SubmissionValidationError` with an `unknown-field`
  issue for that key

#### Scenario: Multiple validation issues are all reported together
- **WHEN** a submission violates more than one validation rule at once (for
  example, one field fails a type check and another is missing a
  required value)
- **THEN** the thrown `SubmissionValidationError` carries an issue for each
  violation, not only the first

#### Scenario: A valid submission commits data and transition atomically, preserving unrelated fields
- **WHEN** `data` passes every validation rule and the target path's guard
  holds against the merged instance, and the instance's existing `data`
  carries fields not included in this submission
- **THEN** the submitted data is written, every other previously stored field
  remains present, and the manual transition on `pathId` commits in the same
  atomic operation, and the returned `Instance` reflects both

#### Scenario: A submission whose merged guard fails is rejected without commit
- **WHEN** `data` passes every validation rule but the target path's guard
  evaluates false against the merged instance
- **THEN** it throws the existing `GuardRefused` and neither the data nor the
  transition is committed

#### Scenario: Two concurrent submissions serialize rather than racing into a concurrency conflict
- **WHEN** two `submitAndTransition` calls target the same instance concurrently
- **THEN** the row lock serializes them — the second's read blocks until the
  first's transaction commits and then observes the already-committed state,
  so it either succeeds against that new state or fails with whatever
  ordinary error applies to it, not `ConcurrencyConflict`

#### Scenario: An unlocked engine-level commit racing submitAndTransition surfaces a concurrency conflict
- **WHEN** a direct, unlocked engine call (e.g. `executeManualTransition` or
  `fireTimer` holding a stale in-memory `Instance`) commits against the same
  instance concurrently with a `submitAndTransition` call, and
  `submitAndTransition`'s commit lands first
- **THEN** the unlocked call's own commit throws the engine's existing
  `ConcurrencyConflict` when it discovers `transitionSeq` moved out from
  under it

#### Scenario: A concurrent action writeback is not lost
- **WHEN** an `Action.output` writeback into a field outside a submission
  lands on the instance between `submitAndTransition`'s locked read and its
  commit
- **THEN** the writeback's value is present in the instance's `data` after
  the submission commits — the row lock serializes the writeback's own commit
  either fully before or fully after `submitAndTransition`'s transaction, so
  neither can read a state the other is mid-writing

#### Scenario: A cascade loop after a successful submission is not a rejected submission
- **WHEN** `submitAndTransition`'s commit succeeds and the subsequent
  automatic cascade re-enters a step already seen in the same advance
- **THEN** it throws the engine's existing `AutomaticCascadeLoop`, the
  submitted data and manual transition remain committed, and the instance's
  status is `faulted`

#### Scenario: A submission to an unclaimed assigned step is rejected before validation
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  unset, and any actor calls `submitAndTransition`
- **THEN** it throws `NotClaimedError` before any field validation runs, and
  the instance is uncommitted

#### Scenario: A submission by a non-claimant to a claimed step is rejected
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  set to a different actor's id, and the calling actor's id does not match
- **THEN** it throws `NotClaimantError` before any field validation runs,
  and the instance is uncommitted

#### Scenario: The claimant may submit
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  set to the calling actor's id
- **THEN** the enforcement check passes and submission proceeds to field
  validation as normal

#### Scenario: A step with no declared assignment is unaffected
- **WHEN** the current step has no `assignment` field
- **THEN** `submitAndTransition` performs no claim check, identical to
  today's behavior

## ADDED Requirements

### Requirement: Claim the current step of a running instance

`claimStep(instanceId, actor, db?)` SHALL row-lock the instance, require
`status === "running"`, require the current step has a declared
`instance.assignment`, require the actor is an eligible candidate (`actor.id`
or any of `actor.roles` present in `assignment.candidates`), and require
`claimedBy` is currently unset. On success it SHALL set `claimedBy =
actor.id`, `claimedAt` to the current time, append an `assignment.claimed`
`InstanceEvent`, and return the updated `Instance`. It SHALL throw
`NotAssignedError` when the current step has no declared `assignment`,
`NotACandidateError` when the actor is not eligible, and `AlreadyClaimedError`
when `claimedBy` is already set.

#### Scenario: An eligible candidate claims successfully
- **WHEN** `claimStep` is called by an eligible candidate on a running
  instance's unclaimed, assignment-bearing current step
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  set to the actor's id

#### Scenario: A step with no declared assignment cannot be claimed
- **WHEN** `claimStep` is called on a running instance whose current step has
  no declared `assignment`
- **THEN** it throws `NotAssignedError`

#### Scenario: A non-candidate is rejected
- **WHEN** `claimStep` is called by an actor who is not an eligible
  candidate
- **THEN** it throws `NotACandidateError` and the instance is unchanged

#### Scenario: An already-claimed step is rejected
- **WHEN** `claimStep` is called on a step whose `assignment.claimedBy` is
  already set
- **THEN** it throws `AlreadyClaimedError` and the existing claim is
  unchanged

### Requirement: Release a claim on the current step of a running instance

`releaseClaim(instanceId, actor, db?)` SHALL row-lock the instance, require
`assignment.claimedBy === actor.id`, and on success clear `claimedBy` and
`claimedAt`, append an `assignment.released` `InstanceEvent`, and return the
updated `Instance`. It SHALL throw `NotClaimantError` when the calling
actor does not hold the claim.

#### Scenario: The claimant releases successfully
- **WHEN** `releaseClaim` is called by the actor currently holding the
  claim
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  and `assignment.claimedAt` cleared

#### Scenario: A non-claimant is rejected
- **WHEN** `releaseClaim` is called by an actor who does not hold the
  current claim
- **THEN** it throws `NotClaimantError` and the existing claim is unchanged
