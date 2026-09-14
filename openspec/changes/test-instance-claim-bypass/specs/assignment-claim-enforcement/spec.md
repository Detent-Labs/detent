<!-- antislop: allow-file em-dash long-words passive-voice sentence-length -->
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
