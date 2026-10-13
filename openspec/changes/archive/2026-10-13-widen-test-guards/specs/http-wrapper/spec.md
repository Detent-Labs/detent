# Spec Delta

## ADDED Requirements

### Requirement: Every route refuses a request without credentials, unless named exempt

A test SHALL read the method and path of every row in `createServer`'s route
table. It SHALL send each route a request with no credential. Each route SHALL
answer 401, except the routes in a named exemption set. The set SHALL state a
reason for each member. The exemption set holds `POST /auth/login` and
`GET /ui-strings`, which answer without a credential by design.

A row that the test cannot read SHALL fail the test. An exemption that names no
row of the table SHALL fail it too.

#### Scenario: A gated route refuses an anonymous request

- **WHEN** a request without credentials reaches a route outside the exemption
  set
- **THEN** the route answers 401

#### Scenario: A new ungated route fails the test

- **WHEN** a contributor adds a row whose handler resolves no actor
- **THEN** the test fails and names the route

#### Scenario: An unreadable row fails the test

- **WHEN** a row of the table has a shape that the test cannot parse
- **THEN** the test fails instead of skipping the row

#### Scenario: A stale exemption fails the test

- **WHEN** the exemption set names a route that the table no longer holds
- **THEN** the test fails and names the entry
