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

The attempt count SHALL be incremented by the **claim** itself — in the same
UPDATE that sets `status = 'claimed'` — not only by the paths that complete a
delivery. Every claim, completed or abandoned, therefore costs one attempt.
Incrementing only on completion makes the dead-letter cap unreachable for the
failure class that most needs bounding: a delivery that never reaches its
marking transaction (the handler killed the process; the lease expired and a
peer reclaimed the row; the marking transaction itself threw) leaves the count
unchanged, so the row is re-claimed at the same count forever, and because the
claim query is ordered by creation time the poison row is claimed first on
every pass. The consequence — a row whose delivery succeeds after a
lease-expiry reclaim shows one more attempt than deliveries actually made —
is accepted: the counter exists to terminate a bad row, not to be an exact
delivery census.

The maximum attempt count and the backoff delay computation SHALL come from
the failing action's own declared `retry` policy (`maxAttempts`, `backoff`,
`baseDelay`) when present, overriding the engine's default for that action
alone. An action with no declared `retry` policy SHALL use the engine's
default maximum attempts and default exponential backoff, unchanged from
before per-action policies existed. `backoff` SHALL select the delay
strategy: `"none"` computes a zero delay (retry on the very next drain
once due), `"fixed"` computes a constant delay equal to `baseDelay` (or
the engine default if `baseDelay` is omitted), and `"exponential"`
computes `baseDelay * 2^(attempts - 1)` (or the engine default base,
likewise). `maxAttempts` and `backoff` are independent: `backoff: "none"`
still allows up to `maxAttempts` retries, each with no delay.

#### Scenario: A transient failure is retried later
- **WHEN** delivery of a pending row fails and its attempt count is below the maximum
- **THEN** its attempts increment, it is rescheduled after a backoff delay, and it is not reclaimed before that delay elapses

#### Scenario: A row exhausts its attempts and dead-letters
- **WHEN** delivery keeps failing until the attempt count reaches the maximum
- **THEN** the row moves to a terminal dead-letter state and is no longer claimed for delivery

#### Scenario: An abandoned delivery still costs an attempt

- **WHEN** a row is claimed and its delivery never reaches the marking
  transaction — the worker died, or the lease expired and a peer reclaimed the
  row
- **THEN** the stored attempt count is one higher than before the claim, so
  repeated abandonment reaches the maximum and dead-letters

#### Scenario: An action's declared retry policy overrides the default maximum attempts

- **WHEN** a failing action declares `retry.maxAttempts` lower than the
  engine's default
- **THEN** the row dead-letters once its attempt count reaches that
  action's declared maximum, not the engine's default

#### Scenario: An action's declared retry policy overrides the default backoff delay

- **WHEN** a failing action declares `retry.backoff: "fixed"` with a
  `retry.baseDelay`
- **THEN** each retry after a failure is rescheduled after exactly that
  fixed delay, not the engine's default exponential schedule

#### Scenario: An action with no declared retry policy is unaffected

- **WHEN** a failing action declares no `retry` field
- **THEN** its maximum attempts and backoff delay computation are exactly
  the engine's defaults, identical to behavior before per-action retry
  policies were honored

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

### Requirement: Delivery is bounded by a deadline the handler cannot opt out of

The outbox worker SHALL impose its own deadline on every delivery, derived
from the claim lease, and SHALL NOT rely on a handler-declared timeout being
present. A delivery that exceeds the deadline SHALL be treated as an ordinary
transient failure — backoff, retry, and eventually dead-letter — using the
existing failure branch rather than a new terminal state.

Without this, a target that accepts the connection and never responds hangs
the delivery forever. The poll loop awaits the whole tick before scheduling
the next one, and one worker exists per process, so a single hung delivery
stops **all** action delivery engine-wide, including the engine-internal
subprocess spawn and return rows — every subprocess parent then parks
permanently and every `Action.output` writeback stops. Neither `stop()` nor
lease reclaim recovers it: the former clears a timer that is not pending, and
the only worker that could reclaim the row is the stuck one.

The deadline SHALL be the claim lease, because a delivery still running past
its lease holds a row another worker may already have claimed, so completing
it is unsound regardless.

Racing the delivery does not cancel the handler's own work; releasing the
underlying resource is the handler's responsibility (see the
`http-action-handler` capability). All state changes for the row SHALL happen
on the racing path, so an abandoned handler continuation cannot write
anything.

#### Scenario: A hung delivery does not stop the worker

- **WHEN** a handler's delivery neither resolves nor rejects
- **THEN** the delivery is abandoned once the deadline elapses, the row is
  marked as a transient failure with backoff, the drain pass completes, and
  the next poll tick is scheduled

#### Scenario: A hung delivery does not stop unrelated actions

- **WHEN** one row's handler hangs and other rows are pending, including
  engine-internal subprocess spawn or return rows
- **THEN** those other rows are delivered on the same or a subsequent pass

#### Scenario: A hung delivery eventually dead-letters

- **WHEN** the same row's handler hangs on every attempt
- **THEN** its attempt count advances on each attempt and the row reaches the
  dead-letter state rather than being retried forever

### Requirement: An Action.output writeback is checked against its target field's declared type

Before writing a patch entry into `instance.data`, the outbox worker SHALL
check the value against the declared type of the target field, using the same
type rule that validates a participant's submission. A mismatching entry SHALL
be dropped rather than written, and the drop SHALL be recorded in the row's
`ActionOutcome`.

The delivery itself SHALL still count as succeeded: the remote side did its
work, so failing the row would re-run a side effect that already happened.

Today the writeback is a raw `jsonb_set` with no validation, while a
participant submission goes through the full type/options/constraints check. A
handler returning `"5"` for a `number` field therefore writes a string into
`data` permanently; a guard reading that field was type-checked as a number at
publish, so at runtime the comparison raises, guard totality turns it into
`false`, and the instance parks on its wait-state with no fault event and no
dead-letter — the silent, per-instance, parked-forever failure that
publish-time validation exists to prevent.

#### Scenario: A type-mismatched writeback is dropped, not written

- **WHEN** a handler returns a value whose type does not match the declared
  type of its `Action.output` target field
- **THEN** `instance.data` is unchanged for that field, and the row's
  `ActionOutcome` records the dropped target

#### Scenario: The delivery still succeeds

- **WHEN** a delivery's only defect is a type-mismatched writeback entry
- **THEN** the row is marked delivered rather than retried, since retrying
  would repeat the side effect the handler already performed

#### Scenario: A conforming writeback is unaffected

- **WHEN** every patch value matches its target field's declared type
- **THEN** the writeback proceeds exactly as it does today, including the
  running-instance and field-version predicates

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
