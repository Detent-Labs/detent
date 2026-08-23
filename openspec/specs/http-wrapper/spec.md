<!-- antislop: allow-file passive-voice -->
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

### Requirement: Save an instance form draft over HTTP

`PUT /instances/:instanceId/draft` SHALL resolve the actor via the injected
`ActorResolver`. It SHALL accept a JSON body `{ data }` and call
`saveInstanceDraft(instanceId, data, actor)`. On success it SHALL return
`200 OK` with the saved draft's `{ updatedBy, updatedAt }` as the JSON body,
with no response envelope. An absent `data` field SHALL default to `{}`, the
same default the submit route's body schema applies. The route SHALL map the
runtime operation's errors the same way the submit route maps its own.

#### Scenario: A claimant's draft saves

- **WHEN** a `PUT /instances/:instanceId/draft` request resolves to the
  current claimant and carries a data object
- **THEN** the response is `200` and the body carries the saving actor and the
  save time

#### Scenario: An unresolvable credential is rejected before the operation

- **WHEN** a `PUT /instances/:instanceId/draft` request carries no resolvable
  credential
- **THEN** the route short-circuits before calling `saveInstanceDraft`

#### Scenario: A non-object data body is refused

- **WHEN** a `PUT /instances/:instanceId/draft` request carries a data body
  that is not a JSON object
- **THEN** the response is `400` and the runtime stores no draft

#### Scenario: A missing data field saves an empty draft

- **WHEN** a `PUT /instances/:instanceId/draft` request carries a body with no
  `data` field
- **THEN** the route treats `data` as `{}` and saves an empty draft for the
  instance's current step

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

The HTTP wrapper SHALL answer an `OPTIONS` request to any of its routes as a
CORS preflight. The answer is `204 No Content`. It carries
`Access-Control-Allow-Methods` listing the route's own methods, and
`Access-Control-Allow-Headers` including `Content-Type`. Its
`Access-Control-Allow-Origin` header follows the configured allowed origins,
exactly as an ordinary response's header does. The wrapper SHALL NOT invoke
the underlying Runtime API Layer operation.

The rule covers every route the wrapper answers. That includes the four
`/reporting/*` routes.

`GET /livez`, `GET /readyz` and `GET /metrics` are the exceptions. None of
the three registers an `OPTIONS` handler. A health probe and a metrics scrape
send no preflight. An `OPTIONS` request to any of the three paths SHALL fall
through to the wrapper's ordinary unmatched-route answer.

A preflight from an origin the configuration does not permit SHALL still
answer `204`, and SHALL omit the origin header. An error status would break
the uniform handling every other route and every configuration share. The
browser blocks the real request on the missing header anyway.

#### Scenario: Preflighting the create-instance route
- **WHEN** a browser sends `OPTIONS /processes/:processId/instances`
- **THEN** the response is `204` with the CORS headers
- **AND** `createProcessInstance` never runs

#### Scenario: Preflighting the get-instance-view route
- **WHEN** a browser sends `OPTIONS /instances/:instanceId`
- **THEN** the response is `204` with the CORS headers
- **AND** `getInstanceView` never runs

#### Scenario: Preflighting the submit route
- **WHEN** a browser sends `OPTIONS /instances/:instanceId/submit`
- **THEN** the response is `204` with the CORS headers
- **AND** `submitAndTransition` never runs

#### Scenario: Preflighting a reporting route
- **WHEN** a browser sends `OPTIONS /reporting/processes` or
  `OPTIONS /reporting/:processId/cycle-time`
- **THEN** the response is `204` with `Access-Control-Allow-Methods: GET` and
  the other CORS headers
- **AND** no reporting query runs

#### Scenario: A preflight from a disallowed origin omits the origin header
- **WHEN** the configuration holds an allowlist, and a browser sends an
  `OPTIONS` request whose `Origin` is not on it
- **THEN** the response is `204` with `Access-Control-Allow-Methods` and
  `Access-Control-Allow-Headers`, and no `Access-Control-Allow-Origin`
- **AND** the underlying Runtime API Layer operation never runs

#### Scenario: An OPTIONS request to livez is not a preflight

- **WHEN** a probe sends `OPTIONS /livez`
- **THEN** the response is the wrapper's ordinary unmatched-route answer,
  not a `204` preflight answer

#### Scenario: An OPTIONS request to readyz is not a preflight

- **WHEN** a probe sends `OPTIONS /readyz`
- **THEN** the response is the wrapper's ordinary unmatched-route answer,
  not a `204` preflight answer

#### Scenario: An OPTIONS request to metrics is not a preflight

- **WHEN** a scraper sends `OPTIONS /metrics`
- **THEN** the response is the wrapper's ordinary unmatched-route answer,
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
values are `"mine"`, `"started"` and `"all"`; any other value SHALL be rejected
as a request error. An omitted `scope` SHALL resolve to `"all"` — that is what
an omitted `scope` has always meant — rather than defaulting to `"mine"`, so an
existing request's meaning is never silently narrowed.

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

`scope=started` needs no role either. The wrapper SHALL derive `startedBy`
from the resolved actor rather than from a query parameter. It SHALL reject a
request combining `scope=started` with an explicit `startedBy` value as a
request error, the rule `scope=mine` already carries for `assignedTo`.

`scope=started` SHALL add no assignment predicate of its own. An instance the
actor started matches whatever its current step's assignment says, and
whatever its status is. The engine already authorizes that actor to read each
one. The scope therefore lists what a `GET /instances/:id` would answer for.

An explicit `assignedTo` SHALL still narrow the page conjunctively, as it does
under `scope=all`. It reaches nothing outside what the caller started, so it
needs no role of its own.

The response SHALL carry the page of summaries and the next cursor, with the
cursor absent on the last page.

`scope=all` SHALL set `instance-query`'s `includeDegraded` filter, since that
scope already requires `ADMIN_ROLE`. An instance whose summary cannot be
produced then comes back as a degraded item, per that capability's own
requirement. Neither `scope=mine` nor `scope=started` SHALL set it. An
instance whose summary cannot be produced under either scope is absent from
the page instead. No degraded item represents it, and the response still
carries no error over it.

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

#### Scenario: An admin-scoped listing surfaces a degraded item

- **WHEN** `GET /instances` (or `?scope=all`) is requested with a resolvable
  credential holding `system:admin`
- **AND** one matched instance's summary cannot be produced
- **THEN** the response is 200
- **AND** that instance's item is a degraded summary
- **AND** every other instance in the page returns as a normal summary

#### Scenario: A scope=mine listing never surfaces a degraded item

- **WHEN** `GET /instances?scope=mine` is requested with a resolvable
  credential
- **AND** one instance among that actor's own assignments has a summary that
  cannot be produced
- **THEN** the response is 200
- **AND** that instance is absent from the page
- **AND** no item in the page is a degraded summary

#### Scenario: scope=started needs no role

- **WHEN** `GET /instances?scope=started` is requested with a resolvable
  credential holding no reserved role
- **THEN** the response is 200 and carries the instances that actor started

#### Scenario: scope=started rejects an explicit startedBy

- **WHEN** `GET /instances?scope=started&startedBy=user-1` is requested with a
  resolvable credential
- **THEN** the response is a request error, and neither value is applied

#### Scenario: scope=started ignores the assignment

- **WHEN** an actor started an instance whose current step names another actor
  as its only candidate
- **AND** that actor requests `GET /instances?scope=started`
- **THEN** the page carries that instance

#### Scenario: scope=started carries a finished case

- **WHEN** an actor started an instance that has since completed, and another
  that has since been cancelled
- **AND** that actor requests `GET /instances?scope=started`
- **THEN** the page carries both

#### Scenario: scope=started never carries another actor's case

- **WHEN** two actors have each started an instance
- **AND** one of them requests `GET /instances?scope=started`
- **THEN** the page carries that actor's own instance alone

#### Scenario: A degraded summary is absent under scope=started

- **WHEN** `GET /instances?scope=started` is requested with a resolvable
  credential
- **AND** one instance that actor started has a summary that cannot be produced
- **THEN** the response is 200
- **AND** that instance is absent from the page
- **AND** no item in the page is a degraded summary

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

The HTTP wrapper SHALL expose `POST /processes`. It SHALL accept an authored
process body, and SHALL publish it through the existing publish operation of
the definition store. The response SHALL carry `processId`, `version`,
`definitionHash` and `status`.

Publishing SHALL need `can(actor, "publish", processId, db)` to answer true.
The `authorization` capability states the two tests behind that answer. The
global `system:publish` role admits every process. A stored grant of
`"publish"` scoped to this `processId` admits this one. The gate SHALL put the
question through `await requirePermission(actor, "publish", processId, db)`,
and SHALL NOT read `Actor.roles` itself.

That call needs the target process id, and the request body carries it. The
gate SHALL therefore run after the body parse and the shape check. It SHALL run
before anything else.

The shape check proves only that the body's `processId` is a string. The
publish chain checks the `proc_` prefix later. The gate SHALL NOT treat that
string as a process the store already holds.

The property that the earlier ordering protected SHALL hold. A caller the gate
refuses SHALL never reach the definition store, the registry, or the CEL
check. Such a call SHALL consume no version and SHALL persist no definition.

One response changes. Take a caller the gate refuses. Two bodies from that
caller now read 400 rather than 403:

- a body that is not valid JSON
- a body of the wrong shape

That answer discloses nothing about the installation, because the caller wrote
the body. Every other publish response SHALL stay as it is.

Publishing SHALL run the unchanged publish-time validation chain: authored
schema, duration bounds, action registry, CEL, and cross-process. The check
SHALL resolve against the server's own injected registry. A client SHALL NOT be
able to supply or extend that registry.

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
  `Actor.roles` omits `system:publish`
- **AND** no grant admits that actor for that `processId`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** no definition is persisted, even if the request body would
  otherwise have been valid

#### Scenario: A grant admits a caller without the global role

- **WHEN** `POST /processes` is requested by an actor lacking `system:publish`
- **AND** the store holds a grant of `"publish"` to a role that actor holds
- **AND** that grant is scoped to the body's `processId`
- **THEN** the engine authorizes the publish

#### Scenario: That same grant admits no other process

- **WHEN** that same actor publishes a body naming a different `processId`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`

#### Scenario: A malformed body from an unauthorized caller reports the body

- **WHEN** `POST /processes` is requested with a body that is not valid JSON,
  by an actor the gate would refuse
- **THEN** the response is 400 with a typed error body
- **AND** no definition is persisted

#### Scenario: The gate still precedes the publish chain

- **WHEN** `POST /processes` is requested with a well-formed body by an actor
  whose resolved `Actor.roles` omits `system:publish`
- **AND** no grant admits that actor
- **THEN** the response is 403
- **AND** the definition store, the action registry and the CEL check are never
  reached

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

### Requirement: Post a comment on an instance over HTTP

`POST /instances/:instanceId/comments` SHALL resolve the actor via the
injected `ActorResolver`. It SHALL parse the JSON body against `{ text:
string }`, with `text` non-empty after trim and no longer than
`MAX_COMMENT_LENGTH` (10,000 characters). On success it SHALL call
`postComment(instanceId, actor, text)` and return `201` with the created
comment as the JSON body, with no response envelope. An empty, missing,
or over-length `text` SHALL be rejected as a `RequestShapeError`, mapped
to `400`. This matches `/delegate`'s existing treatment of a missing
`toActorId`.

#### Scenario: A successful post returns 201

- **WHEN** a `POST /instances/:instanceId/comments` request resolves to
  an actor who may read the instance, with valid, non-empty text in the
  body
- **THEN** the response is `201` with the created comment

#### Scenario: Empty text is a request-shape error

- **WHEN** a `POST /instances/:instanceId/comments` request body's
  `text` is empty or whitespace-only after trim
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `postComment` is not called

### Requirement: List an instance's comments over HTTP

`GET /instances/:instanceId/comments` SHALL resolve the actor via the
injected `ActorResolver` and accept `limit`/`cursor` query parameters,
the same shape `GET /instances/:instanceId/record` already accepts. It
SHALL call `listComments(instanceId, actor, { limit, cursor })` and
return `200` with the resulting page as the JSON body.

#### Scenario: A successful list returns 200 with a page

- **WHEN** a `GET /instances/:instanceId/comments` request resolves to
  an actor who may read the instance
- **THEN** the response is `200` with a page of that instance's
  comments

### Requirement: An unauthorized actor gets 403 on either comment route

`AuthorizationError` thrown by `postComment` or `listComments` SHALL map
to `403` with `error.type` equal to `"authorization"`, the same mapping
every other instance-visibility check already uses.

#### Scenario: An unrelated actor is refused on both routes

- **WHEN** an actor who may not read the instance calls either
  `POST /instances/:instanceId/comments` or
  `GET /instances/:instanceId/comments`
- **THEN** the response is `403` with `error.type` equal to
  `"authorization"`

### Requirement: Both comment routes answer CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS /instances/:instanceId/comments`
requests as a CORS preflight, matching the existing claim, release, and
record routes. It SHALL respond `204 No Content` with the standard CORS
headers, without invoking `postComment` or `listComments`.

#### Scenario: Preflighting either comment route

- **WHEN** an `OPTIONS /instances/:instanceId/comments` request is made
- **THEN** the response is `204` with the CORS headers, and neither
  `postComment` nor `listComments` is invoked

### Requirement: Upload an attachment to an instance over HTTP

`POST /instances/:instanceId/attachments` SHALL resolve the actor via the
injected `ActorResolver`. It SHALL parse the JSON body against this
shape:
```
{ filename: string, contentType: string, dataBase64: string }
```
`filename` and `contentType` SHALL be non-empty and no longer than 255
characters each. `contentType` SHALL also match a MIME token pair: one
type and one subtype joined by `/`. Each half holds letters, digits and
the characters `.`, `+`, `-` and `_`. No other character passes. A value
that fails that match SHALL be a `RequestShapeError`, mapped to `400`.

The match rejects a CR or an LF byte. Without it, the download route
carries that byte into a response header. `dataBase64` SHALL be non-empty.
It SHALL decode
`dataBase64` and reject a decoded payload larger than
`MAX_ATTACHMENT_BYTES` as a `RequestShapeError`, mapped to `400`. On
success it SHALL call `uploadAttachment(instanceId,
actor, { filename, contentType, data, sizeBytes })`. It SHALL return
`201` with the created attachment's metadata as the JSON body, without
`data`.

The system SHALL read `MAX_ATTACHMENT_BYTES` once, when the module holding
it loads. It SHALL refuse to start when that value is present and is not a
positive integer. A mistyped limit SHALL NOT resolve to no limit at all.

#### Scenario: A successful upload returns 201

- **WHEN** a `POST /instances/:instanceId/attachments` request resolves
  to an actor who may read the instance, with a body under
  `MAX_ATTACHMENT_BYTES` once decoded
- **THEN** the response is `201` with the created attachment's metadata,
  and the body does not include `data`

#### Scenario: An oversized upload is a request-shape error

- **WHEN** a `POST /instances/:instanceId/attachments` request body's
  `dataBase64`, once decoded, exceeds `MAX_ATTACHMENT_BYTES`
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `uploadAttachment` is not called

#### Scenario: An over-length filename or contentType is a request-shape error

- **WHEN** a `POST /instances/:instanceId/attachments` request body's
  `filename` or `contentType` exceeds 255 characters
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `uploadAttachment` is not called

#### Scenario: A contentType outside the MIME token pair is a request-shape error

- **WHEN** a `POST /instances/:instanceId/attachments` request body's
  `contentType` is `"text/html; charset=utf-8\r\nX-Injected: 1"`, or any
  other value outside the token pair
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `uploadAttachment` is not called

#### Scenario: A malformed byte limit stops the process

- **WHEN** the deployment sets `MAX_ATTACHMENT_BYTES` to `"5MB"`
- **THEN** the process fails at load with a message naming the variable,
  and no request runs with the limit absent

### Requirement: List an instance's attachments over HTTP

`GET /instances/:instanceId/attachments` SHALL resolve the actor via the
injected `ActorResolver` and accept `limit`/`cursor` query parameters, the
same shape `GET /instances/:instanceId/comments` already accepts. It
SHALL call `listAttachments(instanceId, actor, { limit, cursor })` and
return `200` with the resulting page as the JSON body. No item in that
page SHALL include `data`.

#### Scenario: A successful list returns 200 with a page

- **WHEN** a `GET /instances/:instanceId/attachments` request resolves
  to an actor who may read the instance
- **THEN** the response is `200` with a page of that instance's
  attachment metadata

### Requirement: Download one attachment's bytes over HTTP

`GET /instances/:instanceId/attachments/:attachmentId` SHALL resolve the
actor via the injected `ActorResolver`. On success it SHALL call
`getAttachment(instanceId, attachmentId, actor)`. It SHALL return `200`
with the raw file bytes as the response body, and `content-type` set to
the stored `contentType`. This route does not return a JSON envelope.

The response SHALL also carry `Content-Disposition: attachment`, whose
`filename` parameter holds the stored filename, and
`X-Content-Type-Options: nosniff`. The first header makes the browser save
the bytes instead of rendering them. The second stops the browser from
guessing a type the upload did not declare. An uploaded HTML or SVG file
SHALL NOT run as a document on the engine's origin.

The `filename` parameter SHALL travel percent-encoded. A stored filename
holds up to 255 characters of any kind, a quote and a carriage return among
them. Encoding settles the header-injection question rather than answering
it per character.

#### Scenario: A successful download returns the raw bytes

- **WHEN** a `GET /instances/:instanceId/attachments/:attachmentId`
  request resolves to an actor who may read the instance
- **THEN** the response is `200`, its `content-type` matches the
  attachment's stored `contentType`, and its body is the raw file bytes

#### Scenario: A download arrives as a file, not as a document

- **WHEN** a `GET /instances/:instanceId/attachments/:attachmentId`
  request resolves to an actor who may read the instance, and the stored
  `contentType` is `text/html`
- **THEN** the response carries `Content-Disposition: attachment` with the
  stored filename and `X-Content-Type-Options: nosniff`

#### Scenario: A filename with a quote travels percent-encoded

- **WHEN** the stored filename carries a `"` character
- **THEN** the `Content-Disposition` header's `filename` parameter carries
  the percent-encoded form, not the raw character

### Requirement: `BINARY_ROUTES` declares every route that returns stored bytes

`src/http/server.ts` exports `BINARY_ROUTES`, the declared list of routes
that return stored bytes rather than a JSON envelope. Each entry states its
method, its pattern, and whether it carries a `filename`. A `filename` entry
sends `Content-Disposition: attachment`. `GET /metrics` carries none: it
returns binary bytes with no filename.

The suite SHALL assert every `BINARY_ROUTES` entry's response against its
declared shape. The route table decides binary-ness only at runtime, inside
each handler. A person keeps the ledger by hand instead: nothing derives it.
A route added outside `BINARY_ROUTES` needs that same person to add the
entry, the way `admin-routing.test.ts`'s own route list needs one.

`CLAUDE.md` names an `/admin/*` route collision among the defects that
shipped past a green suite. That is the same drift class. Only a per-route
list, kept in sync by hand, can hold that route-level fact.

#### Scenario: A ledger entry with a filename declares attachment

- **WHEN** the suite drives a `BINARY_ROUTES` entry marked `filename: true`
- **THEN** the response carries `Content-Disposition: attachment`

#### Scenario: A ledger entry with no filename declares nothing

- **WHEN** the suite drives a `BINARY_ROUTES` entry marked `filename: false`
- **THEN** the response carries no `Content-Disposition` header

#### Scenario: A JSON envelope declares nothing

- **WHEN** a route outside `BINARY_ROUTES` returns a JSON envelope
- **THEN** the response carries no `Content-Disposition` header

### Requirement: A missing or mismatched attachment surfaces the same as any other not-found

`NotFoundError` thrown by `getAttachment` SHALL map to `500`, the same
mapping every other not-found condition in this HTTP wrapper already
uses. This applies whether `attachmentId` does not exist, or exists but
belongs to a different instance than the one in the URL.

#### Scenario: A download for a mismatched attachment id returns 500

- **WHEN** a `GET /instances/:instanceId/attachments/:attachmentId`
  request resolves to an actor who may read `:instanceId`, but
  `:attachmentId` belongs to a different instance
- **THEN** the response is `500`, and no other instance's file bytes are
  returned

### Requirement: An unauthorized actor gets 403 on any attachment route

`AuthorizationError` thrown by `uploadAttachment`, `listAttachments`, or
`getAttachment` SHALL map to `403` with `error.type` equal to
`"authorization"`, the same mapping the comment routes already use.

#### Scenario: An unrelated actor is refused on every attachment route

- **WHEN** an actor who may not read the instance calls
  `POST /instances/:instanceId/attachments`,
  `GET /instances/:instanceId/attachments`, or
  `GET /instances/:instanceId/attachments/:attachmentId`
- **THEN** the response is `403` with `error.type` equal to
  `"authorization"`

### Requirement: Every attachment route answers CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS` requests on
`/instances/:instanceId/attachments` and
`/instances/:instanceId/attachments/:attachmentId` as CORS preflight,
matching the existing comment routes. It SHALL respond `204 No Content`
with the standard CORS headers, without invoking `uploadAttachment`,
`listAttachments`, or `getAttachment`.

#### Scenario: Preflighting an attachment route

- **WHEN** an `OPTIONS` request is made to either attachment route
- **THEN** the response is `204` with the CORS headers, and no Runtime
  API Layer operation is invoked

### Requirement: An unmatched GET or HEAD defers to static asset serving

The wrapper's terminal unmatched-route response SHALL first offer the request to
the `web-asset-serving` capability, and SHALL return the JSON 404 envelope only
when that capability declines. The deferral SHALL sit behind every API route, so
no URL prefix is reserved for assets and a later API route needs no special
case.

One case is ordered the other way. A `GET` or `HEAD` **navigation** request
SHALL be offered to `web-asset-serving` BEFORE any route matching, because an
area's URL prefix can be the same as an API prefix: `/admin/outbox`,
`/admin/timers` and `/admin/users` name both an admin screen and a `GET` admin
route. Without the reordering, a reload of those screens answers `401` JSON
instead of the shell. See the `web-asset-serving` capability for what counts as
a navigation.

The deferral applies to `GET` and `HEAD` only. Every other method keeps today's
JSON 404 envelope unchanged.

Static asset serving is not a route. The requirement that every route rejects a
missing or invalid bearer token when the JWT resolver is active does not reach
it: the wrapper resolves no actor on either path, exactly as it resolves none
for today's terminal 404.

#### Scenario: An unmatched GET reaches the static branch

- **WHEN** a `GET` request matches no API route and a web root is configured
- **THEN** the wrapper answers from `web-asset-serving`, and resolves no actor
  while doing so

#### Scenario: An unmatched POST keeps the JSON 404

- **WHEN** a `POST` request matches no API route
- **THEN** the response is `404` with `error.type` equal to `"not-found"`,
  whatever the web root holds

#### Scenario: An API route still wins over a file of the same name

- **WHEN** `GET /processes` arrives without `Sec-Fetch-Mode: navigate` and a
  file named `processes` also exists under the web root
- **THEN** the API route answers, and the file is not served

#### Scenario: A navigation wins over a colliding API route

- **WHEN** `GET /admin/outbox` arrives with `Sec-Fetch-Mode: navigate` and a web
  root is configured
- **THEN** the shell document answers, and the admin route does not

### Requirement: The HTTP server shuts down gracefully on SIGTERM or SIGINT

<!-- antislop: allow synonym-rotation -->
When the process started via `import.meta.main` receives SIGTERM or SIGINT,
the server SHALL run an orderly shutdown. It SHALL NOT exit at once. It
SHALL stop accepting new HTTP connections and let in-flight requests
finish. It SHALL then stop the engine's background pollers, close the
database connection pool, and exit with code 0. A second SIGTERM or SIGINT
received while shutdown is already in progress SHALL NOT start a second
shutdown sequence.

#### Scenario: SIGTERM triggers an orderly shutdown

- **WHEN** the running server process receives SIGTERM
- **THEN** it stops accepting new HTTP connections and lets in-flight
  requests complete
- **AND** it then stops the engine's background pollers and closes the
  database pool
- **AND** it exits with code 0

#### Scenario: SIGINT follows the same shutdown sequence

- **WHEN** the running server process receives SIGINT
- **THEN** it follows the same shutdown sequence as SIGTERM

#### Scenario: A repeated signal during shutdown starts no second sequence

- **WHEN** a second SIGTERM or SIGINT arrives while shutdown is already in
  progress
- **THEN** the server ignores it and continues the shutdown already running

### Requirement: JSON responses forbid a shared cache

Every JSON envelope this HTTP wrapper returns SHALL carry
`Cache-Control: no-store`. An instance view, an instance record and a comment
list all hold data a participant supplied. No intermediary may keep a copy of
it. This applies to an error envelope as well as to a success envelope.

The attachment download is not a JSON envelope. It carries its own headers, in
the download requirement below.

`GET /livez` and `GET /readyz` answer with a JSON envelope, so they carry the
header too. A probe ignores it, and the rule stays one rule.

#### Scenario: A success envelope forbids a cache

- **WHEN** a client sends any request this wrapper answers with a JSON envelope
- **THEN** the response carries `Cache-Control: no-store`

#### Scenario: An error envelope forbids a cache

- **WHEN** a request fails and the wrapper answers with an error envelope
- **THEN** the response carries `Cache-Control: no-store`

### Requirement: A delegation to an unknown target maps to 422

`UnknownDelegateError` thrown by `delegateClaim` SHALL map to `422` with
`error.type` equal to `"unknown-delegate"`. The response SHALL carry the
error's message, which names the target id.

Every typed Runtime API Layer error has a status in `src/http/errors.ts`. An
error with no entry there falls to `500` with a message-free body. That body
tells an operator nothing about a target they mistyped.

`422` is the status this wrapper already gives a request whose shape is
right. The engine refuses its content, not its shape.

The browser package (`packages/web/src/api`) SHALL carry the same type. The
screen offering delegation then prints the message. It does not print a
generic internal error.

#### Scenario: An unknown delegate target maps to 422

- **WHEN** the claimant calls `POST /instances/:instanceId/delegate` from a
  deployment whose own actor ids resolve in the local account directory
- **AND** the `toActorId` it names does not resolve there
- **THEN** the response is `422` with `error.type` equal to
  `"unknown-delegate"`, and the body carries a message naming the target

#### Scenario: A non-claimant still gets 403

- **WHEN** a caller who does not hold the claim calls
  `POST /instances/:instanceId/delegate` with a `toActorId` the directory
  does not hold
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`, unchanged by the target

### Requirement: A route handler takes its database from the request, not from construction

`createServer` SHALL still build the route table once. Each handler SHALL take
the database as a parameter the dispatcher supplies per request. No handler
SHALL capture a handle from the enclosing scope.

The handler signature already carries a parameter only one route reads. A
handler needing no database declares no such parameter. That is how a handler
needing no client address already behaves.

With SaaS mode off the dispatcher SHALL supply the process database on every
request. That is the handle those closures captured before, so nothing
changes.

#### Scenario: The dispatcher supplies the database

- **WHEN** a request reaches a route handler
- **THEN** that handler receives the database its request resolved to

#### Scenario: A single-tenant deployment behaves as before

- **WHEN** the server runs with SaaS mode off
- **THEN** every handler receives the process database
- **AND** every existing route answers as it did before this change
