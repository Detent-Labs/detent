# http-wrapper Specification

## Purpose

A thin REST/JSON adapter over the Runtime API Layer's three operations
(`createProcessInstance`, `getInstanceView`, `submitAndTransition`), exposing
them as HTTP routes with no added transport-level semantics beyond error
mapping. It performs no auth/actor resolution (the caller supplies the actor
directly, trusted as given, matching the Runtime API Layer's own behavior)
and no assignment/claim enforcement. It keeps the engine's background workers
(timer, outbox-delivery, re-resolution) running for the lifetime of the
server process.

## Requirements

### Requirement: Create a process instance over HTTP

`POST /processes/:processId/instances` SHALL accept a JSON body
`{ actor: {id, roles}, version?, data? }`, call
`createProcessInstance(processId, actor, {version, data})`, and on success
return `201 Created` with the resulting `Instance` as the JSON body, with no
response envelope.

#### Scenario: Creating an instance with no data seed
- **WHEN** a `POST /processes/:processId/instances` request carries a body
  with only `actor` and no `data`
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

`GET /instances/:instanceId` SHALL call
`getInstanceView(instanceId, actor)`, resolving `actor` from query
parameters (`actorId`, and `roles` as a comma-separated list, defaulting to
`[]` when absent), and on success return `200 OK` with the resulting
`InstanceView` as the JSON body, with no response envelope.

#### Scenario: Viewing an instance with no roles
- **WHEN** a `GET /instances/:instanceId?actorId=user_1` request omits
  `roles`
- **THEN** `getInstanceView` is called with `actor.roles` equal to `[]`

#### Scenario: Viewing an instance with multiple roles
- **WHEN** a `GET /instances/:instanceId?actorId=user_1&roles=employee,finance-approver`
  request is made
- **THEN** `getInstanceView` is called with `actor.roles` equal to
  `["employee", "finance-approver"]`

#### Scenario: Viewing a non-running instance still resolves
- **WHEN** `GET /instances/:instanceId` targets a `completed`, `cancelled`,
  or `faulted` instance
- **THEN** the response is `200` with an `InstanceView` whose `status`
  reflects that state and whose `availablePaths` is empty

### Requirement: Submit data and trigger a manual transition over HTTP

`POST /instances/:instanceId/submit` SHALL accept a JSON body
`{ actor: {id, roles}, pathId, data }`, call
`submitAndTransition(instanceId, pathId, data, actor)`, and on success
return `200 OK` with the resulting `Instance` as the JSON body, with no
response envelope.

#### Scenario: A valid submission commits and returns the updated instance
- **WHEN** a `POST /instances/:instanceId/submit` request carries `data`
  that passes validation and a `pathId` whose guard holds
- **THEN** the response is `200` and the body is the `Instance` reflecting
  the committed data and the new step

### Requirement: The caller supplies the actor directly; this is not an auth mechanism

The actor-passing mechanism (JSON body field for the two write routes,
query parameters for the read route) SHALL NOT resemble or be documented as
authentication. The HTTP layer SHALL trust whatever actor a caller
supplies, matching the Runtime API Layer's own behavior, and SHALL perform
no session, token, or credential verification of any kind.

#### Scenario: Any syntactically valid actor is accepted
- **WHEN** a request supplies any `actor` shape matching `{id: string,
  roles: string[]}`, regardless of whether that actor "exists" anywhere
- **THEN** the request is processed normally — no authentication check
  rejects it

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
- **WHEN** any of the three routes returns a successful response
- **THEN** the response includes `Access-Control-Allow-Origin: *`

#### Scenario: An error response carries the CORS header
- **WHEN** any of the three routes returns an error response (4xx or 5xx)
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
