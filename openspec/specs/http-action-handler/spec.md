# http-action-handler

## Purpose

A generic, vendor-neutral `http.request` action handler, registered by
default against the engine's handler registry (see `action-handlers`,
`action-registry-validation`): calls an authored URL and writes the response
back via `Action.output`. `config` is static, publish-validated JSON — no
instance `data`, no DB lookup — with a deterministic deduplication signal
(`Idempotency-Key`) emitted on every request, and a permanent-vs-transient
failure classification tuned to real external HTTP semantics rather than the
generic "unregistered type" case the handler seam otherwise covers.
## Requirements
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

<!-- antislop: allow passive-voice -->
### Requirement: The handler's config is validated at publish time

The handler SHALL declare a `configSchema` with four keys. The key `url` SHALL
appear and hold a valid URL string. The key `method` is optional, one of
`GET`, `POST`, `PUT`, `PATCH` or `DELETE`, and defaults to `POST`. The key
`headers` is optional and holds a record. Each value is a string or an
environment reference, as "A header value may reference an environment
variable" below states. The key `body` is optional and holds arbitrary JSON.

The existing authoring-time registry validation SHALL check this schema. A
malformed `http.request` config then fails at publish and never dead-letters
at runtime. The schema SHALL also reject two further shapes. Each would
otherwise fail at runtime and retry, though no retry can succeed:

- A `method` of `GET` combined with a present `body`. The underlying
  `Request` construction rejects this combination unconditionally.
- A `headers` entry whose key matches `Idempotency-Key`, case-insensitively.
  The engine reserves that key, see "Every request carries a deduplication
  signal" below.

#### Scenario: A well-formed config passes publish validation

- **WHEN** an author publishes a process with an `http.request` action whose config
  supplies a valid `url` and, if present, a valid `method`/`headers`/`body`
- **THEN** publish validation raises no issue for that action

<!-- antislop: allow passive-voice -->
#### Scenario: A missing url is rejected at publish

- **WHEN** an author publishes a process with an `http.request` action whose config
  omits `url`
- **THEN** publish rejects it with a located config-validation issue for that
  action
- **THEN** the process never persists with that action live

<!-- antislop: allow passive-voice -->
#### Scenario: A GET request with a body is rejected at publish

- **WHEN** an author publishes a process with an `http.request` action whose config
  sets `method: "GET"` and a non-empty `body`
- **THEN** publish rejects it with a located config-validation issue for that
  action

<!-- antislop: allow passive-voice -->
#### Scenario: An authored Idempotency-Key header is rejected at publish

- **WHEN** an author publishes a process with an `http.request` action whose config
  `headers` includes a key equal to `Idempotency-Key`, in any letter casing
- **THEN** publish rejects it with a located config-validation issue for that
  action

### Requirement: The handler builds its request from static config alone

The handler SHALL build its outgoing request from the fields in
`action.config` (`url`, `method`, `headers`, `body`), the two engine-computed
headers described below, and the value of each environment reference in
`headers`. It SHALL NOT read instance `data`. It SHALL NOT look up a database
row by `instanceId`. The handler SHALL JSON-serialize a `body`, when present,
onto the request unchanged.

#### Scenario: Request fields arrive at the target unchanged

- **WHEN** an `http.request` action's config specifies a `method`, one or
  more `headers`, and a `body`
- **THEN** the request carries that exact method, those headers and that body
  as JSON, with no instance data merged in

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

- A target the egress policy refuses SHALL be permanent.
- A `3xx` response SHALL be permanent, since the handler follows no redirect.
- A `4xx` response other than `429` SHALL be permanent.
- A `429` response SHALL be transient.
- A `5xx` response SHALL be transient.
- A network error raised by the underlying request SHALL be transient.
- A request that is aborted for exceeding its bound (see the timeout
  requirement below) SHALL be transient.

An egress refusal is permanent because a retry meets the same policy. Only an
operator makes that target reachable, by changing the environment. The
restart that follows re-reads the policy.

#### Scenario: A refused target is a permanent failure

- **WHEN** the egress policy refuses the target's host or scheme
- **THEN** the handler's action delivery dead-letters immediately, without
  consuming one of the transient retries

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

#### Scenario: A response arriving after the timeout aborts the request

- **WHEN** an `http.request` action declares a `timeout` and the target does
  not respond within that duration
- **THEN** the handler aborts the request and treats the outcome as a
  transient failure

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

### Requirement: The deployment, not the author, decides what the handler may reach

The handler SHALL check every target against a deployment-held egress policy
before it opens a connection. The policy lives in the environment, beside
`DATABASE_URL` and the `SMTP_*` settings. No part of it lives in a process
body.

The policy decides whether the handler sends the request. It changes no field
of that request. The requirement that the handler builds its request from
static config alone stays true.

The policy holds two rules.

First, the target host SHALL appear in `HTTP_ACTION_ALLOWED_HOSTS`, a
comma-separated list. An entry names a host, which is a hostname with an
optional port. The match is exact, and it covers no subdomain the list does
not name. An unset or empty variable denies every target, the way an unset
`CORS_ALLOWED_ORIGINS` permits no origin.

The handler SHALL strip the space around an entry and SHALL compare letters
without regard to case. A URL's host arrives lower-case and without a default
port. A list the operator typed with a space after each comma still matches
what the URL carries. So does a list the operator typed with a capital letter.

Second, the target scheme SHALL be `https:`. A deployment that sets
`HTTP_ACTION_ALLOW_INSECURE` to `1` also accepts `http:`. That escape hatch
exists for a development target and for the test suite.

A target that fails either rule SHALL raise a permanent failure. The message
SHALL name the host or the scheme that failed. The handler SHALL send no
request in that case.

The handler SHALL NOT follow a redirect. A 3xx answer SHALL reach the
existing failure classification, which treats it as permanent. Following a
redirect would check the first hop against the policy and no other hop.

#### Scenario: A target outside the allowlist never opens a connection

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` is `api.example.com` and an
  `http.request` action targets `https://169.254.169.254/latest/meta-data/`
- **THEN** the delivery fails permanently with a message naming the host, and
  the handler sends no request

#### Scenario: An unset allowlist denies every target

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` is unset or empty and an
  `http.request` action targets any URL
- **THEN** the delivery fails permanently, and the handler sends no request

#### Scenario: An allowlisted host over https succeeds

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` holds the target's host and the URL's
  scheme is `https:`
- **THEN** the handler sends the request and classifies the answer the way it
  classifies any other answer

#### Scenario: A spaced, capitalized entry still matches

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` is `a.example.com, API.Example.com`
  and an `http.request` action targets `https://api.example.com/hook`
- **THEN** the policy permits the target

#### Scenario: A plain-http target needs the escape hatch

- **WHEN** an `http.request` action targets `http://localhost:3001/hook`,
  `HTTP_ACTION_ALLOWED_HOSTS` holds `localhost:3001`, and
  `HTTP_ACTION_ALLOW_INSECURE` is unset
- **THEN** the delivery fails permanently with a message naming the scheme
- **WHEN** the same action runs with `HTTP_ACTION_ALLOW_INSECURE` set to `1`
- **THEN** the handler sends the request

#### Scenario: A redirect off the allowlist is not followed

- **WHEN** an allowlisted host answers `302` with a `Location` of
  `http://169.254.169.254/`
- **THEN** the handler treats the `302` as a permanent failure, and it sends
  no request to the redirect target

### Requirement: A header value may reference an environment variable

A value in `config.headers` SHALL be a string or an object `{ "env": NAME }`
with no other key. `NAME` SHALL match `^[A-Z][A-Z0-9_]*$`. Publish SHALL
reject any other object. At delivery the handler SHALL replace each reference
with the value of that variable in the process environment. The header
carries that value. The definition, the draft and the outbox row SHALL keep
the reference only.

#### Scenario: A reference resolves at delivery

- **WHEN** `HTTP_SECRET_ENV_ALLOWLIST` is `PARTNER_API_TOKEN`, that variable
  holds `sk_live_1`, and an action sets the header `Authorization` to
  `{ "env": "PARTNER_API_TOKEN" }`
- **THEN** the request carries `Authorization: sk_live_1`

#### Scenario: The outbox row keeps the reference

- **WHEN** a transition enqueues that action
- **THEN** the row's `action` holds `{ "env": "PARTNER_API_TOKEN" }`, and
  the text `sk_live_1` appears in no column of the row

#### Scenario: Publish rejects an object with another shape

- **WHEN** a header value is `{ "env": "A_B", "default": "x" }`, or
  `{ "env": "lower" }`, or `{ "secret": "id" }`
- **THEN** publish rejects it with a located config-validation issue for that
  action

#### Scenario: A rotated variable reaches the next delivery

- **WHEN** the operator changes the variable and restarts the engine
- **THEN** the next delivery of the same published version sends the new
  value

### Requirement: The operator decides which variables a reference may read

The handler SHALL read a reference only when `HTTP_SECRET_ENV_ALLOWLIST`
names the variable. The variable holds a comma-separated list. The handler
SHALL trim each entry and compare names case-sensitively. An unset or empty list
refuses every reference. The handler SHALL read the list at each delivery.

#### Scenario: A name outside the list never reaches the environment

- **WHEN** `HTTP_SECRET_ENV_ALLOWLIST` is `PARTNER_API_TOKEN` and an action
  references `AUTH_JWT_SECRET`
- **THEN** the delivery fails permanently with a message naming
  `AUTH_JWT_SECRET`, and the handler sends no request

#### Scenario: An unset list refuses every reference

- **WHEN** `HTTP_SECRET_ENV_ALLOWLIST` is unset or empty and an action holds
  a reference
- **THEN** the delivery fails permanently and the handler sends no request

### Requirement: In a deployment with many tenants an allowlist entry names its tenant

In a deployment that serves many tenants, an entry SHALL have the form
`tenant:NAME`. It permits only that tenant's actions to read `NAME`. Such a
deployment SHALL ignore an entry with no tenant. A deployment with one tenant
SHALL ignore an entry that names a tenant.

#### Scenario: An entry scopes a name to one tenant

- **WHEN** a deployment serves tenants `acme` and `beta`, the list is
  `acme:PARTNER_API_TOKEN`, and an action of tenant `beta` references
  `PARTNER_API_TOKEN`
- **THEN** the delivery fails permanently and the handler sends no request
- **WHEN** an action of tenant `acme` references the same name
- **THEN** the handler resolves it

#### Scenario: A deployment with one tenant ignores a scoped entry

- **WHEN** a deployment serves one tenant and the list is
  `acme:PARTNER_API_TOKEN`
- **THEN** a reference to `PARTNER_API_TOKEN` fails permanently

#### Scenario: A deployment with many tenants ignores an unscoped entry

- **WHEN** a deployment serves many tenants and the list is
  `PARTNER_API_TOKEN`
- **THEN** every tenant's reference to that name fails permanently

### Requirement: A reference that cannot resolve fails the delivery permanently

A delivery SHALL fail permanently and send no request in three cases. The
reference names an unset variable. Its value is empty. Its value is no legal
header value.

The message SHALL name the variable. It SHALL NOT contain any part of
a variable's value. The same holds for every log line the handler writes and
for any text the transport raises.

#### Scenario: An unset variable fails the delivery

- **WHEN** the list names `PARTNER_API_TOKEN`, the variable is unset, and an
  action references it
- **THEN** the delivery fails permanently with a message naming the variable

#### Scenario: An empty value fails the delivery

- **WHEN** the variable holds the empty string or only spaces
- **THEN** the delivery fails permanently, as for an unset variable

#### Scenario: An illegal value never appears in the message

- **WHEN** the variable holds `sk_live_1` followed by a line break
- **THEN** the delivery fails permanently and the message names the variable
- **THEN** the text `sk_live_1` appears in neither the message nor the log
