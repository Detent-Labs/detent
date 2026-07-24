## ADDED Requirements

### Requirement: A generic HTTP handler is registered by default

The engine SHALL ship a handler registered under action type `http.request`,
resolvable through the existing handler `Registry` seam. `startEngine`'s
`registry` parameter SHALL default to a registry that includes this handler,
so a deployment calling `startEngine()` with no explicit registry can author
`http.request` actions without additional wiring. A caller that supplies its
own explicit `registry` argument is unaffected by this default.

#### Scenario: startEngine with no explicit registry resolves http.request

- **WHEN** `startEngine` is called without a `registry` argument
- **THEN** an authored action of type `http.request` resolves to a handler
  instead of dead-lettering as unregistered

#### Scenario: An explicit registry argument is unaffected

- **WHEN** `startEngine` is called with a caller-supplied `registry` that does
  not include `http.request`
- **THEN** an authored action of type `http.request` dead-letters as
  unregistered, exactly as it would have before this change

### Requirement: The handler's config is validated at publish time

The handler SHALL declare a `configSchema` requiring `url` (a valid URL
string), an optional `method` (one of `GET`, `POST`, `PUT`, `PATCH`,
`DELETE`, defaulting to `POST`), optional `headers` (a string-to-string
record), and an optional `body` (arbitrary JSON). This schema SHALL be
checked by the existing authoring-time registry validation, so a malformed
`http.request` config is a publish error, never a runtime dead-letter. The
schema SHALL additionally reject two further shapes, both for the same
reason — each would otherwise fail at runtime in a way that is
misclassified as a retryable transient error rather than the deterministic
configuration error it actually is:

- A `method` of `GET` combined with a present `body` (the underlying
  `Request` construction rejects this combination unconditionally).
- A `headers` entry whose key matches `Idempotency-Key`, case-insensitively
  (reserved — see "Every request carries a deduplication signal" below).

#### Scenario: A well-formed config passes publish validation

- **WHEN** a process is published with an `http.request` action whose config
  supplies a valid `url` and, if present, a valid `method`/`headers`/`body`
- **THEN** publish validation raises no issue for that action

#### Scenario: A missing url is rejected at publish

- **WHEN** a process is published with an `http.request` action whose config
  omits `url`
- **THEN** publish is rejected with a located config-validation issue for
  that action, and the process is never persisted with that action live

#### Scenario: A GET request with a body is rejected at publish

- **WHEN** a process is published with an `http.request` action whose config
  sets `method: "GET"` and a non-empty `body`
- **THEN** publish is rejected with a located config-validation issue for
  that action

#### Scenario: An authored Idempotency-Key header is rejected at publish

- **WHEN** a process is published with an `http.request` action whose config
  `headers` includes a key equal to `Idempotency-Key`, in any letter casing
- **THEN** publish is rejected with a located config-validation issue for
  that action

### Requirement: The handler builds its request from static config alone

The handler SHALL build its outgoing request using only the fields present in
`action.config` (`url`, `method`, `headers`, `body`), plus the two
engine-computed headers described below — never reading instance `data`,
never performing a database lookup by `instanceId`. A `body`, when present,
SHALL be JSON-serialized onto the request unchanged.

#### Scenario: Request fields arrive at the target unchanged

- **WHEN** an `http.request` action's config specifies a `method`, one or
  more `headers`, and a `body`
- **THEN** the request the handler sends carries that exact method, those
  headers, and that body JSON-serialized, with no instance data merged in

### Requirement: Every request carries a deduplication signal

The handler SHALL set an `Idempotency-Key` request header to `ctx.idempotencyKey`
on every delivery attempt, including a retried delivery of the same outbox
row. This value SHALL be identical across every attempt of the same
delivery (it does not vary with the attempt count), fulfilling the handler
registry's existing requirement that a handler invoked more than once for
the same row must dedupe on the row's idempotency key.

#### Scenario: A request carries the delivery's idempotency key

- **WHEN** the handler sends a request for an `http.request` action
- **THEN** the request includes an `Idempotency-Key` header equal to
  `ctx.idempotencyKey`

#### Scenario: A retried delivery sends the same key as the original

- **WHEN** an outbox row is redelivered after a transient failure (e.g. a
  `5xx` response) and the handler is invoked again for that row
- **THEN** the `Idempotency-Key` header on the retried request is identical
  to the one sent on the first attempt

### Requirement: A JSON body defaults to a JSON content type

When `body` is present and `config.headers` does not already declare a
`Content-Type` header (matched case-insensitively), the handler SHALL set
`Content-Type: application/json` on the request. An author-supplied
`Content-Type` SHALL always be sent as authored, never overridden.

#### Scenario: A body with no declared Content-Type defaults to JSON

- **WHEN** an `http.request` action's config sets a `body` and `headers` does
  not include a `Content-Type` entry
- **THEN** the request the handler sends carries `Content-Type:
  application/json`

#### Scenario: An authored Content-Type is respected

- **WHEN** an `http.request` action's config sets a `body` and `headers`
  includes an explicit `Content-Type` (e.g.
  `application/x-www-form-urlencoded`)
- **THEN** the request the handler sends carries that authored `Content-Type`
  unchanged

### Requirement: A successful response is classified into a structured result

The handler SHALL treat any `2xx` response as success and return a structured
result carrying the response's status, headers, and body. The body SHALL be
JSON-parsed when the response's `Content-Type` header includes
`application/json`, and returned as raw text otherwise. This result becomes
the `result` namespace available to the action's `Action.output` mapping,
unchanged from the existing handler-result contract.

#### Scenario: A JSON response body is parsed

- **WHEN** the target responds `2xx` with a `Content-Type` of
  `application/json` and a JSON body
- **THEN** the handler's result carries the parsed JSON value as `body`

#### Scenario: A non-JSON response body is returned as text

- **WHEN** the target responds `2xx` with a `Content-Type` of `text/plain`
- **THEN** the handler's result carries the raw response text as `body`

### Requirement: Failures are classified as permanent or transient

The handler SHALL classify every non-success outcome as either permanent
(immediate dead-letter, no retry) or transient (existing outbox retry and
backoff, dead-lettering only after exhausting `MAX_ATTEMPTS`):

- A `4xx` response other than `429` SHALL be permanent.
- A `429` response SHALL be transient.
- A `5xx` response SHALL be transient.
- A network error raised by the underlying request SHALL be transient.
- A request that is aborted for exceeding its bound (see the timeout
  requirement below) SHALL be transient.

#### Scenario: A 404 response is a permanent failure

- **WHEN** the target responds `404`
- **THEN** the handler's action delivery dead-letters immediately, without
  consuming a transient retry attempt

#### Scenario: A 429 response is a transient failure

- **WHEN** the target responds `429`
- **THEN** the handler's action delivery is treated as transient and is
  retried through the existing outbox retry/backoff before dead-lettering
  only if attempts are exhausted

#### Scenario: A 5xx response is a transient failure

- **WHEN** the target responds `500`
- **THEN** the handler's action delivery is treated as transient, identical
  in kind to a `429` response

#### Scenario: A network failure is a transient failure

- **WHEN** the underlying request fails before receiving a response (e.g. a
  connection error)
- **THEN** the handler's action delivery is treated as transient

### Requirement: The request is bounded by the action's declared timeout

When the action declares a `timeout`, the handler SHALL bound its own
outgoing request to that duration and treat an exceeded bound as a transient
failure. When no `timeout` is declared, the handler SHALL impose no bound of
its own beyond the underlying request's natural completion.

#### Scenario: A response arriving after the timeout aborts the request

- **WHEN** an `http.request` action declares a `timeout` and the target does
  not respond within that duration
- **THEN** the handler aborts the request and treats the outcome as a
  transient failure

#### Scenario: No timeout declared imposes no handler-level bound

- **WHEN** an `http.request` action declares no `timeout`
- **THEN** the handler does not abort the request regardless of how long the
  target takes to respond
