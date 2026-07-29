## ADDED Requirements

### Requirement: Every request is bounded by a timeout, across the response body read

`http.request` SHALL apply a timeout to every request, using the action's
declared `timeout` when present and an engine-supplied default otherwise. The
default SHALL be a named constant set well below the outbox claim lease, so
the handler's own bound fires before the worker's deadline and produces a
specific abort rather than a generic deadline failure.

The abort SHALL stay armed until the response **body** has been consumed.
Clearing it when the response headers arrive leaves the handler able to hang
on the body read, which is the same unbounded wait the timeout exists to
prevent.

The response body SHALL be size-bounded: a response declaring a
`content-length` above the limit SHALL be refused without being read, and a
response without one SHALL be read against a byte budget and refused when it
is exceeded. An over-size response SHALL be classified as a **permanent**
failure, since a target that returns more than the limit will do so again.
The body is persisted into `instance.data` via `Action.output`, so an
unbounded read is an unbounded write.

#### Scenario: A request with no declared timeout is still bounded

- **WHEN** an action declares no `timeout` and its target never responds
- **THEN** the request is aborted after the default timeout and the delivery
  fails as a transient failure

#### Scenario: A hang during the body read is aborted

- **WHEN** a target sends response headers and then stalls without completing
  the body
- **THEN** the abort still fires, because the timeout was not cleared when the
  headers arrived

#### Scenario: A declared timeout still wins

- **WHEN** an action declares its own `timeout`
- **THEN** that value is used instead of the default, unchanged from today

#### Scenario: An over-size response is refused permanently

- **WHEN** a target's response exceeds the response-size limit, by declared
  `content-length` or by bytes read
- **THEN** the delivery fails permanently and the row dead-letters without
  further retries, and nothing from that response is written into
  `instance.data`
