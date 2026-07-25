## MODIFIED Requirements

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

### Requirement: The added write routes are unauthenticated under the shipped resolver

Publish and cancel are state-changing routes that this change deliberately
does not authorize beyond resolving an actor through the injected
`ActorResolver`. With the non-production `devHeaderResolver`, any caller may
present any actor id, so any caller may publish a process definition or cancel
any instance. With the JWT resolver active, a caller must present a verifiable
token — but every *authenticated* actor still retains these permissions, since
authorization is a separate capability. The wrapper SHALL keep the resolver
seam as the single place where that changes, and SHALL NOT introduce a
route-specific authorization mechanism of its own.

#### Scenario: A cancel request under the dev resolver succeeds for any actor

- **WHEN** the cancel route is requested with an arbitrary actor id header
- **THEN** the request succeeds
- **AND** the resolved actor is recorded as the cause of the cancellation

#### Scenario: A publish request under a rejecting resolver is refused

- **WHEN** the server is configured with a resolver that rejects the credential
- **AND** the publish route is requested
- **THEN** the response is 401 and nothing is published

#### Scenario: An authenticated actor may still publish

- **WHEN** the JWT resolver is active and the publish route is requested with a
  valid token from any account
- **THEN** the request succeeds, because no authorization check gates it

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
active") — this was previously the one added-read route with no actor
resolution at all; it is brought in line with the rest.

The response SHALL carry the page of summaries and the next cursor, with the
cursor absent on the last page.

#### Scenario: Listing with no query parameters

- **WHEN** `GET /instances` is requested with a resolvable credential
- **THEN** the response is 200 and carries every instance summary, subject to the default limit

#### Scenario: Listing an actor's inbox

- **WHEN** `GET /instances?assignedTo=user-1&status=running` is requested with a resolvable credential
- **THEN** the response carries only running instances claimed by, or claimable by, `user-1`

#### Scenario: Repeating the status parameter widens the filter

- **WHEN** `GET /instances?status=running&status=cancelled` is requested with a resolvable credential
- **THEN** instances of both statuses are returned

#### Scenario: Paging over HTTP

- **WHEN** `GET /instances?limit=2` is requested with a resolvable credential and more than two instances exist
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

An unknown instance id SHALL return 200 with an empty sequence, consistent
with the read itself and with the wrapper's existing choice not to invent
404s for absent instances — but only once the actor resolves; an
unresolvable credential is still rejected before the read runs.

#### Scenario: Reading a record

- **WHEN** `GET /instances/:id/record` is requested with a resolvable credential for an instance that has transitioned
- **THEN** the response is 200 and carries the merged, ordered record

#### Scenario: Reading the record of an unknown instance

- **WHEN** `GET /instances/:id/record` is requested with a resolvable credential for an id that does not exist
- **THEN** the response is 200 with an empty sequence

#### Scenario: An unresolvable credential is rejected regardless of whether the instance exists

- **WHEN** `GET /instances/:id/record` is requested with no resolvable credential
- **THEN** the response is 401, whether or not `:id` names a real instance

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

## ADDED Requirements

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
`POST /auth/login` SHALL respond `401` with `error.type` equal to
`"actor-resolution"` for a request carrying no `Authorization` header, an
expired token, a wrongly-signed token, or a token from an unconfigured issuer,
and SHALL invoke no Runtime API Layer operation for such a request.

#### Scenario: A route without a token is 401

- **WHEN** the JWT resolver is active and any route is requested with no
  `Authorization` header
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
