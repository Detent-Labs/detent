<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: The current claimant may delegate a claim to a named actor

The system SHALL let the actor holding a step's claim delegate it to one
named actor id. The target actor need not be an eligible candidate.
Delegating SHALL row-lock the instance and check that
`assignment.claimedBy` equals the requesting actor's id. On success it
SHALL set `claimedBy` to the target actor's id and refresh `claimedAt`.
This commits with no `HistoryEntry` and no `transitionSeq` advance, the
same mechanism claim and release already use.

The candidate list SHALL NOT change: the delegate does not join
`assignment.candidates`. If the delegate later releases the claim, the
step returns to the original candidate pool, not to the delegate alone.
No check SHALL validate a target actor id against an account directory.
The fields `assignedTo`, `startedBy`, and `claimedBy` already carry
unchecked opaque ids the same way.

#### Scenario: The claimant delegates to a named actor

- **WHEN** the actor holding a step's claim delegates it to a target actor
  id
- **THEN** `assignment.claimedBy` is set to the target actor's id,
  `assignment.claimedAt` refreshes, and `assignment.candidates` is
  unchanged

#### Scenario: A non-claimant cannot delegate

- **WHEN** an actor who is not the current claimant attempts to delegate
  the step's claim
- **THEN** the delegation is rejected and the existing claim is unchanged

#### Scenario: A delegate target need not be an eligible candidate

- **WHEN** the current claimant delegates to an actor id absent from
  `assignment.candidates`
- **THEN** the delegation succeeds and that actor becomes the claimant

#### Scenario: A delegate does not join the candidate pool

- **WHEN** a delegate who is not an original candidate releases the claim
- **THEN** the step returns to `claimedBy` unset, and only the original
  `assignment.candidates` are eligible to claim it again

#### Scenario: A second delegation supersedes the first

- **WHEN** a claimant delegates to actor A, and actor A then delegates the
  same claim to actor B
- **THEN** `assignment.claimedBy` becomes B, and A can no longer submit or
  release the step

#### Scenario: A non-running instance is a silent no-op at the engine level

- **WHEN** a delegation is attempted against an instance whose `status` is
  not `"running"`
- **THEN** the row lock is taken, no guard or write runs, and the instance
  is returned unchanged, matching `claimStep`/`releaseClaim` (see
  `assignment-claim-release-consolidation`)

### Requirement: Delegation appends an audit event without advancing the transition sequence

A successful delegation SHALL append an `assignment.delegated`
`InstanceEvent`. It SHALL carry the instance id, the delegating actor's
id, the target actor's id, the `version`, and the `transitionSeq` in
force. This follows the existing rule that an event never advances the
sequence.

#### Scenario: A successful delegation is recorded as an event

- **WHEN** a claimant delegates a step's claim to a target actor
- **THEN** an `assignment.delegated` event is appended carrying both actor
  ids and the `transitionSeq` in force, unchanged by the delegation
