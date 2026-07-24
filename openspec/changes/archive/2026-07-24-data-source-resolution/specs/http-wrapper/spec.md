## MODIFIED Requirements

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
credential from the request (a transport detail: header values, for the
shipped dev resolver), call the injected resolver, and pass the resulting
`Actor` into the underlying Runtime API Layer call. A route SHALL NO LONGER
accept an `actor` field directly in its request body or query parameters as
a trusted value; the resolved `Actor` is authoritative. A resolver that
throws `ActorResolutionError` SHALL short-circuit the route before any
Runtime API Layer call. The dev header-based resolver shipped alongside this
capability is documented as non-production — trusting unsigned headers is
not itself authentication — but it replaces the previous behavior of
trusting a client-supplied `actor` field with a swappable, explicit
extension point.

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
