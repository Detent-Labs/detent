## ADDED Requirements

### Requirement: The timer scan isolates a poison instance from the batch

Each instance in a scheduler pass SHALL be processed inside its own error boundary, covering the row body
parse and the body resolution as well as `fireTimer`. A parse failure, a resolver miss, or a resolver
that throws SHALL skip that one instance and leave every other due instance in the pass to be processed.
A single poison instance SHALL NOT abort the pass.

The scan is ordered by `next_timer_at`, so an unprocessable instance with the earliest due time would
otherwise sit at the head of every pass and re-throw indefinitely, blocking every instance behind it. A
skipped instance leaves its `next_timer_at` due, so a later pass retries it — consistent with how a lost
firing race is already handled.

#### Scenario: A poison instance at the head of the scan does not block the rest

- **WHEN** a scheduler pass selects a batch containing one instance whose stored body cannot be parsed
  (or whose resolver throws), ordered ahead of instances with due timers
- **THEN** the due timers on the other instances fire in that same pass
