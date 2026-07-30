<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: A claim delegation is recorded as an event

The event union SHALL gain an `assignment.delegated` kind. The current
claimant of a step triggers it by delegating the claim to a named target
actor. Its payload SHALL carry `fromActorId` (the delegating actor) and
`toActorId` (the new claimant). Delegation is not a transition, so this
event, like `assignment.claimed` and `assignment.released`, SHALL NOT
advance `transitionSeq` and SHALL enqueue no actions.

#### Scenario: A delegation is recorded

- **WHEN** the current claimant delegates a step's claim to a target actor
- **THEN** an `assignment.delegated` event naming both actor ids is
  recorded, and the instance's `transitionSeq` is unchanged

#### Scenario: The event carries no action outcomes

- **WHEN** an `assignment.delegated` event is recorded
- **THEN** it carries no `actions` field, since no actions were enqueued
