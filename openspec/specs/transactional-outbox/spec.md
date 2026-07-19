# transactional-outbox

## Purpose

Defines how a transition's side effects are delivered: each ordered trigger action
is enqueued into an outbox row within the same transaction that commits the
transition, so an action exists if and only if its transition committed. A worker
delivers pending rows post-commit, at-least-once, to a handler seam; a
deterministic UUIDv5 idempotency key makes redelivery a no-op (effectively-once),
and permanently-failing rows retry with backoff before reaching a terminal
dead-letter state.

## Requirements

### Requirement: Trigger actions are enqueued atomically with the commit

A committing transition SHALL insert one outbox row per ordered trigger action
(`onExit(source)` then `onPath` then `onEntry(target)`) **within the same database
transaction** as the instance state update and the `HistoryEntry` insert. An
outbox row SHALL exist if and only if its transition committed: a transition that
fails to commit (guard refusal, concurrency conflict, or any error before commit)
leaves no outbox rows.

#### Scenario: A committed transition enqueues its ordered actions
- **WHEN** an instance commits a manual transition whose source `onExit`, path `onPath`, and target `onEntry` together define K actions
- **THEN** exactly K outbox rows are persisted in the same transaction as the state and history writes, one per action, tagged with the committed `transitionSeq`

#### Scenario: A rejected transition enqueues nothing
- **WHEN** a transition is rejected as a concurrency conflict (its `transitionSeq` was stale)
- **THEN** no outbox rows are written and no partial state remains

### Requirement: Each outbox row carries a deterministic idempotency key

Each outbox row SHALL carry an idempotency key that is the UUIDv5 of
`instanceId + transitionSeq + actionId`, materialized at enqueue and constrained
UNIQUE. Because the key is deterministic, re-enqueuing the same action (a replayed
transition) MUST conflict rather than create a duplicate row, and a consumer MAY
use the key to make redelivery a no-op.

#### Scenario: The key is a deterministic function of its coordinates
- **WHEN** an outbox row is enqueued for a given `instanceId`, `transitionSeq`, and `actionId`
- **THEN** its idempotency key equals the UUIDv5 of those three values and is stable across recomputation

#### Scenario: Re-enqueuing the same action is rejected
- **WHEN** an insert is attempted for an idempotency key that already exists
- **THEN** the unique constraint rejects it, leaving the original row untouched

### Requirement: A worker delivers pending rows at-least-once after commit

A delivery worker SHALL claim pending outbox rows, invoke the handler seam for
each, and mark delivered rows so they are not redelivered. Delivery SHALL be
at-least-once: a row that is enqueued but not yet marked delivered — including
after a process restart — MUST be (re)claimed and delivered, never dropped.

#### Scenario: A pending row is delivered and marked
- **WHEN** the worker claims a pending outbox row
- **THEN** it invokes the handler seam for that row's action and, on success, marks the row delivered so a subsequent poll does not redeliver it

#### Scenario: Undelivered rows survive a restart
- **WHEN** the worker process restarts while pending rows remain
- **THEN** those rows are still pending and are claimed and delivered after restart

### Requirement: Failed delivery retries with backoff and dead-letters

A delivery that fails SHALL increment the row's attempt count and be rescheduled
after a backoff delay rather than retried immediately. After a bounded maximum
number of attempts the row SHALL move to a terminal dead-letter state and stop
being retried, so a permanently failing action cannot loop forever.

#### Scenario: A transient failure is retried later
- **WHEN** delivery of a pending row fails and its attempt count is below the maximum
- **THEN** its attempts increment, it is rescheduled after a backoff delay, and it is not reclaimed before that delay elapses

#### Scenario: A row exhausts its attempts and dead-letters
- **WHEN** delivery keeps failing until the attempt count reaches the maximum
- **THEN** the row moves to a terminal dead-letter state and is no longer claimed for delivery
