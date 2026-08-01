## ADDED Requirements

### Requirement: The instance view carries the current step's assignment state

`getInstanceView` SHALL include the instance's `assignment` in the returned
`InstanceView`. The field SHALL carry the persisted `AssignmentState`
unchanged, in the same shape `InstanceSummary` already uses. It SHALL be
absent when the instance holds no assignment, which happens when the current
step declares none.

The value reports the instance. `getInstanceView` SHALL NOT empty or rewrite
it for a non-running instance, unlike `availablePaths`. A caller reading a
completed instance can therefore still see who held the final claim.

This adds no authorization work. `getInstanceView` already reads
`instance.assignment` to authorize the caller. That test accepts four
relationships to the instance: `ADMIN_ROLE`, `startedBy`, current claimant,
or eligible candidate on the current step. Every caller that reaches the
return already passed it.

#### Scenario: A view on an assignment-bearing step carries the assignment

- **WHEN** an authorized actor calls `getInstanceView` for an instance whose
  current step declares an `assignment`
- **THEN** the returned view carries `assignment` with that step's resolved
  `candidates`, and with `claimedBy` and `claimedAt` when an actor holds the
  claim

#### Scenario: A view on a step with no assignment omits the field

- **WHEN** an authorized actor calls `getInstanceView` for an instance whose
  current step declares no `assignment`
- **THEN** the returned view carries no `assignment`

#### Scenario: A completed instance still reports its assignment

- **WHEN** an authorized actor calls `getInstanceView` for a completed
  instance that still carries a claim
- **THEN** the returned view carries that `assignment`, and `availablePaths`
  stays empty
