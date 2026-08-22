# runtime-api

## ADDED Requirements

### Requirement: Save an instance form draft through the runtime API

`saveInstanceDraft(instanceId, data, actor, db?)` SHALL persist the
participant's unfinished form input for a running instance, into the
`instance-form-drafts` capability's per-instance draft. It SHALL authorize the
actor by the same relationship rule `submitAndTransition` enforces: on a step
with an assignment, the current claimant alone; on a step without one, the
instance starter or a holder of `ADMIN_ROLE`. It SHALL reject a non-running
instance with `InstanceNotRunningError`. It SHALL store the data leniently,
with no field validation, and record the instance's current step as the
draft's step.

#### Scenario: The claimant saves a draft

- **WHEN** the current claimant calls `saveInstanceDraft` on a running,
  assignment-bearing instance
- **THEN** the draft is stored with the instance's current step and the
  supplied data

#### Scenario: A non-claimant is refused

- **WHEN** an actor who does not hold the claim calls `saveInstanceDraft` on a
  running, assignment-bearing instance
- **THEN** it throws `NotClaimedError` or `NotClaimantError` and stores
  nothing

#### Scenario: A starter on an assignment-less step saves

- **WHEN** the instance starter calls `saveInstanceDraft` on a running
  instance whose current step declares no assignment
- **THEN** the draft is stored

#### Scenario: A non-running instance is refused

- **WHEN** `saveInstanceDraft` targets a completed, cancelled, or faulted
  instance
- **THEN** it throws `InstanceNotRunningError` and stores nothing

### Requirement: The instance view carries the participant's saved form draft

`getInstanceView` SHALL include a `draft` field in the returned `InstanceView`
when the instance holds a form draft whose recorded step matches the
instance's current step. The field SHALL carry the draft's data, step, saving
actor, and save time. It SHALL be absent when no matching draft exists.

#### Scenario: A matching draft is returned

- **WHEN** an authorized actor reads the view of an instance holding a draft
  for its current step
- **THEN** the view carries `draft` with the stored data and metadata

#### Scenario: A draft from another step is not returned

- **WHEN** an instance holds a draft whose recorded step differs from its
  current step
- **THEN** the view carries no `draft`

#### Scenario: No draft means no field

- **WHEN** an instance holds no draft
- **THEN** the view carries no `draft`
