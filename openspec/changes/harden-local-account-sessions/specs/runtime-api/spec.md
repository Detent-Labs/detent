<!-- The MODIFIED block below copies the live runtime-api requirement
     verbatim, apart from the paragraph and the scenarios this change adds.
     That file carries the findings already, and a rewrite here would make
     the delta and its destination disagree. This directive dies with the
     change, at archive time. -->
<!-- antislop: allow-file passive-voice sentence-length -->

## MODIFIED Requirements

### Requirement: Delegate the claim on the current step of a running instance

`delegateClaim(instanceId, actor, toActorId, db?)` SHALL row-lock the
instance and check that `assignment.claimedBy === actor.id`. On success
it SHALL set `claimedBy = toActorId`, refresh `claimedAt`, append an
`assignment.delegated` `InstanceEvent`, and return the updated
`Instance`. It SHALL throw `NotClaimantError` when the calling actor does
not hold the claim, the same error `releaseClaim` throws for the same
reason. No check validates `toActorId` against `assignment.candidates`.

`delegateClaim` SHALL check `toActorId` against the local account
directory, but only when the calling actor's own id resolves there. A target
the directory does not hold SHALL raise `UnknownDelegateError`, naming the
target, and the claim SHALL stay where it is. A deployment on an external
identity provider holds no directory entry for its own actors, so the check
finds no delegator there and runs no target check either. The condition keeps
this rule from rejecting every delegation in such a deployment.

The target check SHALL run under the same row lock as the claimant check, and
only after it. A caller who does not hold the claim SHALL therefore meet
`NotClaimantError`, whatever target it names, as the paragraph above already
requires. Ordering it the other way would also make this route answer whether
an arbitrary `user_id` exists, one try at a time, for any actor holding a
claim on any instance.

#### Scenario: The claimant delegates successfully

- **WHEN** `delegateClaim` is called by the actor currently holding the
  claim, naming a target actor id
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  set to the target actor's id and `assignment.claimedAt` refreshed

#### Scenario: A non-claimant cannot delegate

- **WHEN** `delegateClaim` is called by an actor who does not hold the
  current claim
- **THEN** it throws `NotClaimantError` and the existing claim is
  unchanged

#### Scenario: A delegate target need not be an eligible candidate

- **WHEN** `delegateClaim` names a target actor id absent from
  `assignment.candidates`
- **THEN** the call still succeeds, and that actor becomes the claimant

#### Scenario: A target outside the directory is rejected

- **WHEN** the calling actor's id resolves in the local account directory,
  and `delegateClaim` names a target id that does not
- **THEN** it throws `UnknownDelegateError`, the claim stays with the calling
  actor, and no `assignment.delegated` event is appended

#### Scenario: A non-claimant learns nothing about the target

- **WHEN** an actor who does not hold the current claim calls
  `delegateClaim` with a target id absent from the directory
- **THEN** it throws `NotClaimantError`, the same error it throws for a
  target the directory does hold

#### Scenario: A deployment with no local accounts delegates as before

- **WHEN** the calling actor's id does not resolve in the local account
  directory, and `delegateClaim` names any target id
- **THEN** the call succeeds, exactly as it does today
