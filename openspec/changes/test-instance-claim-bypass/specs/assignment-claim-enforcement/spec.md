<!-- antislop: allow-file em-dash long-words passive-voice sentence-length trailing-negation -->
<!-- The MODIFIED block copies live requirement text verbatim; this directive covers that copied text. -->
## MODIFIED Requirements

### Requirement: Claiming a step is exclusive

Claiming a running instance's current step SHALL row-lock the instance
(`SELECT ... FOR UPDATE`), require the current step has a declared
(non-unset) `instance.assignment`, require the requesting actor is an
eligible candidate, and require `claimedBy` is currently unset. On success it
SHALL set `claimedBy` to the actor's id and `claimedAt` to the current time,
and SHALL commit with no `HistoryEntry` (no step change) and no
`transitionSeq` advance (not a transition). A claim attempt against a step
with no declared assignment SHALL throw `NotAssignedError`, distinct from
`NotACandidateError`/`AlreadyClaimedError` so it maps to its own HTTP status.
Against a non-running instance none of these checks run: the row lock is
taken, `status !== "running"` short-circuits to a silent no-op, and the
instance is returned unchanged (see `assignment-claim-release-consolidation`)
— not a rejection, since there is no assignment state to reject a change to.

A test instance widens the candidate requirement alone. There, the claim also
admits the instance's starter and any `system:admin` holder, per the
`draft-test-instances` capability. The assignment and exclusivity checks stay
as stated above.

#### Scenario: An eligible candidate claims an unclaimed step

- **WHEN** an eligible candidate actor claims a running instance's current
  step, which has candidates resolved and no existing claim
- **THEN** the claim succeeds, `assignment.claimedBy` is set to the actor's
  id, `assignment.claimedAt` is set, and neither a `HistoryEntry` is
  appended nor `transitionSeq` advances

#### Scenario: A non-candidate cannot claim

- **WHEN** a non-candidate actor attempts to claim a published instance's
  step with resolved candidates
- **THEN** the claim is rejected and `assignment.claimedBy` remains unset

#### Scenario: An already-claimed step cannot be claimed again

- **WHEN** an actor attempts to claim a step whose `assignment.claimedBy`
  is already set to a different actor
- **THEN** the claim is rejected and the existing claim is unchanged

#### Scenario: A step with no declared assignment cannot be claimed

- **WHEN** an actor attempts to claim the current step of an instance whose
  `instance.assignment` is unset
- **THEN** the claim is rejected with `NotAssignedError`

#### Scenario: Two actors racing to claim the same unclaimed step resolve to exactly one winner

- **WHEN** two eligible candidate actors concurrently attempt to claim the
  same unclaimed step
- **THEN** the row lock serializes the two attempts and exactly one
  succeeds; the other observes the step already claimed and is rejected

### Requirement: An actor is an eligible candidate by id or by role, sharing one flat namespace

The engine SHALL treat an actor as an eligible candidate for a step if
`actor.id` is present in `instance.assignment.candidates`, or if any entry
of `actor.roles` is present in `instance.assignment.candidates`. Ids and
role names SHALL share one flat namespace — no discriminator distinguishes
them.

#### Scenario: An actor is eligible by matching id

- **WHEN** `instance.assignment.candidates` includes `"user_42"` and an
  actor with `id: "user_42"` attempts to claim
- **THEN** the actor is eligible, regardless of their `roles`

#### Scenario: An actor is eligible by matching role

- **WHEN** `instance.assignment.candidates` includes `"finance-approver"`
  and an actor whose `roles` includes `"finance-approver"` attempts to claim
- **THEN** the actor is eligible, regardless of their `id`

#### Scenario: An actor matching neither id nor role is not eligible

- **WHEN** neither an actor's `id` nor any entry of their `roles` appears in
  `instance.assignment.candidates`
- **THEN** the actor is not an eligible candidate for the step

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
  `assignment.candidates` are eligible candidates for it again

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
