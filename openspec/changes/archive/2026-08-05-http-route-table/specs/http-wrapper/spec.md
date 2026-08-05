## MODIFIED Requirements

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
