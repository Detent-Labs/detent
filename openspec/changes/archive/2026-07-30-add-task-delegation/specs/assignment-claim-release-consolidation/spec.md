<!-- antislop: allow-file passive-voice -->
## MODIFIED Requirements

### Requirement: Claim and release share one row-lock-guard-write-event implementation

`claimStep`, `releaseClaim`, and `delegateClaim` SHALL be three thin
callers of one shared sequence, not independently maintained copies of
it. The sequence row-locks the instance and no-ops on a non-running
instance. It runs an operation-specific guard against the current
assignment. It computes the new assignment value, writes it, and appends
an operation-specific `InstanceEvent`.

Its `claimedAt` (set by claim and delegate, cleared by release) SHALL
match the appended event's `at`. Both SHALL come from one point in time,
computed once per call, not independently by the assignment-value and
event-construction steps.

#### Scenario: A claim's assignment timestamp and event timestamp agree

- **WHEN** an eligible candidate successfully claims a step
- **THEN** the resulting `assignment.claimedAt` and the appended
  `assignment.claimed` event's `at` are the exact same timestamp value

#### Scenario: A release's event timestamp reflects the same moment as the write

- **WHEN** the claimant successfully releases a claim
- **THEN** the appended `assignment.released` event's `at` reflects the
  same moment the `assignment` row was updated, consistent with
  pre-consolidation behavior

#### Scenario: A delegation's assignment timestamp and event timestamp agree

- **WHEN** the current claimant successfully delegates a step's claim to a
  target actor
- **THEN** the resulting `assignment.claimedAt` and the appended
  `assignment.delegated` event's `at` are the exact same timestamp value

#### Scenario: Claim's guard is independent

- **WHEN** `claimStep` is called against a step with no declared
  assignment, an already-claimed step, or a non-candidate actor
- **THEN** the shared sequence's guard rejects with that operation's own
  error type: `NotAssignedError`, `AlreadyClaimedError`, or
  `NotACandidateError`. No write or event append occurs

#### Scenario: Release and delegate's guards are independent

- **WHEN** `releaseClaim` or `delegateClaim` is called by an actor who
  does not currently hold the claim
- **THEN** the shared sequence's guard rejects with `NotClaimantError`,
  and no write or event append occurs
