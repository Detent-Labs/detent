<!-- The MODIFIED block below copies the live observability requirement,
     apart from the two bullets and the three scenarios this change adds. That
     file carries its own allow-file directive, and a rewrite here would
     make the delta and its destination disagree. This directive dies with
     the change, at archive time. -->
<!-- antislop: allow-file passive-voice sentence-length -->

## MODIFIED Requirements

### Requirement: Operational events are logged
The system SHALL emit an error-level or warn-level log line at each of
the following points, carrying the same identifying data as the
runtime record it accompanies:
- an outbox row transitioning to `dead-letter` status
- an instance transitioning to `faulted` status
- an instance skipped during a migration run (`migration.skipped`)
- a background worker tick that throws, carrying the worker's name
- a work item a background worker's drain skips because handling that item
  threw, carrying the item's identifier

No error boundary in a background worker SHALL discard an error without a
line. A worker that throws on every tick SHALL be visible from the log
alone, without a reader comparing two metric samples. A worker whose every
item fails SHALL be visible the same way. A per-item boundary catches the
error before the tick boundary sees it, so the tick line alone does not
cover that case.

#### Scenario: A dead-lettered outbox row is logged
- **WHEN** `drainOutbox` moves a row to `dead-letter` status after
  exhausting retries
- **THEN** an error-level log line is emitted carrying the instance id,
  action id, action type, attempts, and last error

#### Scenario: A faulted instance is logged
- **WHEN** an automatic cascade re-enters a step it already entered and
  the instance is parked `faulted`
- **THEN** an error-level log line is emitted carrying the instance id,
  step id, and reason

#### Scenario: A skipped migration is logged
- **WHEN** `migrateInstances` skips an instance and records a
  `migration.skipped` event
- **THEN** a warn-level log line is emitted carrying the instance id and
  skip reason

#### Scenario: A failing worker tick is logged
- **WHEN** a background worker's tick throws, for any reason
- **THEN** an error-level log line is emitted carrying that worker's name
  and the error's message, and the next tick is still scheduled

#### Scenario: A skipped work item is logged
- **WHEN** a background worker's drain reaches its per-item boundary
  because handling one item threw
- **THEN** an error-level log line is emitted carrying that item's
  identifier and the error's message, and the drain continues with the rest
  of the batch

#### Scenario: A lost concurrency race logs below error level
- **WHEN** a per-item boundary catches a `ConcurrencyConflict`, the
  designed outcome of two workers reaching one instance together
- **THEN** the line is emitted at debug level, and no error-level line is
  emitted for it
