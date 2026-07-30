<!-- antislop: allow-file passive-voice sentence-length em-dash run-ons synonym-rotation -->
<!-- The MODIFIED Requirements below reproduce openspec/specs/http-wrapper/spec.md's
     existing requirement text nearly verbatim, per the OpenSpec delta convention of
     copying the entire original block. That prose predates this repo's antislop
     convention; preserving it unchanged keeps the delta diff meaningful and the
     archived requirement text stable. -->

## ADDED Requirements

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

## MODIFIED Requirements

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
