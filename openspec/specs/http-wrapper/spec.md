# http-wrapper Specification

## Purpose

A thin REST/JSON adapter over the Runtime API Layer's five operations
(`createProcessInstance`, `getInstanceView`, `submitAndTransition`,
`claimStep`, `releaseClaim`), exposing them as HTTP routes with no added
transport-level semantics beyond actor resolution and error mapping. Actor
resolution is delegated to an injected `ActorResolver` (see the
`actor-resolution` capability) — the caller supplies a credential (header
values, for the shipped dev resolver), never a trusted actor directly.
Assignment/claim enforcement itself is not implemented here; this capability
only maps the Runtime API Layer's own enforcement errors to HTTP statuses.
It keeps the engine's background workers (timer, outbox-delivery,
re-resolution) running for the lifetime of the server process.

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
`resolveBody` injection. For every route, middleware SHALL extract a
credential from the request (a
transport detail: header values, for the shipped dev resolver), call the
injected resolver, and pass the resulting `Actor` into the underlying
Runtime API Layer call. A route SHALL NO LONGER accept an `actor` field
directly in its request body or query parameters as a trusted value; the
resolved `Actor` is authoritative. A resolver that throws
`ActorResolutionError` SHALL short-circuit the route before any Runtime API
Layer call. The dev header-based resolver shipped alongside this capability
is documented as non-production — trusting unsigned headers is not itself
authentication — but it replaces the previous behavior of trusting a
client-supplied `actor` field with a swappable, explicit extension point.

#### Scenario: A request with a resolvable credential succeeds
- **WHEN** a request to any of the five routes carries a credential the
  injected `ActorResolver` can resolve
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

### Requirement: Typed Runtime API Layer errors map to specific HTTP statuses

The HTTP layer SHALL map each of the following errors thrown by the Runtime
API Layer to the given HTTP status and body shape. Any other thrown value,
including the Runtime API Layer's own untyped `Error` instances (its
"instance not found" / "no published body for process..." cases), SHALL
map to `500` with `{ error: { type: "internal", message } }`.

| Thrown | Status | Body |
|---|---|---|
| `SubmissionValidationError` | `422` | `{ error: { type: "validation", issues } }` |
| `GuardRefused` | `409` | `{ error: { type: "guard-refused", message } }` |
| `ConcurrencyConflict` | `409` | `{ error: { type: "concurrency-conflict" } }` |
| `PinMismatch` | `500` | `{ error: { type: "internal", message } }` |
| `ActorResolutionError` | `401` | `{ error: { type: "actor-resolution", message } }` |
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

#### Scenario: An untyped "not found" error maps to 500, not 404
- **WHEN** a request targets an `instanceId` or `processId` that resolves
  to no stored instance or published definition, which the Runtime API
  Layer signals as a plain `Error`
- **THEN** the response is `500` with `error.type` equal to `"internal"`
  and `error.message` carrying the original error text — not `404`

#### Scenario: An unresolvable credential maps to 401
- **WHEN** a request's credential cannot be resolved by the injected
  `ActorResolver`
- **THEN** the response is `401` with `error.type` equal to
  `"actor-resolution"`

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

`startHttpServer()` SHALL, in addition to serving the three routes, call
the existing `startEngine` so the timer, outbox-delivery, and re-resolution
background workers run for as long as the server process is up. Without
this, an instance parked on a wait-state with a pending async action or
timer would never progress through the HTTP-driven flow.

#### Scenario: An async action enqueued via HTTP eventually settles
- **WHEN** a submission drives an instance onto a step whose `onEntry`
  enqueues an async action, and the server has been running long enough
  for a delivery pass
- **THEN** a subsequent `GET /instances/:instanceId` reflects the action's
  writeback and, if a guard now matches, the instance having advanced past
  that step — with no manual draining required by the caller

### Requirement: HTTP wrapper responses carry permissive CORS headers

Every response from the HTTP wrapper, on every route, SHALL include an
`Access-Control-Allow-Origin: *` header, so a browser `fetch` from any
origin (e.g. a locally-running editor dev server on a different port) is
not blocked by the browser's same-origin policy.

#### Scenario: A successful response carries the CORS header
- **WHEN** any of the five routes returns a successful response
- **THEN** the response includes `Access-Control-Allow-Origin: *`

#### Scenario: An error response carries the CORS header
- **WHEN** any of the five routes returns an error response (4xx or 5xx)
- **THEN** the response also includes `Access-Control-Allow-Origin: *`

### Requirement: HTTP wrapper answers CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS` requests to each of the three
routes as a CORS preflight: respond `204 No Content` with
`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods` listing
the route's actual method, and `Access-Control-Allow-Headers` including
`Content-Type`, without invoking the underlying Runtime API Layer
operation.

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
