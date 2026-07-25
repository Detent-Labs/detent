## ADDED Requirements

### Requirement: List instances over HTTP

The HTTP wrapper SHALL expose the instance listing read as `GET /instances`,
translating query parameters to the read's filters: `processId`, `status`
(repeatable, one value per accepted status), `currentStepId`, `startedBy`,
`claimedBy`, `assignedTo`, plus `limit` and `cursor`. Absent parameters SHALL
mean "unfiltered", never an error. A `limit` that is not a positive integer,
or a `status` value that is not an instance status, SHALL be rejected as a
request error rather than silently ignored.

The response SHALL carry the page of summaries and the next cursor, with the
cursor absent on the last page.

#### Scenario: Listing with no query parameters

- **WHEN** `GET /instances` is requested
- **THEN** the response is 200 and carries every instance summary, subject to the default limit

#### Scenario: Listing an actor's inbox

- **WHEN** `GET /instances?assignedTo=user-1&status=running` is requested
- **THEN** the response carries only running instances claimed by, or claimable by, `user-1`

#### Scenario: Repeating the status parameter widens the filter

- **WHEN** `GET /instances?status=running&status=cancelled` is requested
- **THEN** instances of both statuses are returned

#### Scenario: Paging over HTTP

- **WHEN** `GET /instances?limit=2` is requested and more than two instances exist
- **THEN** the response carries two summaries and a cursor
- **AND** requesting the same route with that cursor carries the following summaries

#### Scenario: An unparseable limit is a request error

- **WHEN** `GET /instances?limit=abc` is requested
- **THEN** the response is 400 with a typed error body

#### Scenario: An unknown status value is a request error

- **WHEN** `GET /instances?status=sideways` is requested
- **THEN** the response is 400 with a typed error body

### Requirement: Read an instance's record over HTTP

The HTTP wrapper SHALL expose the merged history/event record read as
`GET /instances/:instanceId/record`, accepting `limit` and `cursor`, and
returning the ordered, discriminated sequence the read produces.

An unknown instance id SHALL return 200 with an empty sequence, consistent
with the read itself and with the wrapper's existing choice not to invent
404s for absent instances.

#### Scenario: Reading a record

- **WHEN** `GET /instances/:id/record` is requested for an instance that has transitioned
- **THEN** the response is 200 and carries the merged, ordered record

#### Scenario: Reading the record of an unknown instance

- **WHEN** `GET /instances/:id/record` is requested for an id that does not exist
- **THEN** the response is 200 with an empty sequence

### Requirement: Cancel an instance over HTTP

The HTTP wrapper SHALL expose the engine's existing instance cancellation as
`POST /instances/:instanceId/cancel`, resolving the actor through the injected
`ActorResolver` exactly as the other routes do and returning the resulting
instance state.

Cancelling an instance that is not running SHALL succeed as a no-op, since
that is the engine's own semantics, and SHALL NOT be reported as an error.

#### Scenario: Cancelling a running instance

- **WHEN** `POST /instances/:id/cancel` is requested for a running instance
- **THEN** the response is 200
- **AND** the instance's status is `cancelled`
- **AND** a cancel history entry has been recorded

#### Scenario: Cancelling an already-cancelled instance

- **WHEN** the same route is requested again for that instance
- **THEN** the response is 200 and the instance stays cancelled

#### Scenario: Cancelling without a resolvable credential

- **WHEN** the route is requested with no resolvable credential
- **THEN** the response is 401 and the instance is unchanged

### Requirement: Publish a process body over HTTP

The HTTP wrapper SHALL expose `POST /processes`, accepting an authored process
body and publishing it through the definition store's existing publish
operation, returning the resulting `processId`, `version`, `definitionHash`
and `status`.

Publishing SHALL run the unchanged publish-time validation chain — authored
schema, duration bounds, action registry, CEL, cross-process. The action
registry the check resolves against SHALL be the server's own injected
registry; a client SHALL NOT be able to supply or extend it.

An identical re-publish SHALL return the existing version, since publish is
idempotent on an identical body.

#### Scenario: Publishing a valid body

- **WHEN** `POST /processes` is requested with a valid authored body
- **THEN** the response is 200 and carries version 1 and its hash
- **AND** the version is readable from the definition store

#### Scenario: Re-publishing an identical body

- **WHEN** the same body is published again
- **THEN** the response carries the same version and hash as the first publish

#### Scenario: Publishing a changed body

- **WHEN** a changed body for the same process is published
- **THEN** the response carries version 2

#### Scenario: A malformed request body is rejected

- **WHEN** `POST /processes` is requested with a body that is not valid JSON
- **THEN** the response is 400 with a typed error body

### Requirement: Publish-time validation failures map to 422

The HTTP wrapper SHALL map every publish-time validation failure — authored
schema violation, invalid duration, unregistered or schema-violating action
config, an unsupported `Step.assignment.strategy.type`, an unregistered or
schema-violating data source config, invalid CEL expression, unresolvable
cross-process reference — to 422 with a typed error body carrying the
failure's located issues, so a client can attribute the failure to a position
in the submitted body. A rejected publish SHALL consume no version number.

#### Scenario: An unregistered action type maps to 422

- **WHEN** a body carrying an action with an unregistered type is published
- **THEN** the response is 422 and the body names the offending action position

#### Scenario: An unsupported assignment strategy type maps to 422

- **WHEN** a body carrying a step whose `assignment.strategy.type` is not `"static"` is published
- **THEN** the response is 422 and the body names the offending step's assignment position

#### Scenario: An unregistered data source type maps to 422

- **WHEN** a body carrying a `dataSources` entry with an unregistered type is published
- **THEN** the response is 422 and the body names the offending data source position

#### Scenario: An invalid CEL expression maps to 422

- **WHEN** a body carrying an unparseable guard expression is published
- **THEN** the response is 422 and the body names the offending expression

#### Scenario: A structurally invalid body maps to 422

- **WHEN** a body whose `initialStep` references a missing step is published
- **THEN** the response is 422

#### Scenario: A rejected publish consumes no version

- **WHEN** a publish is rejected with 422 and a valid body is then published for the same process
- **THEN** the valid body is version 1

### Requirement: List processes and versions over HTTP

The HTTP wrapper SHALL expose the definition store's enumeration reads as
`GET /processes` (published processes with their newest version metadata) and
`GET /processes/:processId/versions` (that process's versions). Neither route
SHALL return process bodies.

#### Scenario: Listing published processes

- **WHEN** `GET /processes` is requested after two processes were published
- **THEN** the response is 200 and lists both with their newest version
- **AND** no entry carries a body

#### Scenario: Listing one process's versions

- **WHEN** `GET /processes/:processId/versions` is requested for a twice-published process
- **THEN** the response lists both versions in version order

#### Scenario: Listing the versions of an unpublished process

- **WHEN** the route is requested with an unpublished `processId`
- **THEN** the response is 200 with an empty list

### Requirement: The new routes answer CORS preflight requests

Every route added by this change SHALL answer an `OPTIONS` preflight with 204
and the same permissive CORS headers the existing routes use, so a browser
client on another origin can reach them.

#### Scenario: Preflighting the instance listing route

- **WHEN** `OPTIONS /instances` is requested
- **THEN** the response is 204 and permits `GET`

#### Scenario: Preflighting the publish route

- **WHEN** `OPTIONS /processes` is requested
- **THEN** the response is 204 and permits `POST`

#### Scenario: Preflighting the cancel route

- **WHEN** `OPTIONS /instances/:id/cancel` is requested
- **THEN** the response is 204 and permits `POST`

### Requirement: The added write routes are unauthenticated under the shipped resolver

Publish and cancel are state-changing routes that this change deliberately
does not authorize beyond resolving an actor through the injected
`ActorResolver`. With the shipped non-production `devHeaderResolver`, any
caller may present any actor id, so any caller may publish a process
definition or cancel any instance. The wrapper SHALL keep the resolver seam as
the single place where that changes, and SHALL NOT introduce a route-specific
authorization mechanism of its own.

#### Scenario: A cancel request under the dev resolver succeeds for any actor

- **WHEN** the cancel route is requested with an arbitrary actor id header
- **THEN** the request succeeds
- **AND** the resolved actor is recorded as the cause of the cancellation

#### Scenario: A publish request under a rejecting resolver is refused

- **WHEN** the server is configured with a resolver that rejects the credential
- **AND** the publish route is requested
- **THEN** the response is 401 and nothing is published
