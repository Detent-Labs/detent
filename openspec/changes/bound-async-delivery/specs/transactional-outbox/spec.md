## ADDED Requirements

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
