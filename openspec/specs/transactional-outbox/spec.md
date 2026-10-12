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

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow sentence-length long-words passive-voice -->

A delivery that fails SHALL increment the row's attempt count and be rescheduled
after a backoff delay rather than retried immediately. After a bounded maximum
number of attempts the row SHALL move to a terminal dead-letter state and stop
being retried, so a permanently failing action cannot loop forever.

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow sentence-length trailing-negation long-words passive-voice em-dash run-ons filler synonym-rotation -->

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

A claim that starts no delivery refunds the `attempts` value it raised (see the
deadline requirement).

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow sentence-length long-words filler passive-voice -->

The maximum attempt count and the backoff delay computation SHALL come from
the failing action's own declared `retry` policy (`maxAttempts`, `backoff`, `baseDelay`)
when present, overriding the engine's default for that action
alone. An action with no declared `retry` policy SHALL use the engine's
default maximum attempts and default exponential backoff, unchanged from
before per-action policies existed. `backoff` SHALL select the delay
strategy: `"none"` computes a zero delay (retry on the very next drain
once due), `"fixed"` computes a constant delay equal to `baseDelay` (or
the engine default if `baseDelay` is omitted), and `"exponential"`
computes `baseDelay * 2^(attempts - 1)` (or the engine default base,
likewise), capped at the larger of that base and one hour. `maxAttempts` and `backoff`
are independent: `backoff: "none"` still allows up to `maxAttempts`
retries, each with no delay.

A declared `maxAttempts` SHALL be an integer from 1 to 20. A definition that
declares any other value SHALL fail to parse. The bound and the cap together
keep every retry schedule finite. Without them, an exponential schedule waits
years between attempts. The row then never dead-letters in practice.

<!-- Why: legacy scenario copied from the live spec; the heading and body keep their wording. -->
<!-- antislop: allow passive-voice long-words run-ons -->

#### Scenario: A transient failure is retried later
- **WHEN** delivery of a pending row fails and its attempt count is below the maximum
- **THEN** its attempts increment, it is rescheduled after a backoff delay, and it is not reclaimed before that delay elapses

<!-- Why: legacy scenario copied from the live spec; the heading and body keep their wording. -->
<!-- antislop: allow long-words -->

#### Scenario: A row exhausts its attempts and dead-letters
- **WHEN** delivery keeps failing until the attempt count reaches the maximum
- **THEN** the row moves to a terminal dead-letter state and is no longer claimed for delivery

<!-- Why: a MODIFIED scenario heading must match the live spec verbatim. -->
<!-- antislop: allow long-words -->

#### Scenario: An abandoned delivery still costs an attempt

<!-- Why: legacy scenario body copied from the live spec; it keeps its wording. -->
<!-- antislop: allow sentence-length passive-voice em-dash long-words -->

- **WHEN** a row is claimed and its delivery never reaches the marking
  transaction — the worker died, or the lease expired and a peer reclaimed the
  row
- **THEN** the stored attempt count is one higher than before the claim, so
  repeated abandonment reaches the maximum and dead-letters

#### Scenario: An action's declared retry policy overrides the default maximum attempts

<!-- Why: legacy scenario body copied from the live spec; it keeps its wording. -->
<!-- antislop: allow trailing-negation long-words -->

- **WHEN** a failing action declares `retry.maxAttempts` lower than the
  engine's default
- **THEN** the row dead-letters once its attempt count reaches that
  action's declared maximum, not the engine's default

#### Scenario: An action's declared retry policy overrides the default backoff delay

<!-- Why: legacy scenario body copied from the live spec; it keeps its wording. -->
<!-- antislop: allow trailing-negation passive-voice -->

- **WHEN** a failing action declares `retry.backoff: "fixed"` with a `retry.baseDelay`
- **THEN** each retry after a failure is rescheduled after exactly that
  fixed delay, not the engine's default exponential schedule

<!-- Why: a MODIFIED scenario heading must match the live spec verbatim. -->
<!-- antislop: allow passive-voice -->

#### Scenario: An action with no declared retry policy is unaffected

<!-- Why: legacy scenario body copied from the live spec; it keeps its wording. -->
<!-- antislop: allow sentence-length passive-voice -->

- **WHEN** a failing action declares no `retry` field
- **THEN** its maximum attempts and backoff delay computation are exactly
  the engine's defaults, identical to behavior before per-action retry
  policies were honored

#### Scenario: The exponential delay stops growing at one hour

- **WHEN** an action declares `retry.maxAttempts` of 20 and
  `retry.backoff: "exponential"` with a `retry.baseDelay` of one second, and
  its row fails when `attempts` is 19
- **THEN** the engine reschedules the row one hour later, where an uncapped delay would reach `2^18` seconds

#### Scenario: A base delay above the cap stays

- **WHEN** an action declares `retry.maxAttempts` of 5 and
  `retry.backoff: "exponential"` with a `retry.baseDelay` of two hours, and
  its row fails when `attempts` is 3
- **THEN** the engine reschedules the row two hours later and never earlier than the base

#### Scenario: The parser rejects an out-of-range maximum

- **WHEN** a definition declares `retry.maxAttempts` of 0, 21, or 2.5
- **THEN** the definition fails to parse, and `maxAttempts` of 1 and of 20 parse

### Requirement: Delivery isolates a poison row from the batch

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow sentence-length passive-voice synonym-rotation em-dash -->

Each claimed row SHALL be processed inside its own error boundary, covering the action parse and the
post-handler mark transaction (the CAS to delivered/dead-letter/pending, the writeback, and the `ActionOutcome`
append) as well as the handler run. An unexpected throw from the action parse or the mark
transaction — a corrupt action row, or a transient error applying the writeback — SHALL leave that one row `claimed`
for reclaim after its lease and leave every other claimed row in the pass to be delivered. A
single poison row SHALL NOT abort the pass and strand the rest of the batch until their lease elapses.

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow sentence-length -->

The error boundary SHALL NOT itself mark the failed row, so the recovery is the same one a crashed worker
already relies on (lease reclaim) and no second write races the aborted mark transaction.

#### Scenario: A poison row does not starve its batch

<!-- Why: legacy scenario body copied from the live spec, with one example changed. -->
<!-- antislop: allow sentence-length -->

- **WHEN** a delivery pass claims a batch in which one row's mark transaction throws (for example, a
  writeback whose value contains a NUL character, which the database rejects in jsonb) alongside rows that deliver normally
- **THEN** the normally-delivering rows reach `delivered` in that same pass and the poison row remains
  `claimed` for a later lease-reclaim

<!-- Why: a MODIFIED requirement heading must match the live spec verbatim. -->
<!-- antislop: allow passive-voice -->

### Requirement: Delivery is bounded by a deadline the handler cannot opt out of

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow sentence-length passive-voice em-dash -->

The outbox worker SHALL impose its own deadline on every delivery, derived
from the claim lease, and SHALL NOT rely on a handler-declared timeout being
present. A delivery that exceeds the deadline SHALL be treated as an ordinary
transient failure — backoff, retry, and eventually dead-letter — using the
existing failure branch rather than a new terminal state.

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow run-ons sentence-length em-dash -->

Without this, a target that accepts the connection and never responds hangs
the delivery forever. The poll loop awaits the whole tick before scheduling
the next one, and one worker exists per process, so a single hung delivery
stops **all** action delivery engine-wide, including the engine-internal
subprocess spawn and return rows — every subprocess parent then parks
permanently and every `Action.output` writeback stops. Neither `stop()` nor
lease reclaim recovers it: the former clears a timer that is not pending, and
the only worker that could reclaim the row is the stuck one.

<!-- Why: legacy text copied from the live spec; a MODIFIED requirement keeps its wording. -->
<!-- antislop: allow sentence-length -->

The deadline SHALL be the claim lease, because a delivery still running past
its lease holds a row another worker may already have claimed, so completing
it is unsound regardless.

The lease starts at the claim, which covers a whole batch of rows at once. A
row's deadline SHALL therefore be the lease that remains for that row when its
delivery starts. It SHALL NOT be a fresh lease per row.

A worker SHALL NOT deliver a row whose lease has run out before its delivery
starts. The row SHALL return to `pending`, due at once, with its `attempts`
value restored to the value before the claim. A peer may already hold the row.
A claim that never started a delivery used none of its attempts.

Racing the delivery does not cancel the handler's own work; releasing the
underlying resource is the handler's responsibility (see the
`http-action-handler` capability). All state changes for the row SHALL happen
on the racing path, so an abandoned handler continuation cannot write
anything.

#### Scenario: A hung delivery does not stop the worker

<!-- Why: legacy scenario body copied from the live spec; it keeps its wording. -->
<!-- antislop: allow sentence-length passive-voice -->

- **WHEN** a handler's delivery neither resolves nor rejects
- **THEN** the delivery is abandoned once the deadline elapses, the row is
  marked as a transient failure with backoff, the drain pass completes, and
  the next poll tick is scheduled

#### Scenario: A hung delivery does not stop unrelated actions

<!-- Why: legacy scenario body copied from the live spec; it keeps its wording. -->
<!-- antislop: allow passive-voice -->

- **WHEN** one row's handler hangs and other rows are pending, including
  engine-internal subprocess spawn or return rows
- **THEN** those other rows are delivered on the same or a subsequent pass

#### Scenario: A hung delivery eventually dead-letters

<!-- Why: legacy scenario body copied from the live spec; it keeps its wording. -->
<!-- antislop: allow long-words passive-voice -->

- **WHEN** the same row's handler hangs on every attempt
- **THEN** its attempt count advances on each attempt and the row reaches the
  dead-letter state rather than being retried forever

#### Scenario: A later row in a batch does not get a fresh lease

- **WHEN** a worker claims several rows, and each of the first rows runs
  until its deadline
- **THEN** the worker starts no handler once the lease measured from the claim ends, and every unstarted row returns to `pending`

#### Scenario: The worker abandons a handler that outlives the lease

- **WHEN** a handler starts inside the lease and is still running when the
  lease measured from the claim ends
- **THEN** the worker stops waiting for it at that instant. A peer that
  reclaims the row may run its handler while the first run continues

#### Scenario: A row whose lease ran out before its turn returns unstarted

- **WHEN** a worker reaches a claimed row after the lease measured from the
  claim has elapsed
- **THEN** it does not run the handler. The row returns to `pending`, due at
  once, with its `attempts` value restored to the value before the claim

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

- **WHEN** a caller creates an instance whose initial step enqueues actions
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

### Requirement: A refused host reaches the dead-letter list, and the message names it

The egress allowlist refuses a host an `http.request` action targets. That
dispatch SHALL reach the dead-letter list, and its message SHALL name the
refused host.

An operator who cannot read the host cannot repair the allowlist. The admin
area reads that list through `listOutbox`. The whole path runs server-side, so
the suite SHALL assert it end to end.

#### Scenario: A refused dispatch dead-letters

- **WHEN** an `http.request` action targets a host the allowlist refuses
- **THEN** the outbox row lands in the dead-letter status
- **AND** `listOutbox` returns it under a dead-letter filter

#### Scenario: The message names the host

- **WHEN** an operator reads that row
- **THEN** its message carries the refused host

#### Scenario: A permitted host does not dead-letter

- **WHEN** an `http.request` action targets a host the allowlist permits
- **THEN** the row does not reach the dead-letter list on that account

<!-- "is stamped" below keeps this header parallel with "Each outbox row is
     stamped with the field-version it was enqueued under" above. The two
     requirements describe the same mechanism over two columns, and a reader
     finds them by that shared shape. -->
<!-- antislop: allow passive-voice -->
### Requirement: Each outbox row is stamped with the actor ids in force at enqueue

Every `INSERT INTO outbox` SHALL stamp the new row with the actor ids the
enqueuing instance holds at that moment. Three parts make up the stamp:

- the assignment candidate list
- the id holding the claim, when one holds it
- the id that started the instance

This applies to every enqueue site: instance creation's initial-step spawn, a
transition's general step-entry enqueue, and a timer firing's enqueue. Each of
the three already holds the instance it is committing. The stamp therefore
reads state in hand rather than sending a query.

The stamp SHALL be frozen. An assignment that later resolves differently SHALL
NOT rewrite a row already on the queue. Delivery therefore sees the actors of the
commit that enqueued the action. It does not see the actors of whatever step
the instance has since reached.

Freezing is what makes the value correct. The resolution worker drives
automatic cascades without waiting for the outbox. An instance can therefore
sit two steps on by the time a row drains. A delivery-time read would name the
wrong actors in exactly that case.

A row enqueued before this stamp existed SHALL carry no actor ids. Nothing
backfills them. No published body could name an actor recipient before this
stamp existed, so no such row has a consumer.

#### Scenario: A row enqueued at instance creation carries the actor ids

- **WHEN** a caller creates an instance whose initial step enqueues actions
- **THEN** each enqueued row carries the instance's candidate list, claimant
  and starter as of that creation

#### Scenario: A row enqueued by a transition carries the actor ids

- **WHEN** a transition commits and enqueues trigger actions
- **THEN** each enqueued row carries the instance's candidate list, claimant
  and starter as of that commit

#### Scenario: A row enqueued by a timer fire carries the actor ids

- **WHEN** a timer fires and enqueues its actions
- **THEN** each enqueued row carries the instance's candidate list, claimant
  and starter as of that fire

#### Scenario: A later assignment update leaves an enqueued row alone

- **WHEN** a commit enqueues a row for a step whose candidate list holds one
  actor
- **AND** the instance then transitions to a step resolving another candidate
- **THEN** the pending row still carries the first candidate

#### Scenario: Delivery hands the stamped ids to the handler

- **WHEN** a worker claims and delivers a stamped row
- **THEN** the handler receives the ids the row carries

#### Scenario: A row predating the stamp still delivers

- **WHEN** a worker claims and delivers a row from before the stamp existed
- **THEN** the delivery proceeds, and the handler receives no actor ids

### Requirement: The marking transaction acts only on the claim it made

Every statement in the marking transaction that changes an outbox row SHALL
match the `claimed` status. It SHALL also match the `attempts` value that the
worker's own claim produced. A worker whose lease expired and whose row a peer
reclaimed SHALL change nothing, whichever branch it took.

#### Scenario: A late worker cannot reset a peer's claim

- **WHEN** worker A's delivery fails after worker B reclaimed the row
- **THEN** A's transient-failure write matches no row, and B's claim keeps
  its status, its `attempts` value and its lease

#### Scenario: A late worker cannot dead-letter a delivered row

- **WHEN** worker A reaches its maximum after worker B reclaimed the row
  and delivered it
- **THEN** the row stays `delivered`, and B's writeback and outcome stand

### Requirement: A row abandoned past its maximum dead-letters without another run

A row claimed with an `attempts` value above its action's maximum SHALL move
to the dead-letter state. The handler SHALL NOT run for it again. Its
`last_error` SHALL read `abandoned after N attempts`, with N the maximum. The
handler SHALL run at most the maximum number of times. So a row whose marking
transaction fails on every run still reaches the dead letters.

#### Scenario: A row whose marking transaction always throws dead-letters

- **WHEN** an action's handler succeeds but the database rejects the writeback
  of its result on every run
- **THEN** after the maximum number of runs the next claim moves the row to
  `dead-letter` with `last_error` of `abandoned after N attempts`, and the
  handler does not run again

#### Scenario: The instance record carries the dead-letter

- **WHEN** a row dead-letters for abandonment
- **THEN** the instance record carries an `ActionOutcome` of `dead-letter`
  for the action, and the engine logs the dead-letter

### Requirement: A field id cannot alter a writeback path

The writeback of an `Action.output` entry SHALL address its target field as one
path element, whatever characters the field id holds. A field id with a comma,
a brace or a quote SHALL NOT select another path.

#### Scenario: A field id with array-literal characters writes under its own key

- **WHEN** a writeback targets a field id that holds `,` or `}`
- **THEN** the value lands under `data` at exactly that id, and no other key
  of `data` changes
