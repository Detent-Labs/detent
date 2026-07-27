# assignment-claim-release-consolidation Specification

## Purpose

A structural (mechanism-level) requirement over `src/engine/transition.ts`'s
`claimStep`/`releaseClaim`, keeping their identical row-lock/guard/write/
event sequence from being maintained twice. This is an
implementation-mechanism constraint, not user-visible behavior — the
actual claim/release contract it implements is specified by the
`assignment-claim-enforcement` capability.

## Requirements

### Requirement: Claim and release share one row-lock-guard-write-event implementation

`claimStep` and `releaseClaim` SHALL be implemented as two thin callers of
one shared sequence — row-lock the instance, no-op on a non-running
instance, run an operation-specific guard against the current assignment,
compute the new assignment value, write it, and append an
operation-specific `InstanceEvent` — rather than as two independently
maintained copies of that sequence. The timestamp written into the new
assignment value's `claimedAt`/cleared on release, and the timestamp on
the appended event's `at`, SHALL come from the same single point in time,
computed once per call — not independently computed by the assignment-value
and event-construction steps.

#### Scenario: A claim's assignment timestamp and event timestamp agree

- **WHEN** an eligible candidate successfully claims a step
- **THEN** the resulting `assignment.claimedAt` and the appended
  `assignment.claimed` event's `at` are the exact same timestamp value

#### Scenario: A release's event timestamp reflects the same moment as the write

- **WHEN** the claimant successfully releases a claim
- **THEN** the appended `assignment.released` event's `at` reflects the
  same moment the `assignment` row was updated, consistent with
  pre-consolidation behavior

#### Scenario: Each operation's guard is independent

- **WHEN** `claimStep` is called against a step with no declared
  assignment, an already-claimed step, or a non-candidate actor; or
  `releaseClaim` is called by an actor who does not hold the claim
- **THEN** the shared sequence's guard rejects with that operation's own
  specific error type (`NotAssignedError`, `AlreadyClaimedError`,
  `NotACandidateError`, or `NotClaimantError` respectively), identical to
  pre-consolidation behavior, and no write or event append occurs
