## MODIFIED Requirements

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
delivery census. A claim that starts no delivery refunds its attempt (see the
deadline requirement).

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
likewise), capped at the larger of that base and one hour. `maxAttempts` and
`backoff` are independent: `backoff: "none"` still allows up to `maxAttempts`
retries, each with no delay.

A declared `maxAttempts` SHALL be an integer from 1 to 20. A definition that
declares any other value SHALL fail to parse. The bound and the cap together
keep every retry schedule finite: without them an exponential schedule waits
years between attempts, and the row never dead-letters in practice.

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

#### Scenario: The exponential delay stops growing at one hour

- **WHEN** an action declares `retry.maxAttempts` of 20 and
  `retry.backoff: "exponential"` with a `retry.baseDelay` of one second, and
  its row fails on attempt 19
- **THEN** the row is rescheduled one hour later, not `2^18` seconds later

#### Scenario: A base delay above the cap is kept

- **WHEN** an action declares `retry.maxAttempts` of 5 and
  `retry.backoff: "exponential"` with a `retry.baseDelay` of two hours, and
  its row fails on attempt 3
- **THEN** the row is rescheduled two hours later, and no earlier than the base

#### Scenario: An out-of-range maximum is rejected

- **WHEN** a definition declares `retry.maxAttempts` of 0, 21, or 2.5
- **THEN** the definition fails to parse, and `maxAttempts` of 1 and of 20 parse

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
it is unsound regardless. The lease starts at the claim, which covers a whole
batch of rows at once. A row's deadline SHALL therefore be the lease that
remains for that row when its delivery starts, not a fresh lease per row.

A row whose lease has run out before its delivery starts SHALL NOT be
delivered. It SHALL return to `pending`, due at once, with the attempt its
claim cost refunded. A peer may already hold it, and the claim that never
started a delivery used none of its attempts.

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

#### Scenario: A later row in a batch does not get a fresh lease

- **WHEN** a worker claims several rows, and each of the first rows runs
  until its deadline
- **THEN** the worker starts no handler once the lease measured from the
  claim has elapsed, and every row it did not start returns to `pending`

#### Scenario: A handler that outlives the lease is abandoned at the lease end

- **WHEN** a handler starts inside the lease and is still running when the
  lease measured from the claim ends
- **THEN** the worker stops waiting for it at that instant, and a peer that
  reclaims the row may run its handler while the first run continues

#### Scenario: A row whose lease ran out before its turn is released

- **WHEN** a worker reaches a claimed row after the lease measured from the
  claim has elapsed
- **THEN** it does not run the handler, the row returns to `pending` and is
  due at once, and its attempt count equals the count before the claim

## ADDED Requirements

### Requirement: The marking transaction acts only on the claim it made

Each statement of the marking transaction that changes an outbox row SHALL
match both the `claimed` status and the attempt count that the worker's own
claim produced. A worker whose lease expired and whose row a peer reclaimed
SHALL change nothing, whichever branch it took.

#### Scenario: A late worker cannot reset a peer's claim

- **WHEN** worker A's delivery fails after worker B reclaimed the row
- **THEN** A's transient-failure update matches no row, and B's claim keeps
  its status, its attempt count and its lease

#### Scenario: A late worker cannot dead-letter a delivered row

- **WHEN** worker A reaches its attempt cap after worker B reclaimed the row
  and delivered it
- **THEN** the row stays `delivered`, and B's writeback and outcome stand

### Requirement: A row abandoned past its maximum dead-letters without another run

A row that a worker claims with an attempt count above its action's maximum
SHALL move to the dead-letter state without the handler running again. Its
`last_error` SHALL read `abandoned after N attempts`, with N the maximum. The
handler SHALL run at most the maximum number of times, so a row whose marking
transaction fails on every run still reaches the dead letters.

#### Scenario: A row whose marking transaction always throws dead-letters

- **WHEN** an action's handler succeeds but the writeback of its result is
  rejected by the database on every run
- **THEN** after the maximum number of runs the next claim moves the row to
  `dead-letter` with `last_error` of `abandoned after N attempts`, and the
  handler does not run again

#### Scenario: The dead-letter is recorded in the instance record

- **WHEN** a row dead-letters for abandonment
- **THEN** the instance record carries an `ActionOutcome` of `dead-letter`
  for the action, and the engine logs the dead-letter

### Requirement: A writeback path cannot be altered by a field id

The writeback of an `Action.output` entry SHALL address its target field as one
path element, whatever characters the field id holds. A field id with a comma,
a brace or a quote SHALL NOT select another path.

#### Scenario: A field id with array-literal characters writes under its own key

- **WHEN** a writeback targets a field id that holds `,` or `}`
- **THEN** the value lands under `data` at exactly that id, and no other key
  of `data` changes
