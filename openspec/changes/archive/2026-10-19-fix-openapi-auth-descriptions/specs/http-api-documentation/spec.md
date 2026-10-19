## ADDED Requirements

### Requirement: An authorization statement names every admitting path

A route entry's authorization statement SHALL name each way the code admits
a caller to that route. The ways are a reserved role, a stored grant, a
Reader list entry and a relationship to the instance. A rule that `authorization` owns SHALL
take one short sentence and a pointer to the governing requirement by its
name. The entry SHALL NOT restate that requirement in full.

#### Scenario: A reader checks who may list one process's instances

- **WHEN** a reader looks up `GET /instances` with `scope=all` and a
  `processId`
- **THEN** the entry names `system:admin` and the `read` permission over
  that process

#### Scenario: A reader checks who may submit on an unclaimed step

- **WHEN** a reader looks up `POST /instances/{instanceId}/submit`
- **THEN** the entry says that on a step with an assignment only the
  claimant may submit
- **AND** that without an assignment the starter or `system:admin` may
  submit

#### Scenario: A reader checks who may read one instance

- **WHEN** a reader looks up `GET /instances/{instanceId}`
- **THEN** the entry names the revocation and the test-instance limit in one
  short statement
- **AND** it names the `authorization` requirement that governs the read

### Requirement: A route entry lists every query value the route accepts

A route entry SHALL list each query parameter the route reads, and each
value an enumerated parameter accepts.

#### Scenario: A reader checks the instance list's filters

- **WHEN** a reader looks up `GET /instances`
- **THEN** the `scope` parameter lists `mine`, `started`, `all` and
  `visible`
- **AND** a `kind` parameter lists `published` and `test`

### Requirement: The document header states the SaaS-mode tenant answers

The document header SHALL state once that, in SaaS mode, a route can
answer 401 for an unknown or missing tenant. The same sentence SHALL name
the 503 a route answers when the tenant's database is down. The header
SHALL name the routes that answer before the tenant lookup and never send
either status.

#### Scenario: A reader checks the SaaS-mode answers

- **WHEN** a reader reads the document header
- **THEN** it names the 401 for an unknown tenant and the 503 for an
  unreachable tenant database
