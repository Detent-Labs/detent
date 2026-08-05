## ADDED Requirements

### Requirement: Route dispatch reads one table

The HTTP wrapper's dispatch SHALL match a request against one ordered table
of route entries. Each entry carries a method, a path pattern, and the
handler to call. Dispatch SHALL NOT restate a route's method or its path
shape in a per-route `if` branch.

The CORS preflight answer SHALL derive from that same table. An `OPTIONS`
request matches by path pattern alone. The answer's
`Access-Control-Allow-Methods` value lists the methods the table holds for
the matched pattern, in table order. No second chain of per-route preflight
branches SHALL exist.

`GET /livez`, `GET /readyz` and `GET /metrics` stay outside the table. All
three answer a probe rather than a browser. None carries a CORS header, and
none answers a preflight.

This constrains the dispatch mechanism, not the routes. The `http-wrapper`,
`admin-operations-api`, `reporting-analytics-api` and `process-drafts`
capabilities hold the routes, their methods, their status codes and their
bodies.

#### Scenario: A request reaches its handler through the table

- **WHEN** a caller sends any request the wrapper routes, for example
  `POST /instances/:instanceId/submit`
- **THEN** the dispatcher takes the first table entry whose method and path
  pattern match
- **AND** it calls that entry's handler with the path parameters the pattern
  captured
- **AND** the response matches the response before this change

#### Scenario: A preflight answer comes from the table

- **WHEN** a browser sends an `OPTIONS` request for a path the table holds
  under two or more methods, for example `/drafts/:processId`
- **THEN** the response is `204` with `Access-Control-Allow-Methods` listing
  every method the table holds for that pattern, joined by `", "` in table
  order
- **AND** no handler runs

#### Scenario: Adding a route adds one table entry

- **WHEN** a developer adds a route to the wrapper
- **THEN** one new table entry is the whole change
- **AND** the preflight for that route answers with no second change

#### Scenario: The probe routes stay outside the table

- **WHEN** a caller sends `OPTIONS /livez`, `OPTIONS /readyz` or
  `OPTIONS /metrics`
- **THEN** the response is the wrapper's ordinary unmatched-route answer,
  not a `204` preflight answer
