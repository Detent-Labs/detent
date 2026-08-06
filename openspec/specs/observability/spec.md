<!-- antislop: allow-file sentence-length run-ons passive-voice synonym-rotation -->
<!-- This file follows the repo's established OpenSpec WHEN/THEN scenario
     convention (see openspec/specs/transactional-outbox/spec.md and every
     other spec.md in this repo), which produces passive THEN clauses and
     multi-clause WHEN conditions by construction: the actor is already
     named in the parent Requirement's SHALL sentence, so restating it in
     every scenario reads worse, not better. "operator" (the human who
     benefits) and "client" (the HTTP caller) name distinct actors, not
     one restated concept; the same holds for "error" (the `lastError`
     field's value) versus "failure" (the general condition the endpoint
     tolerates). Per the antislop-targeted-allow-not-file-all memory, this
     is the documented exception: a document written end to end in the
     established house style may use a named, non-"all" allow-file. -->

# observability

## Purpose

Gives an operator two signals the engine does not expose today: structured
log lines for events that currently need a database or admin-UI lookup
to notice, and a scrape-able metrics endpoint for outbox backlog, timer
lag, and faulted-instance count.
## Requirements
### Requirement: Structured log output
The system SHALL emit one JSON line per log call, with fields `ts`
(ISO-8601 timestamp), `level`, `msg`, and any caller-supplied context
fields merged in.

#### Scenario: Info-level call emits a JSON line
- **WHEN** code calls the info-level logging function with a message and
  a context object
- **THEN** one line is written to stdout, parseable as JSON, containing
  `ts`, `level: "info"`, `msg`, and every key from the context object

#### Scenario: Error-level call writes to stderr
- **WHEN** code calls the error-level logging function
- **THEN** the JSON line is written to stderr, not stdout

### Requirement: Log-level gating
The system SHALL gate log emission by a process-wide minimum level, read
from the `LOG_LEVEL` environment variable at startup, defaulting to
`info` when unset. The ordering is `debug` < `info` < `warn` < `error`.

#### Scenario: A call below the threshold is suppressed
- **WHEN** `LOG_LEVEL` is `warn` and code calls the info-level logging
  function
- **THEN** no line is written to stdout or stderr

#### Scenario: A call at or above the threshold is emitted
- **WHEN** `LOG_LEVEL` is `warn` and code calls the warn-level or
  error-level logging function
- **THEN** the corresponding line is written

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

### Requirement: Metrics endpoint
The system SHALL expose `GET /metrics` returning
Prometheus text-exposition format computed fresh from the database on
every request. The endpoint SHALL NOT throw; a query failure SHALL
still produce a valid HTTP response.

The endpoint SHALL be conditional on `METRICS_TOKEN`. When that variable
is absent or empty, the server SHALL NOT register the route. A scrape then
meets the wrapper's handling for an unmatched `GET`. That handling offers the
path to static asset serving, and answers the JSON 404 envelope when static
asset serving declines. When the variable holds a value, a scrape SHALL carry
it as a bearer token in the `Authorization` header.

The server SHALL compare the two in constant time.
A missing token, or one that does not match, SHALL yield `401`. The
handler SHALL run no query on that path.

The liveness and readiness probes stay unauthenticated. A probe answers
from process state or from one cheap query. A scrape instead runs three
aggregates over live tables. An open scrape route gives an outsider both
the load and the health of the deployment. It also gives them a way to put
that load on the database at will.

#### Scenario: A scrape with the right token returns valid Prometheus text
- **WHEN** `METRICS_TOKEN` holds a value and a client sends `GET /metrics`
  with that value as a bearer token
- **THEN** the response has a 200 status and `Content-Type: text/plain;
  version=0.0.4; charset=utf-8`. Its body holds zero or more well-formed
  metric lines

#### Scenario: A scrape without a token runs no query
- **WHEN** `METRICS_TOKEN` holds a value and a client sends `GET /metrics`
  with no `Authorization` header, or with a value that does not match
- **THEN** the response has a 401 status and no metric line, and the
  handler runs none of its queries

#### Scenario: An unset token leaves the route unregistered
- **WHEN** `METRICS_TOKEN` is absent or empty and a client sends
  `GET /metrics`
- **THEN** the response holds no metric line. A scrape gets the JSON 404
  envelope. A navigation request gets the shell, as it does for any
  unmatched path

#### Scenario: A database failure reports 503, not a crash or a false zero
- **WHEN** a client sends an authorized `GET /metrics` while every
  underlying query fails
- **THEN** the response has a 503 status and the same `Content-Type`,
  with no gauge line claiming a healthy zero

<!-- The three scenario names below are copied verbatim from the live
     observability spec, whose own allow-file directive already covers
     their passive voice. Renaming them here would make the delta and its
     destination disagree for a stylistic reason. -->
<!-- antislop: allow passive-voice -->
#### Scenario: Outbox backlog is reported per status
- **WHEN** the outbox holds rows in `pending` and `dead-letter` status
  but none in `claimed`, and the scrape carries the right token
- **THEN** the response contains a `workflow_outbox_backlog` line for
  `pending` and one for `dead-letter`, and none for `claimed`

<!-- antislop: allow passive-voice -->
#### Scenario: Timer overdue count and lag are reported
- **WHEN** one or more running instances have a `next_timer_at` in the
  past, and the scrape carries the right token
- **THEN** the response contains `workflow_timer_overdue_count` equal to
  that count, and `workflow_timer_lag_seconds` equal to the number of
  seconds since the oldest overdue `next_timer_at`

#### Scenario: No overdue timers reports zero lag
- **WHEN** no running instance has an overdue `next_timer_at`, and the
  scrape carries the right token
- **THEN** `workflow_timer_overdue_count` is `0` and
  `workflow_timer_lag_seconds` is `0`

<!-- antislop: allow passive-voice -->
#### Scenario: Faulted-instance count is reported
- **WHEN** one or more instances hold `faulted` status, and the scrape
  carries the right token
- **THEN** the response contains `workflow_instances_faulted` equal to
  that count
