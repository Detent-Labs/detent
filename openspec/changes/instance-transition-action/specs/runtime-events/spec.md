<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: An action-driven transition is recorded as an event

The event union SHALL gain an `instance.transitioned-by-action` kind. The
engine records it when an `instance.transition` action moves an instance.
`instance-transition-action` owns when that happens.

The payload SHALL name four values:

- the `byInstanceId` of the acting instance
- the `actionId` of the action that drove the transition
- the `idempotencyKey` of the outbox row that delivered it
- the `pathId` the target took

The event SHALL be recorded on the TARGET instance, not on the acting one. The
acting instance's own record already carries the action's `ActionOutcome`. The
target instance is the one whose record would otherwise show a step change with
no cause. The actor on that transition is the system actor.

The event SHALL land in the same transaction as the target's own transition
commit. A rolled-back transition SHALL leave no event.

It SHALL carry the `version` and the `transitionSeq` in force. It SHALL NOT
advance the sequence. The transition it accompanies advances the sequence as it
otherwise would.

The event SHALL carry no `ActionOutcome`s. It enqueues no actions of its own.
The actions the target's own step entry enqueues belong to that transition's
`HistoryEntry`.

The `idempotencyKey` in the payload is load-bearing beyond attribution. The
capability `instance-transition-action` reads it back to recognize a redelivery
of a transition that already committed. A payload without it would leave a
redelivery indistinguishable from a collision with another acting instance.

The canonical kind table in this specification's Purpose SHALL gain a row for
it, and its count SHALL read thirteen.

#### Scenario: An action-driven transition is recorded on the target
- **WHEN** an `instance.transition` action moves a laptop instance from its
  shelf step to its issued step
- **THEN** the laptop instance carries an `instance.transitioned-by-action`
  event naming the acting instance, the action, the key and the path

#### Scenario: The acting instance carries no such event
- **WHEN** the same transition is recorded
- **THEN** the acting instance carries the action's `ActionOutcome` and no
  `instance.transitioned-by-action` event

#### Scenario: The event does not advance the sequence
- **WHEN** the event is recorded at `transitionSeq` N alongside the target's
  transition
- **THEN** the event carries N, and the transition advances the sequence as it
  otherwise would

#### Scenario: The event does not survive a rolled-back commit
- **WHEN** the transaction carrying the target's transition fails
- **THEN** neither the transition nor the event is persisted

#### Scenario: The event carries no action outcomes
- **WHEN** the event is read back
- **THEN** it carries no `ActionOutcome`s, because it enqueues no actions
