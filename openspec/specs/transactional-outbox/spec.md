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

A delivery worker SHALL deliver pending outbox rows in three separable steps: it
SHALL **claim** a due row — marking it `claimed` with a lease — and commit before
invoking the handler; it SHALL invoke the handler **outside any transaction**; and
it SHALL **mark** the row `delivered` in a second transaction that compare-and-sets
on the `claimed` state and applies the action's effects in the same commit.
Delivery SHALL be at-least-once: a row not yet marked delivered — including after a
process restart, and a `claimed` row whose lease has expired (a crashed worker) —
MUST be reclaimed and delivered, never dropped.

#### Scenario: The handler runs off the row lock
- **WHEN** the worker claims a due row
- **THEN** it commits the claim and releases the row lock before invoking the handler, so the handler executes holding no database lock

#### Scenario: The delivered mark and its effects are one atomic, once-only unit
- **WHEN** the mark transaction runs after a successful handler invocation
- **THEN** it compare-and-sets the row from `claimed` to `delivered` and applies the action's effects in the same commit, so a reclaimed-then-late worker cannot mark or apply twice

#### Scenario: A stale claim is reclaimed
- **WHEN** a `claimed` row's lease has expired because its worker crashed before marking it
- **THEN** a later drain re-leases it (a fresh claim) and delivers it, never dropping it

#### Scenario: Undelivered rows survive a restart
- **WHEN** the worker process restarts while pending or expired-claim rows remain
- **THEN** those rows are claimed and delivered after restart

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

### Requirement: Delivery isolates a poison row from the batch

Each claimed row SHALL be processed inside its own error boundary, covering the action parse and the
post-handler mark transaction (the CAS to delivered/dead-letter/pending, the writeback, and the
`ActionOutcome` append) as well as the handler run. An unexpected throw from the action parse or the mark
transaction — a corrupt action row, or a transient error applying the writeback — SHALL leave that one row
`claimed` for reclaim after its lease and leave every other claimed row in the pass to be delivered. A
single poison row SHALL NOT abort the pass and strand the rest of the batch until their lease elapses.

The error boundary SHALL NOT itself mark the failed row, so the recovery is the same one a crashed worker
already relies on (lease reclaim) and no second write races the aborted mark transaction.

#### Scenario: A poison row does not starve its batch

- **WHEN** a delivery pass claims a batch in which one row's mark transaction throws (for example, a
  writeback whose target path is malformed) alongside rows that deliver normally
- **THEN** the normally-delivering rows reach `delivered` in that same pass and the poison row remains
  `claimed` for a later lease-reclaim

### Requirement: Each outbox row is stamped with the field-version it was enqueued under

Every `INSERT INTO outbox` SHALL stamp the new row's `field_version` to the
enqueuing instance's version at that moment. This applies to every
enqueue site: instance creation's initial-step spawn, a transition's general
step-entry enqueue, and a timer firing's enqueue.

A row's `field_version` therefore always equals the instance's version at
enqueue time, and — because migration locks and remaps all of an instance's
outbox rows atomically with the instance's own version bump (see
`instance-migration`) — stays equal to the instance's current version for as
long as the row is undelivered.

#### Scenario: A row enqueued at instance creation is stamped

- **WHEN** an instance is created and its initial step enqueues actions
- **THEN** each enqueued row's `field_version` equals the instance's version
  at creation

#### Scenario: A row enqueued by a transition is stamped

- **WHEN** a transition commits and enqueues trigger actions
- **THEN** each enqueued row's `field_version` equals the instance's version
  at that commit

#### Scenario: A row enqueued by a timer fire is stamped

- **WHEN** a timer fires and enqueues its actions
- **THEN** each enqueued row's `field_version` equals the instance's version
  at that fire

### Requirement: Delivery is suppressed if the instance's version no longer matches the row's field_version

The claim step's snapshot (`ClaimedRow`) SHALL carry the claimed row's
`field_version`. The delivery transaction's instance-writeback UPDATE SHALL
additionally require the instance's current version to equal that
`field_version`, alongside its existing `status = 'running'` predicate, in the
same statement.

When this predicate fails — because the instance has migrated since the row
was claimed — the writeback SHALL affect no row, and this SHALL fold into the
existing suppression accounting (a writeback that affects no row is recorded
as suppressed on the `ActionOutcome`, exactly as an already-terminal instance
is today). No new outcome status is introduced.

#### Scenario: A writeback commits when the version still matches

- **WHEN** a claimed row's `field_version` still equals the instance's current
  version at delivery
- **THEN** the writeback applies normally and the row reaches `delivered`

#### Scenario: A stale writeback is suppressed, not misapplied

- **WHEN** an instance migrates after a row is claimed but before that claim's
  handler completes, and the handler then completes and delivery attempts the
  writeback
- **THEN** the writeback affects no row, the outcome is recorded as
  suppressed, and no value is written under the row's original (pre-migration)
  field id

#### Scenario: An unaffected instance still delivers normally

- **WHEN** a row is claimed and delivered for an instance that has not
  migrated
- **THEN** the version-fold predicate matches and delivery proceeds exactly as
  it does today
