# http-wrapper Specification

## Purpose

A thin REST/JSON adapter over the Runtime API Layer's five operations
(`createProcessInstance`, `getInstanceView`, `submitAndTransition`,
`claimStep`, `releaseClaim`), exposing them as HTTP routes with no added
transport-level semantics beyond actor resolution and error mapping. Actor
resolution is delegated to an injected `ActorResolver` (see the
`actor-resolution` capability), which reads whatever it needs from the
request's `Headers` — never a trusted actor supplied directly by the caller.
The wired resolver is a composition-root decision (`src/http/server.ts`):
the non-production dev header resolver, or the production-capable JWT
resolver (see the `jwt-authentication` capability), never both at once.
Assignment/claim enforcement itself is not implemented here; this capability
only maps the Runtime API Layer's own enforcement errors to HTTP statuses.
It keeps the engine's background workers (timer, outbox-delivery,
re-resolution) running for the lifetime of the server process.

The wrapper additionally exposes the discovery surface added by
`add-read-query-api`: instance listing (`GET /instances`, backed by the
`instance-query` capability's `listInstances`), an instance's merged
history/event record (`GET /instances/:instanceId/record`), cancellation
(`POST /instances/:instanceId/cancel`), publishing (`POST /processes`,
validated against the server's own injected action `Registry`), and
process/version enumeration (`GET /processes`, `GET
/processes/:processId/versions`, backed by the `definition-store`
capability). Every route — the original five, plus all six of these —
resolves its actor through the same `ActorResolver` seam; publish, cancel, the
unfiltered instance listing (`scope=all` or an omitted `scope`) and the
instance record additionally require a reserved role on that resolved actor
(see the `authorization` capability) — the latter two **BREAKING**
tightenings, since both were previously open to any authenticated actor — and
the four read/enumeration routes gained actor resolution as part of
`add-authentication` (a code-review finding: they had shipped with none,
leaving them open even with the JWT resolver active).
`POST /auth/login` (see
the `local-user-accounts` capability) is the one route that does not resolve
an actor — it is what issues the credential every other route consumes — and
is registered only when a local signing key is configured.

## Requirements

### Requirement: Create a process instance over HTTP

`POST /processes/:processId/instances` SHALL resolve the actor via the
injected `ActorResolver`, accept a JSON body `{ version?, data? }`, call
`createProcessInstance(processId, actor, dataSourceRegistry, {version,
data})` using the `DataSourceRegistry` injected at server startup, and on
success return `201 Created` with the resulting `Instance` as the JSON body,
with no response envelope.

#### Scenario: Creating an instance with no data seed
- **WHEN** a `POST /processes/:processId/instances` request carries a body
  with no `data`
- **THEN** the response is `201` and the body is the created `Instance`

#### Scenario: Creating an instance with a data seed
- **WHEN** a `POST /processes/:processId/instances` request carries `data`
  satisfying the initial step's validation
- **THEN** the response is `201` and the created `Instance` reflects that
  data

#### Scenario: Creating an instance pinned to an explicit version
- **WHEN** a `POST /processes/:processId/instances` request carries a
  `version` older than the newest published version
- **THEN** the created instance is pinned to that explicit version, not the
  newest

### Requirement: Resolve an instance view over HTTP

`GET /instances/:instanceId` SHALL resolve the actor via the injected
`ActorResolver` and call `getInstanceView(instanceId, actor,
dataSourceRegistry)` using the `DataSourceRegistry` injected at server
startup, and on success return `200 OK` with the resulting `InstanceView` as
the JSON body, with no response envelope. Any resolved field carrying a
`dataSource` SHALL have its `options` resolved in the returned view, per the
`data-source-resolution` capability.

#### Scenario: Viewing an instance with no roles
- **WHEN** a `GET /instances/:instanceId` request carries `X-Actor-Id` but
  no `X-Actor-Roles` header (the shipped dev resolver)
- **THEN** `getInstanceView` is called with `actor.roles` equal to `[]`

#### Scenario: Viewing an instance with multiple roles
- **WHEN** a `GET /instances/:instanceId` request carries
  `X-Actor-Roles: employee,finance-approver` (the shipped dev resolver)
- **THEN** `getInstanceView` is called with `actor.roles` equal to
  `["employee", "finance-approver"]`

#### Scenario: Viewing a non-running instance still resolves
- **WHEN** `GET /instances/:instanceId` targets a `completed`, `cancelled`,
  or `faulted` instance
- **THEN** the response is `200` with an `InstanceView` whose `status`
  reflects that state and whose `availablePaths` is empty

#### Scenario: A dataSource-bound field's options are resolved over HTTP
- **WHEN** `GET /instances/:instanceId` targets an instance whose current
  step has a visible field bound to a `dataSource`
- **THEN** the response body's corresponding `ResolvedViewField` carries that
  data source's resolved `options`

### Requirement: Submit data and trigger a manual transition over HTTP

`POST /instances/:instanceId/submit` SHALL resolve the actor via the
injected `ActorResolver`, accept a JSON body `{ pathId, data }`, call
`submitAndTransition(instanceId, pathId, data, actor, dataSourceRegistry)`
using the `DataSourceRegistry` injected at server startup, and on success
return `200 OK` with the resulting `Instance` as the JSON body, with no
response envelope.

#### Scenario: A valid submission commits and returns the updated instance
- **WHEN** a `POST /instances/:instanceId/submit` request carries `data`
  that passes validation and a `pathId` whose guard holds
- **THEN** the response is `200` and the body is the `Instance` reflecting
  the committed data and the new step

### Requirement: The caller supplies the actor directly; this is not an auth mechanism

The HTTP wrapper's server setup SHALL take an `ActorResolver`, injected once
at startup alongside the existing `Registry`/`DataSourceRegistry`/
`resolveBody` injection. For every route, middleware SHALL pass the request's
`Headers` to the injected resolver and pass the resulting `Actor` into the
underlying Runtime API Layer call; it SHALL NOT pre-extract any
resolver-specific credential field. A route SHALL NO LONGER accept an `actor`
field directly in its request body or query parameters as a trusted value; the
resolved `Actor` is authoritative. A resolver that throws
`ActorResolutionError` SHALL short-circuit the route before any Runtime API
Layer call. Whether the wired resolver is the non-production dev header
resolver or the production JWT resolver is a composition-root decision (see the
`jwt-authentication` capability); the route handlers are identical either way.

#### Scenario: A request with a resolvable credential succeeds
- **WHEN** a request to any route carries a credential the injected
  `ActorResolver` can resolve
- **THEN** the resolved `Actor` is passed to the underlying Runtime API
  Layer call, and the route proceeds normally

#### Scenario: A request with no resolvable credential is rejected before reaching the Runtime API Layer
- **WHEN** a request's credential cannot be resolved by the injected
  `ActorResolver`
- **THEN** the underlying Runtime API Layer operation is not invoked

#### Scenario: An actor field in the request body is no longer trusted directly
- **WHEN** a request body includes an `actor` field alongside a resolvable
  credential
- **THEN** the `actor` field is ignored; the `Actor` passed to the Runtime
  API Layer comes from the injected resolver, not the request body

#### Scenario: The transport layer extracts no resolver-specific field
- **WHEN** a route resolves an actor
- **THEN** the credential it hands the resolver is the request's `Headers`,
  unchanged

### Requirement: Typed Runtime API Layer errors map to specific HTTP statuses

The HTTP layer SHALL map each of the following errors thrown by the Runtime
API Layer to the given HTTP status and body shape.

Any other thrown value SHALL map to `500` with `{ error: { type: "internal" } }`
and **no** `message`, and SHALL be logged server-side with its message, its
stack, and the request's method and path. An unrecognized throw carries text
the engine did not choose to expose — a `Bun.sql` error names relations,
columns and constraints; a plugin handler's error names whatever it likes — so
the client learns the request failed and the operator learns why. The
message-free body is the shape `ConcurrencyConflict` already uses.

The Runtime API Layer's not-found conditions ("instance not found", "no
published body for process ...") SHALL be thrown as a typed `NotFoundError`
rather than as plain `Error`s, and SHALL keep mapping to `500` with a message
— unchanged behavior, now pinned to the engine's intent instead of to the
absence of a mapping.

| Thrown | Status | Body |
|---|---|---|
| `SubmissionValidationError` | `422` | `{ error: { type: "validation", issues } }` |
| `GuardRefused` | `409` | `{ error: { type: "guard-refused", message } }` |
| `ConcurrencyConflict` | `409` | `{ error: { type: "concurrency-conflict" } }` |
| `InstanceNotRunningError` | `409` | `{ error: { type: "instance-not-running", message } }` |
| `NotFoundError` | `500` | `{ error: { type: "internal", message } }` |
| `PinMismatch` | `500` | `{ error: { type: "internal", message } }` |
| `RequestShapeError` | `400` | `{ error: { type: "request-shape", message } }` |
| `ActorResolutionError` | `401` | `{ error: { type: "actor-resolution", message } }` |
| `AuthorizationError` | `403` | `{ error: { type: "authorization", message } }` |
| `NotAssignedError` | `403` | `{ error: { type: "not-assigned", message } }` |
| `NotACandidateError` | `403` | `{ error: { type: "not-a-candidate", message } }` |
| `AlreadyClaimedError` | `403` | `{ error: { type: "already-claimed", message } }` |
| `NotClaimedError` | `403` | `{ error: { type: "not-claimed", message } }` |
| `NotClaimantError` | `403` | `{ error: { type: "not-claimant", message } }` |

#### Scenario: A submission validation failure maps to 422
- **WHEN** `POST /instances/:instanceId/submit` data fails field validation
- **THEN** the response is `422` with `error.type` equal to `"validation"`
  and `error.issues` carrying the located issues

#### Scenario: A guard refusal maps to 409
- **WHEN** a submission's target path guard evaluates false against the
  merged data
- **THEN** the response is `409` with `error.type` equal to
  `"guard-refused"`

#### Scenario: A concurrency conflict maps to 409
- **WHEN** a submission's underlying commit raises `ConcurrencyConflict`
- **THEN** the response is `409` with `error.type` equal to
  `"concurrency-conflict"`

#### Scenario: A typed "not found" error maps to 500, not 404
- **WHEN** a request targets an `instanceId` or `processId` that resolves
  to no stored instance or published definition, which the Runtime API
  Layer signals as `NotFoundError`
- **THEN** the response is `500` with `error.type` equal to `"internal"`
  and `error.message` carrying the error text — not `404`

#### Scenario: An unexpected internal failure discloses nothing and is logged
- **WHEN** a route raises a value that matches no mapping — a database error,
  a plugin handler's throw, a programming fault
- **THEN** the response is `500` with `error.type` equal to `"internal"` and
  **no** `error.message`, and the server logs the error, its stack, and the
  request's method and path

#### Scenario: An operation against a non-running instance maps to 409
- **WHEN** a submit, claim or release targets an instance whose status is not
  `running`
- **THEN** the response is `409` with `error.type` equal to
  `"instance-not-running"`, and nothing is written

#### Scenario: An unresolvable credential maps to 401
- **WHEN** a request's credential cannot be resolved by the injected
  `ActorResolver`
- **THEN** the response is `401` with `error.type` equal to
  `"actor-resolution"`

#### Scenario: A resolved actor lacking a required role maps to 403
- **WHEN** a request's resolved `Actor` does not carry the role a route
  requires (`system:publish` for publish, `system:cancel-any` for cancel)
- **THEN** the response is `403` with `error.type` equal to `"authorization"`

#### Scenario: A claim attempt on a step with no declared assignment maps to 403
- **WHEN** `POST /instances/:instanceId/claim` targets a step with no
  declared `assignment`
- **THEN** the response is `403` with `error.type` equal to `"not-assigned"`

#### Scenario: A claim attempt by a non-candidate maps to 403
- **WHEN** `POST /instances/:instanceId/claim` is called by an actor who is
  not an eligible candidate
- **THEN** the response is `403` with `error.type` equal to
  `"not-a-candidate"`

#### Scenario: A claim attempt on an already-claimed step maps to 403
- **WHEN** `POST /instances/:instanceId/claim` targets a step already
  claimed by a different actor
- **THEN** the response is `403` with `error.type` equal to
  `"already-claimed"`

#### Scenario: A submission to an unclaimed assigned step maps to 403
- **WHEN** `POST /instances/:instanceId/submit` targets a step with a
  declared assignment and no current claim
- **THEN** the response is `403` with `error.type` equal to `"not-claimed"`

#### Scenario: A submission by a non-claimant maps to 403
- **WHEN** `POST /instances/:instanceId/submit` targets a step claimed by a
  different actor
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`

#### Scenario: A release attempt by a non-claimant maps to 403
- **WHEN** `POST /instances/:instanceId/release` is called by an actor who
  does not hold the current claim
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`

### Requirement: A cascade loop after a committed submission returns the resulting faulted view, not an error

When `submitAndTransition`'s post-commit automatic cascade raises the
engine's `AutomaticCascadeLoop`, the submit route SHALL NOT return an error
response. The submitted data and manual transition have already committed.
The route SHALL instead call `getInstanceView` for the current state and
return `200 OK` with that view, whose `status` field reflects `"faulted"`.

#### Scenario: A cascade loop surfaces as a 200 with a faulted view
- **WHEN** a submission's own commit succeeds but the subsequent automatic
  cascade re-enters a step already seen in the same advance, raising
  `AutomaticCascadeLoop`
- **THEN** the response is `200` and the body is the resulting
  `InstanceView` with `status` equal to `"faulted"` — not an error response

### Requirement: The HTTP server keeps the engine's background workers running

`startHttpServer()` SHALL, in addition to serving this capability's routes,
call the existing `startEngine` so the timer, outbox-delivery, and
re-resolution background workers run for as long as the server process is up.
Without this, an instance parked on a wait-state with a pending async action
or timer would never progress through the HTTP-driven flow.

#### Scenario: An async action enqueued via HTTP eventually settles
- **WHEN** a submission drives an instance onto a step whose `onEntry`
  enqueues an async action, and the server has been running long enough
  for a delivery pass
- **THEN** a subsequent `GET /instances/:instanceId` reflects the action's
  writeback and, if a guard now matches, the instance having advanced past
  that step — with no manual draining required by the caller

### Requirement: A liveness probe reports the process is up

`GET /livez` SHALL always return `200 OK` with body `{ status: "ok" }`. It
SHALL NOT resolve an actor. It SHALL NOT touch the database or any other
dependency.

#### Scenario: The process is running

- **WHEN** `GET /livez` is requested
- **THEN** the response is `200` with body `{ status: "ok" }`

#### Scenario: No credential is required

- **WHEN** `GET /livez` is requested with no `Authorization` header and no
  actor-identifying header
- **THEN** the response is still `200`, since the route resolves no actor

### Requirement: A readiness probe reports whether the process can serve traffic

`GET /readyz` SHALL run a database ping (`SELECT 1` against the server's
`Bun.sql` connection). It SHALL return `200 OK` with body
`{ status: "ok" }` when the ping succeeds. It SHALL return
`503 Service Unavailable` with body `{ status: "unavailable" }` when the
ping fails. It SHALL NOT resolve an actor.

It SHALL NOT route the ping failure through `mapError`. The response body
SHALL carry no failure detail beyond the status string. It SHALL carry no
database failure message, no connection string fragment, and no version
number.

#### Scenario: The database is reachable

- **WHEN** `GET /readyz` is requested and the database ping succeeds
- **THEN** the response is `200` with body `{ status: "ok" }`

#### Scenario: The database is unreachable

- **WHEN** `GET /readyz` is requested and the database ping fails
- **THEN** the response is `503` with body `{ status: "unavailable" }`
- **AND** the body carries no database failure message or other failure
  detail

#### Scenario: No credential is required

- **WHEN** `GET /readyz` is requested with no `Authorization` header and no
  actor-identifying header
- **THEN** the response reflects the database ping's outcome, not a `401`

### Requirement: HTTP wrapper responses carry configured CORS headers

The set of browser origins the HTTP wrapper permits SHALL be configuration,
injected into `createServer` and supplied by `startHttpServer` from the
`CORS_ALLOWED_ORIGINS` environment variable — the same composition-root
convention `DATABASE_URL` and `PORT` already follow.

The configured value SHALL select exactly one of three behaviors, applied
uniformly to every response on every route other than `GET /livez` and
`GET /readyz`, success and error alike. Those two routes are exempt: an
orchestrator's health probe carries no `Origin` header and is not a
browser request, so they SHALL NEVER emit an `Access-Control-Allow-Origin`
header, regardless of configuration.

- **unset** — no `Access-Control-Allow-Origin` header is emitted. This is the
  default. Same-origin frontends and non-browser clients are unaffected,
  since CORS is enforced by browsers on cross-origin requests only.
- **`*`** — the wildcard is emitted, identical to the prior behavior, but now
  as an explicit opt-in visible in the deployment's configuration.
- **an origin allowlist** — the request's `Origin` is echoed back as
  `Access-Control-Allow-Origin` when and only when it appears on the list; a
  request from an origin not on the list receives no such header.

When the response's allowed origin depends on the request's `Origin` (the
allowlist case), the response SHALL carry `Vary: Origin`, so a shared cache
cannot serve an allowed origin's response to a different origin.

#### Scenario: An unset configuration emits no origin header

- **WHEN** the server is configured with no allowed origins and any route returns a response
- **THEN** the response carries no `Access-Control-Allow-Origin` header
- **AND** the response body and status are exactly what the same request would produce with CORS configured

#### Scenario: A wildcard configuration echoes the wildcard

- **WHEN** the server is configured with `*` and any route returns a successful response
- **THEN** the response includes `Access-Control-Allow-Origin: *`

#### Scenario: An error response follows the same rule as a success

- **WHEN** the server is configured with `*` and a route returns a 4xx or 5xx response
- **THEN** that response also includes `Access-Control-Allow-Origin: *`

#### Scenario: An allowlisted origin is echoed back

- **WHEN** the server is configured with an allowlist containing `https://app.example`
- **AND** a request carries `Origin: https://app.example`
- **THEN** the response includes `Access-Control-Allow-Origin: https://app.example`
- **AND** the response includes `Vary: Origin`

#### Scenario: An origin outside the allowlist receives no origin header

- **WHEN** the server is configured with an allowlist not containing `https://evil.example`
- **AND** a request carries `Origin: https://evil.example`
- **THEN** the response carries no `Access-Control-Allow-Origin` header
- **AND** the response still carries `Vary: Origin`

#### Scenario: A request with no Origin header is unaffected

- **WHEN** a request carries no `Origin` header (a non-browser client)
- **THEN** the route executes and returns its ordinary response regardless of the configured origins

#### Scenario: livez ignores the CORS configuration

- **WHEN** the server is configured with `*` and `GET /livez` is requested
- **THEN** the response carries no `Access-Control-Allow-Origin` header

#### Scenario: readyz ignores the CORS configuration

- **WHEN** the server is configured with an allowlist containing the
  request's `Origin` and `GET /readyz` is requested
- **THEN** the response carries no `Access-Control-Allow-Origin` header

### Requirement: HTTP wrapper answers CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS` requests to each of its routes,
other than `GET /livez` and `GET /readyz`, as a CORS preflight: respond
`204 No Content` with `Access-Control-Allow-Methods` listing the route's
actual method, `Access-Control-Allow-Headers` including `Content-Type`,
and the `Access-Control-Allow-Origin` header determined by the configured
allowed origins exactly as an ordinary response's is, without invoking the
underlying Runtime API Layer operation. `GET /livez` and `GET /readyz`
register no `OPTIONS` handler at all: an orchestrator's health probe never
sends a preflight, and an `OPTIONS` request to either path falls through
to the wrapper's ordinary unmatched-route response.

A preflight from an origin the configuration does not permit SHALL still
answer `204` and SHALL omit the origin header, rather than returning an error
status: the browser blocks the real request on the missing header, and
preflight handling stays uniform across every other route and every
configuration.

#### Scenario: Preflighting the create-instance route
- **WHEN** an `OPTIONS /processes/:processId/instances` request is made
- **THEN** the response is `204` with the CORS headers, and
  `createProcessInstance` is not invoked

#### Scenario: Preflighting the get-instance-view route
- **WHEN** an `OPTIONS /instances/:instanceId` request is made
- **THEN** the response is `204` with the CORS headers, and
  `getInstanceView` is not invoked

#### Scenario: Preflighting the submit route
- **WHEN** an `OPTIONS /instances/:instanceId/submit` request is made
- **THEN** the response is `204` with the CORS headers, and
  `submitAndTransition` is not invoked

#### Scenario: A preflight from a disallowed origin is answered without the origin header
- **WHEN** the server is configured with an allowlist and an `OPTIONS` request
  carries an `Origin` not on it
- **THEN** the response is `204` with `Access-Control-Allow-Methods` and
  `Access-Control-Allow-Headers`, but no `Access-Control-Allow-Origin`
- **AND** the underlying Runtime API Layer operation is not invoked

#### Scenario: An OPTIONS request to livez is not treated as a preflight

- **WHEN** `OPTIONS /livez` is requested
- **THEN** the response is the wrapper's ordinary unmatched-route response,
  not a `204` preflight answer

#### Scenario: An OPTIONS request to readyz is not treated as a preflight

- **WHEN** `OPTIONS /readyz` is requested
- **THEN** the response is the wrapper's ordinary unmatched-route response,
  not a `204` preflight answer

### Requirement: Claim the current step of an instance over HTTP

`POST /instances/:instanceId/claim` SHALL resolve the actor via the
injected `ActorResolver`, call `claimStep(instanceId, actor)`, and on
success return `200 OK` with the resulting `Instance` as the JSON body,
with no response envelope.

#### Scenario: An eligible candidate claims over HTTP
- **WHEN** a `POST /instances/:instanceId/claim` request resolves to an
  eligible candidate actor and the current step is unclaimed
- **THEN** the response is `200` and the body is the `Instance` reflecting
  the new claim

### Requirement: Release a claim on the current step of an instance over HTTP

`POST /instances/:instanceId/release` SHALL resolve the actor via the
injected `ActorResolver`, call `releaseClaim(instanceId, actor)`, and on
success return `200 OK` with the resulting `Instance` as the JSON body,
with no response envelope.

#### Scenario: The claimant releases over HTTP
- **WHEN** a `POST /instances/:instanceId/release` request resolves to the
  actor currently holding the claim
- **THEN** the response is `200` and the body is the `Instance` reflecting
  the cleared claim

### Requirement: The claim and release routes answer CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS` requests to the claim and release
routes as a CORS preflight, matching the existing three routes: respond
`204 No Content` with the standard CORS headers, without invoking
`claimStep` or `releaseClaim`.

#### Scenario: Preflighting the claim route
- **WHEN** an `OPTIONS /instances/:instanceId/claim` request is made
- **THEN** the response is `204` with the CORS headers, and `claimStep` is
  not invoked

#### Scenario: Preflighting the release route
- **WHEN** an `OPTIONS /instances/:instanceId/release` request is made
- **THEN** the response is `204` with the CORS headers, and `releaseClaim`
  is not invoked

### Requirement: Delegate a claim on the current step of an instance over HTTP

`POST /instances/:instanceId/delegate` SHALL resolve the actor via the
injected `ActorResolver` and parse the JSON body for a `toActorId`
string. It SHALL call `delegateClaim(instanceId, actor, toActorId)` and,
on success, return `200 OK` with the resulting `Instance` as the JSON
body, with no response envelope. An empty or missing `toActorId` SHALL be
rejected as a `RequestShapeError`, mapped to `400`. This matches
`parseJsonBody`'s existing treatment of `/submit`.

#### Scenario: The claimant delegates over HTTP

- **WHEN** a `POST /instances/:instanceId/delegate` request resolves to
  the actor currently holding the claim, with a valid `toActorId` in the
  body
- **THEN** the response is `200` and the body is the `Instance` reflecting
  the new claimant

#### Scenario: A missing `toActorId` is a request-shape error

- **WHEN** a `POST /instances/:instanceId/delegate` request body omits
  `toActorId` or supplies an empty string
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `delegateClaim` is not called

### Requirement: A non-claimant's delegation try maps to 403

`NotClaimantError` thrown by `delegateClaim` SHALL map to `403` with
`error.type` equal to `"not-claimant"`, the same mapping `/release`
already uses for the same error.

#### Scenario: A non-claimant's delegation try maps to 403

- **WHEN** a caller who does not hold the current claim calls
  `POST /instances/:instanceId/delegate`
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`

### Requirement: The delegate route answers CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS /instances/:instanceId/delegate`
requests as a CORS preflight, matching the existing claim and release
routes. It SHALL respond `204 No Content` with the standard CORS headers,
without invoking `delegateClaim`.

#### Scenario: Preflighting the delegate route

- **WHEN** an `OPTIONS /instances/:instanceId/delegate` request is made
- **THEN** the response is `204` with the CORS headers, and `delegateClaim`
  is not invoked

### Requirement: An operation against a non-running instance maps to 409

A delegation try against an instance whose status is not `running` SHALL
map to `409`, with `error.type` equal to `"instance-not-running"`. This
matches submit, claim, and release.

#### Scenario: A delegation against a non-running instance maps to 409

- **WHEN** `POST /instances/:instanceId/delegate` targets an instance
  whose status is not `running`
- **THEN** the response is `409` with `error.type` equal to
  `"instance-not-running"`

### Requirement: List instances over HTTP

The HTTP wrapper SHALL expose the instance listing read as `GET /instances`,
translating query parameters to the read's filters: `processId`, `status`
(repeatable, one value per accepted status), `currentStepId`, `startedBy`,
`claimedBy`, `assignedTo`, plus `limit` and `cursor`. Absent parameters SHALL
mean "unfiltered", never an error. A `limit` that is not a positive integer,
or a `status` value that is not an instance status, SHALL be rejected as a
request error rather than silently ignored. Like every other route, it SHALL
first resolve the actor through the injected `ActorResolver` (see "Every
route rejects a missing or invalid bearer token when the JWT resolver is
active").

The route SHALL additionally accept a `scope` query parameter whose recognized
values are `"mine"` and `"all"`; any other value SHALL be rejected as a request
error. An omitted `scope` SHALL resolve to `"all"` — that is what an omitted
`scope` has always meant — rather than defaulting to `"mine"`, so an existing
request's meaning is never silently narrowed.

`scope=all` (explicit or by omission) SHALL require `ADMIN_ROLE` on the
resolved actor, checked with `requireRole` before the filter is applied, so an
authenticated actor lacking it receives 403. This is a **BREAKING** tightening
of a route that was previously open to every authenticated actor. The other
filters do not affect the check: narrowing an unfiltered listing does not make
it a participant's own listing.

When `scope=mine`, no role is required; the wrapper derives `assignedTo` (and
the resolved actor's roles, for `instance-query`'s role-matching half of the
inbox predicate — see that capability) from the resolved actor rather than a
query parameter, and SHALL reject a request that combines `scope=mine` with an
explicit `assignedTo` value as a request error — `scope=mine` and `assignedTo`
are alternatives, never combined.

The response SHALL carry the page of summaries and the next cursor, with the
cursor absent on the last page.

#### Scenario: Listing with no query parameters

- **WHEN** `GET /instances` is requested with a resolvable credential holding
  `system:admin`
- **THEN** the response is 200 and carries every instance summary, subject to the default limit

#### Scenario: An omitted scope without the admin role is refused

- **WHEN** `GET /instances` is requested with a resolvable credential that does
  not hold `system:admin`
- **THEN** the response is 403 and no listing read is performed

#### Scenario: scope=all without the admin role is refused

- **WHEN** `GET /instances?scope=all` is requested with a resolvable credential
  that does not hold `system:admin`
- **THEN** the response is 403

#### Scenario: scope=mine needs no role

- **WHEN** `GET /instances?scope=mine` is requested with a resolvable
  credential holding no reserved role
- **THEN** the response is 200 and carries that actor's assignments

#### Scenario: Listing an actor's inbox

- **WHEN** `GET /instances?assignedTo=user-1&status=running` is requested with
  a resolvable credential holding `system:admin`
- **THEN** the response carries only running instances claimed by, or claimable by, `user-1`

#### Scenario: An unrecognized scope value is a request error

- **WHEN** `GET /instances?scope=sideways` is requested with a resolvable credential
- **THEN** the response is 400 with a typed error body

#### Scenario: scope=mine rejects an explicit assignedTo

- **WHEN** `GET /instances?scope=mine&assignedTo=user-1` is requested with a resolvable credential
- **THEN** the response is a request error, and neither value is applied

#### Scenario: Repeating the status parameter widens the filter

- **WHEN** `GET /instances?status=running&status=cancelled` is requested with a
  resolvable credential holding `system:admin`
- **THEN** instances of both statuses are returned

#### Scenario: Paging over HTTP

- **WHEN** `GET /instances?limit=2` is requested with a resolvable credential
  holding `system:admin` and more than two instances exist
- **THEN** the response carries two summaries and a cursor
- **AND** requesting the same route with that cursor carries the following summaries

#### Scenario: An unparseable limit is a request error

- **WHEN** `GET /instances?limit=abc` is requested with a resolvable credential
- **THEN** the response is 400 with a typed error body

#### Scenario: An unknown status value is a request error

- **WHEN** `GET /instances?status=sideways` is requested with a resolvable credential
- **THEN** the response is 400 with a typed error body

#### Scenario: An unresolvable credential is rejected before the filter is even parsed

- **WHEN** `GET /instances` (with or without query parameters) is requested with no resolvable credential
- **THEN** the response is 401 and no listing read is performed

### Requirement: Read an instance's record over HTTP

The HTTP wrapper SHALL expose the merged history/event record read as
`GET /instances/:instanceId/record`, accepting `limit` and `cursor`, and
returning the ordered, discriminated sequence the read produces. Like every
other route, it SHALL first resolve the actor through the injected
`ActorResolver`.

It SHALL then authorize the resolved actor through `getInstanceRecord`'s own
two-path check (see the `authorization` capability): `ADMIN_ROLE` on its own,
unconditionally, OR `DEVELOPER_ROLE` together with `instance.startedBy`
matching the actor's id. There is no broader "the record of an instance I am
assigned to" carve-out beyond those two paths. The record is the audit
backbone: it carries actor ids, action outcomes and resolved handler builds
across every participant of the instance. Requiring `ADMIN_ROLE`
unconditionally was originally a **BREAKING** tightening of a route that had
been open to every authenticated actor; the developer-and-starter path added
here is additive on top of that tightening, not a reopening of it.

An unknown instance id SHALL return 200 with an empty sequence, consistent
with the read itself and with the wrapper's existing choice not to invent
404s for absent instances — but only once the actor resolves and the
authorization check passes.

#### Scenario: Reading a record as an admin

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:admin` for an instance that has transitioned
- **THEN** the response is 200 and carries the merged, ordered record

#### Scenario: Reading a record as the instance's developer starter

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:developer` but not `system:admin`, for an
  instance whose `startedBy` matches that credential's actor id
- **THEN** the response is 200 and carries the merged, ordered record

#### Scenario: An actor satisfying neither path is refused

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential that does not hold `system:admin`, and either lacks
  `system:developer` or did not start the target instance
- **THEN** the response is 403 and no record read is performed

#### Scenario: Reading the record of an unknown instance

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:admin` for an id that does not exist
- **THEN** the response is 200 with an empty sequence

#### Scenario: An unresolvable credential is rejected regardless of whether the instance exists

- **WHEN** `GET /instances/:id/record` is requested with no resolvable credential
- **THEN** the response is 401, whether or not `:id` names a real instance

### Requirement: Cancel an instance over HTTP

The HTTP wrapper SHALL expose the engine's existing instance cancellation as
`POST /instances/:instanceId/cancel`, resolving the actor through the injected
`ActorResolver` exactly as the other routes do and returning the resulting
instance state.

Cancelling SHALL succeed when the caller's resolved `Actor` carries the
`system:cancel-any` role (see the `authorization` capability), OR when the
target instance's `startedBy` equals the caller's resolved `Actor.id`. The
`system:cancel-any` check SHALL run first and SHALL NOT require loading the
target instance — a role-holding caller SHALL be authorized regardless of
whether the instance exists, is running, or is already terminal, exactly as
before this change. Only when the role is absent SHALL the target instance be
loaded to evaluate the `startedBy` check.

A caller lacking `system:cancel-any` SHALL learn nothing about the target
instance from a failed authorization attempt: an unresolvable instance id and
a resolvable instance whose `startedBy` does not match the caller SHALL both
be rejected identically (`403`, `error.type: "authorization"`), preserving the
pre-existing guarantee that a role-less caller is rejected before any
instance state becomes observable to it, "before" now meaning "without the
rejection differing by instance existence" rather than "without a load
occurring at all."

Cancelling an instance that is not running SHALL succeed as a no-op, since
that is the engine's own semantics, and SHALL NOT be reported as an error.

#### Scenario: Cancelling a running instance

- **WHEN** `POST /instances/:id/cancel` is requested for a running instance
  by an actor carrying the `system:cancel-any` role
- **THEN** the response is 200
- **AND** the instance's status is `cancelled`
- **AND** a cancel history entry has been recorded

#### Scenario: Cancelling an already-cancelled instance

- **WHEN** the same route is requested again for that instance by an actor
  carrying the `system:cancel-any` role
- **THEN** the response is 200 and the instance stays cancelled

#### Scenario: Cancelling without a resolvable credential

- **WHEN** the route is requested with no resolvable credential
- **THEN** the response is 401 and the instance is unchanged

#### Scenario: Cancelling without the required role and not the starter is rejected

- **WHEN** `POST /instances/:id/cancel` is requested by an actor whose
  resolved `Actor.roles` does not include `system:cancel-any` and who is not
  the instance's `startedBy`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`

#### Scenario: The instance's own starter may cancel it without the role

- **WHEN** `POST /instances/:id/cancel` is requested by an actor whose
  resolved `Actor.roles` does not include `system:cancel-any`, and who is the
  target instance's `startedBy`
- **THEN** the response is 200 and the instance's status is `cancelled`

#### Scenario: A non-starter without the role cannot cancel someone else's instance

- **WHEN** `POST /instances/:id/cancel` is requested by an actor who neither
  carries `system:cancel-any` nor started the target instance
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** the instance is unchanged

#### Scenario: A role-holding caller is authorized without an instance load

- **WHEN** `POST /instances/:id/cancel` targets an instance id that does not
  exist and the caller carries `system:cancel-any`
- **THEN** the authorization check passes before any instance lookup is
  attempted, matching pre-change behavior

#### Scenario: A role-less caller is rejected identically for a nonexistent instance

- **WHEN** `POST /instances/:id/cancel` targets an instance id that does not
  exist and the caller does not carry `system:cancel-any`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`,
  identical to the response for a resolvable instance the caller neither
  started nor may cancel

### Requirement: Publish a process body over HTTP

The HTTP wrapper SHALL expose `POST /processes`, accepting an authored process
body and publishing it through the definition store's existing publish
operation, returning the resulting `processId`, `version`, `definitionHash`
and `status`.

Publishing SHALL require the caller's resolved `Actor` to carry the
`system:publish` role (see the `authorization` capability). This check SHALL
run immediately after actor resolution, before the request body is parsed or
any publish-time validation runs — a caller without the role SHALL be
rejected without the definition store, registry, or CEL check ever being
reached.

Publishing SHALL run the unchanged publish-time validation chain — authored
schema, duration bounds, action registry, CEL, cross-process. The action
registry the check resolves against SHALL be the server's own injected
registry; a client SHALL NOT be able to supply or extend it.

An identical re-publish SHALL return the existing version, since publish is
idempotent on an identical body.

#### Scenario: Publishing a valid body

- **WHEN** `POST /processes` is requested with a valid authored body by an
  actor carrying the `system:publish` role
- **THEN** the response is 200 and carries version 1 and its hash
- **AND** the version is readable from the definition store

#### Scenario: Re-publishing an identical body

- **WHEN** the same body is published again
- **THEN** the response carries the same version and hash as the first publish

#### Scenario: Publishing a changed body

- **WHEN** a changed body for the same process is published
- **THEN** the response carries version 2

#### Scenario: A malformed request body is rejected

- **WHEN** `POST /processes` is requested with a body that is not valid JSON
- **THEN** the response is 400 with a typed error body

#### Scenario: Publishing without the required role is rejected

- **WHEN** `POST /processes` is requested by an actor whose resolved
  `Actor.roles` does not include `system:publish`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** no definition is persisted, even if the request body would
  otherwise have been valid

### Requirement: Publish-time validation failures map to 422

The HTTP wrapper SHALL map every publish-time validation failure — authored
schema violation, invalid duration, unregistered or schema-violating action
config, an unsupported `Step.assignment.strategy.type`, an unregistered or
schema-violating data source config, invalid CEL expression, unresolvable
cross-process reference — to 422 with a typed error body carrying the
failure's located issues, so a client can attribute the failure to a position
in the submitted body. A rejected publish SHALL consume no version number.

#### Scenario: An unregistered action type maps to 422

- **WHEN** a body carrying an action with an unregistered type is published
- **THEN** the response is 422 and the body names the offending action position

#### Scenario: An unsupported assignment strategy type maps to 422

- **WHEN** a body carrying a step whose `assignment.strategy.type` is not `"static"` is published
- **THEN** the response is 422 and the body names the offending step's assignment position

#### Scenario: An unregistered data source type maps to 422

- **WHEN** a body carrying a `dataSources` entry with an unregistered type is published
- **THEN** the response is 422 and the body names the offending data source position

#### Scenario: An invalid CEL expression maps to 422

- **WHEN** a body carrying an unparseable guard expression is published
- **THEN** the response is 422 and the body names the offending expression

#### Scenario: A structurally invalid body maps to 422

- **WHEN** a body whose `initialStep` references a missing step is published
- **THEN** the response is 422

#### Scenario: A rejected publish consumes no version

- **WHEN** a publish is rejected with 422 and a valid body is then published for the same process
- **THEN** the valid body is version 1

### Requirement: List processes and versions over HTTP

The HTTP wrapper SHALL expose the definition store's enumeration reads as
`GET /processes` (published processes with their newest version metadata) and
`GET /processes/:processId/versions` (that process's versions). Neither route
SHALL return process bodies. Like every other route, each SHALL first resolve
the actor through the injected `ActorResolver`.

#### Scenario: Listing published processes

- **WHEN** `GET /processes` is requested with a resolvable credential after two processes were published
- **THEN** the response is 200 and lists both with their newest version
- **AND** no entry carries a body

#### Scenario: Listing one process's versions

- **WHEN** `GET /processes/:processId/versions` is requested with a resolvable credential for a twice-published process
- **THEN** the response lists both versions in version order

#### Scenario: Listing the versions of an unpublished process

- **WHEN** the route is requested with a resolvable credential and an unpublished `processId`
- **THEN** the response is 200 with an empty list

#### Scenario: An unresolvable credential is rejected on either route

- **WHEN** `GET /processes` or `GET /processes/:processId/versions` is requested with no resolvable credential
- **THEN** the response is 401 and no enumeration read is performed

### Requirement: The new routes answer CORS preflight requests

Every route added by this change SHALL answer an `OPTIONS` preflight with 204
and the same permissive CORS headers the existing routes use, so a browser
client on another origin can reach them.

#### Scenario: Preflighting the instance listing route

- **WHEN** `OPTIONS /instances` is requested
- **THEN** the response is 204 and permits `GET`

#### Scenario: Preflighting the publish route

- **WHEN** `OPTIONS /processes` is requested
- **THEN** the response is 204 and permits `POST`

#### Scenario: Preflighting the cancel route

- **WHEN** `OPTIONS /instances/:id/cancel` is requested
- **THEN** the response is 204 and permits `POST`

### Requirement: The login route is registered conditionally

The HTTP server SHALL register `POST /auth/login` (see the
`local-user-accounts` capability) only when `AUTH_JWT_SECRET` is set. The route
SHALL follow the same `HttpResult` convention as every other route and SHALL
answer CORS preflight requests on the same terms as the existing routes.

#### Scenario: The login route exists when a signing key is configured

- **WHEN** the server runs with `AUTH_JWT_SECRET` set and `POST /auth/login` is
  requested with valid credentials
- **THEN** the response is `200` with a token

#### Scenario: The login route is absent without a signing key

- **WHEN** the server runs with `AUTH_JWT_SECRET` unset and `POST /auth/login`
  is requested
- **THEN** the response is `404`

#### Scenario: The login route answers preflight

- **WHEN** an `OPTIONS /auth/login` request arrives from a configured allowed
  origin while the route is registered
- **THEN** the response carries the same CORS headers as the other routes

### Requirement: Every route rejects a missing or invalid bearer token when the JWT resolver is active

When the JWT resolver is the wired `ActorResolver`, every route other than
`POST /auth/login`, `GET /livez`, and `GET /readyz` SHALL respond `401`
with `error.type` equal to `"actor-resolution"` for a request carrying no
`Authorization` header, an expired token, a wrongly-signed token, or a
token from an unconfigured issuer, and SHALL invoke no Runtime API Layer
operation for such a request. `GET /livez` and `GET /readyz` resolve no
actor at all, so they answer identically whether or not the JWT resolver
is active.

#### Scenario: A route without a token is 401

- **WHEN** the JWT resolver is active and any route other than `GET
  /livez` or `GET /readyz` is requested with no `Authorization` header
- **THEN** the response is `401` with `error.type` equal to
  `"actor-resolution"`

#### Scenario: A route with a valid token is 200

- **WHEN** the JWT resolver is active and a route is requested with a valid
  bearer token
- **THEN** the request proceeds and returns that route's normal success status

#### Scenario: Legacy actor headers are not accepted when the JWT resolver is active

- **WHEN** the JWT resolver is active and a route is requested with only
  `X-Actor-Id` and `X-Actor-Roles`
- **THEN** the response is `401`

#### Scenario: livez and readyz stay open when the JWT resolver is active

- **WHEN** the JWT resolver is active and `GET /livez` or `GET /readyz` is
  requested with no `Authorization` header
- **THEN** the response is not `401`, and reflects that route's own success
  criteria instead

### Requirement: The HTTP server declares a maximum request body size

`Bun.serve` SHALL be given an explicit `maxRequestBodySize`, sized to the
largest plausible legitimate request (a definition or draft of a few
megabytes), rather than inheriting Bun's 128 MiB default.

The default is the only bound that exists today between an HTTP caller and
persisted state: no route narrows it, `saveDraft` deliberately validates only
its envelope, and a submitted value on a `file`- or plugin-typed field passes
the runtime type check without a size constraint an author could even declare.
This requirement covers the transport edge only — it does not claim to bound
what a body may contain once accepted.

An over-size request SHALL be refused by the server before any route handler
runs; the refusal is a transport-level failure, not a typed engine error.

#### Scenario: An ordinary request is unaffected

- **WHEN** any route is called with a realistic body — a definition, a draft,
  a submission
- **THEN** it is processed exactly as before

#### Scenario: An over-size request is refused

- **WHEN** a request body exceeds the configured maximum
- **THEN** the server refuses it without invoking a route handler, and nothing
  is written

#### Scenario: The limit is a single declared value

- **WHEN** the server is constructed
- **THEN** the maximum is declared in one place in the composition root, so
  the bound that applies to publish, draft save and submission is the same
  reviewable number

### Requirement: Request bodies are parsed, never cast

Every route that reads a JSON request body SHALL parse it against a schema
and raise `RequestShapeError` (400) on a mismatch, including when the body is
not valid JSON at all. No route SHALL cast a parsed body to a type without
checking it.

Today `POST /processes/:processId/instances` and
`POST /instances/:instanceId/submit` both cast. The consequences are traced:
a submit with no `data` reaches the validator, whose `Object.keys(data)`
throws a `TypeError` mapped to 500; and malformed JSON throws a `SyntaxError`
mapped to 500 — while `POST /processes` and `POST /auth/login` map exactly the
same condition to 400. The same client error therefore produces different
statuses on different routes, which makes an operator unable to distinguish an
engine defect from a bad request, and fires server-fault alerts on caller
mistakes.

The parse SHALL be shallow: it checks the envelope the route destructures
(`pathId` present and a string; `data` an object, defaulting to empty;
`version` a positive integer when present). Field-level validation stays in
the Runtime API Layer, so a rule is not defined in two places.

#### Scenario: A submit with no pathId is a 400

- **WHEN** `POST /instances/:instanceId/submit` is called with a body lacking
  `pathId`
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`,
  and nothing is written

#### Scenario: A submit with no data is a 400

- **WHEN** the same route is called with a `pathId` but no `data`
- **THEN** the response is `400` — or the body is accepted with an empty
  `data`, per the declared default — never a `500`

#### Scenario: Malformed JSON is a 400 on every route

- **WHEN** any body-reading route is called with a body that is not valid JSON
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`,
  the same answer `POST /processes` and `POST /auth/login` already give

#### Scenario: A create with a malformed version is a 400

- **WHEN** `POST /processes/:processId/instances` is called with `version` as
  a string, a negative number or a non-integer
- **THEN** the response is `400`

### Requirement: A malformed pagination cursor is a client error

A `cursor` query parameter SHALL be validated before use: it is base64url of a
JSON array of strings of the arity its route encodes. A cursor that fails to
decode, fails to parse, or decodes to a different shape SHALL raise
`RequestShapeError` (400).

A cursor is client-controlled input that is currently `JSON.parse`d without a
check and whose elements are interpolated into Postgres casts, so a
truncated, URL-mangled or hand-edited cursor answers `500` on routes a UI
drives on every scroll — and the `internal` type prevents an operator from
telling a bad cursor from an engine fault.

Validation SHALL be shallow, and a cursor whose *values* are stale or point
past the end SHALL remain a legitimate empty page rather than an error —
keyset pagination has always had that property.

The encode/decode helper pair SHALL exist once and be imported by both
callers, rather than being fixed in each of its two current copies.

#### Scenario: A non-base64 cursor is a 400

- **WHEN** `GET /instances?cursor=%%%` is requested
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`

#### Scenario: A well-formed but wrong-shaped cursor is a 400

- **WHEN** a cursor decodes to valid JSON that is not an array of the expected
  number of strings
- **THEN** the response is `400`

#### Scenario: A stale cursor is still a valid request

- **WHEN** a cursor is well-formed but points past the end of the result set
- **THEN** the response is `200` with an empty page, unchanged from today

#### Scenario: Both paginated surfaces behave identically

- **WHEN** a malformed cursor is sent to the instance listing and to an
  admin-queries-backed listing
- **THEN** both answer `400`, because both use the same validated helper
