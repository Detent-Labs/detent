<!-- antislop: allow-file em-dash long-words passive-voice -->
<!-- The MODIFIED block copies live requirement text verbatim; this directive covers that copied text. -->
## MODIFIED Requirements

### Requirement: Claim the current step of a running instance

`claimStep(instanceId, actor, db?)` SHALL row-lock the instance and, when
`status === "running"`, require the current step has a declared
`instance.assignment`, require the actor is an eligible candidate (`actor.id`
or any of `actor.roles` present in `assignment.candidates`), and require
`claimedBy` is currently unset. On success it SHALL set `claimedBy =
actor.id`, `claimedAt` to the current time, append an `assignment.claimed`
`InstanceEvent`, and return the updated `Instance`. It SHALL throw
`NotAssignedError` when the current step has no declared `assignment`,
`NotACandidateError` when the actor is not eligible, and `AlreadyClaimedError`
when `claimedBy` is already set. On a non-running instance it SHALL NOT
throw — it returns the instance unchanged, a silent no-op (see
`assignment-claim-release-consolidation`).

The candidate requirement above widens on an instance whose `kind` is
`"test"`. There, `claimStep` SHALL also admit the instance's `startedBy` actor
and any `system:admin` holder. The `draft-test-instances` capability states
that rule. `NotACandidateError` there means the actor is neither an eligible
candidate nor one of those two.

#### Scenario: An eligible candidate claims successfully
- **WHEN** `claimStep` is called by an eligible candidate on a running
  instance's unclaimed, assignment-bearing current step
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  set to the actor's id

#### Scenario: A non-running instance is a no-op
- **WHEN** `claimStep` is called on an instance whose `status` is not
  `"running"`
- **THEN** it returns the instance unchanged, with no error thrown and no
  `assignment.claimed` event appended

#### Scenario: A step with no declared assignment cannot be claimed
- **WHEN** `claimStep` is called on a running instance whose current step has
  no declared `assignment`
- **THEN** it throws `NotAssignedError`

#### Scenario: A non-candidate is rejected
- **WHEN** `claimStep` is called by a non-candidate actor on a published
  instance
- **THEN** it throws `NotACandidateError` and the instance is unchanged

#### Scenario: A test instance's starter claims without candidacy
- **WHEN** a test instance's starter, matching no candidate, calls
  `claimStep` on its unclaimed, assignment-bearing current step
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  set to that actor's id

#### Scenario: An already-claimed step is rejected
- **WHEN** `claimStep` is called on a step whose `assignment.claimedBy` is
  already set
- **THEN** it throws `AlreadyClaimedError` and the existing claim is
  unchanged
