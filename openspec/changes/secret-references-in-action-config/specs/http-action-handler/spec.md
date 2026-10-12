# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
