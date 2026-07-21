## ADDED Requirements

### Requirement: An unmatched subprocess return outcome is recorded as an event

When a subprocess child's return is delivered, the parent's `outputMapping`
is applied and its writeback committed, but no automatic path's guard
matches `child.outcome`, the engine SHALL record a `subprocess.outcome-unmatched`
event naming the parent's subprocess step and the unmatched outcome, so the
parent remaining parked is queryable rather than silent.

This follows the same posture as `timer.unarmed`: the return delivery stays
total and does not fail — the writeback it already applied is not undone,
and the outbox row is still marked delivered — but the fact that no path
advanced the parent becomes retrievable from the runtime record instead of
disappearing when the delivery's `child` namespace goes out of scope.

The event SHALL enqueue no actions and SHALL NOT advance `transitionSeq`,
matching `migration.skipped`: this is a "no transition, no actions" record,
not the "actions enqueued, no transition" shape `timer.fired` and
`subprocess.spawn-enqueued` use.

The event's `version` SHALL be the parent's version and its `transitionSeq`
SHALL be the parent's `transitionSeq` in force at the time of delivery — the
value read and re-checked under the same lock as the writeback, since no
transition changes either.

#### Scenario: An unmatched outcome is recorded

- **WHEN** a subprocess child's return is delivered, the parent's
  `outputMapping` is applied, and no automatic path on the parent's
  subprocess step matches `child.outcome`
- **THEN** a `subprocess.outcome-unmatched` event naming that step and the
  outcome is recorded in the same transaction as the writeback, the parent
  remains parked at the subprocess step, and its `transitionSeq` is
  unchanged

#### Scenario: A reserved cancel outcome that matches no path is recorded

- **WHEN** an independently cancelled subprocess child returns with the
  reserved `"cancelled"` outcome, and the parent's subprocess step declares
  no path guarding on it
- **THEN** a `subprocess.outcome-unmatched` event naming the `"cancelled"`
  outcome is recorded, exactly as for any other unmatched outcome

#### Scenario: A matched outcome records no event

- **WHEN** a subprocess child's return is delivered and an automatic path on
  the parent's subprocess step matches `child.outcome`
- **THEN** the parent advances along that path as before, and no
  `subprocess.outcome-unmatched` event is recorded

#### Scenario: The event carries no action outcomes

- **WHEN** a `subprocess.outcome-unmatched` event is recorded
- **THEN** it carries no `actions` field, since no actions were enqueued
