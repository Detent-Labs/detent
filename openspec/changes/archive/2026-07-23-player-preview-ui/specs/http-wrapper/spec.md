## ADDED Requirements

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
