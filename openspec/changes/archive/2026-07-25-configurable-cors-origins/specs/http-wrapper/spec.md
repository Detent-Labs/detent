## REMOVED Requirements

### Requirement: HTTP wrapper responses carry permissive CORS headers

**Reason**: The wildcard origin was a development convenience written into
the contract as an unconditional rule. It cannot stay unconditional on a
reachable deployment: `*` lets any web page call this API from a visitor's
browser, which becomes a CSRF surface the moment a credential-bearing
resolver (cookie/session) replaces the shipped header-based dev resolver.
Replaced by "HTTP wrapper responses carry configured CORS headers" below,
which keeps the same behavior available as an explicit opt-in.

**Migration**: A deployment or dev setup that relied on the implicit
wildcard sets `CORS_ALLOWED_ORIGINS=*` to keep today's behavior verbatim, or
better, lists its actual frontend origins. Leaving it unset emits no CORS
headers, which affects browser cross-origin callers only — same-origin
frontends and every non-browser client are unaffected.

## ADDED Requirements

### Requirement: HTTP wrapper responses carry configured CORS headers

The set of browser origins the HTTP wrapper permits SHALL be configuration,
injected into `createServer` and supplied by `startHttpServer` from the
`CORS_ALLOWED_ORIGINS` environment variable — the same composition-root
convention `DATABASE_URL` and `PORT` already follow.

The configured value SHALL select exactly one of three behaviors, applied
uniformly to every response on every route, success and error alike:

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

## MODIFIED Requirements

### Requirement: HTTP wrapper answers CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS` requests to each of its routes as a
CORS preflight: respond `204 No Content` with `Access-Control-Allow-Methods`
listing the route's actual method, `Access-Control-Allow-Headers` including
`Content-Type`, and the `Access-Control-Allow-Origin` header determined by
the configured allowed origins exactly as an ordinary response's is — without
invoking the underlying Runtime API Layer operation.

A preflight from an origin the configuration does not permit SHALL still
answer `204` and SHALL omit the origin header, rather than returning an error
status: the browser blocks the real request on the missing header, and
preflight handling stays uniform across every route and every configuration.

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
