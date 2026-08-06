## MODIFIED Requirements

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
