## MODIFIED Requirements

### Requirement: Failed delivery retries with backoff and dead-letters

A delivery that fails SHALL increment the row's attempt count and be rescheduled
after a backoff delay rather than retried immediately. After a bounded maximum
number of attempts the row SHALL move to a terminal dead-letter state and stop
being retried, so a permanently failing action cannot loop forever.

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
