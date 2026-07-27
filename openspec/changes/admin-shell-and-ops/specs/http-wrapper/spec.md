## MODIFIED Requirements

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
active").

The route SHALL additionally accept a `scope` query parameter whose recognized
values are `"mine"` and `"all"`; any other value SHALL be rejected as a request
error. An omitted `scope` SHALL resolve to `"all"` — that is what an omitted
`scope` has always meant — rather than defaulting to `"mine"`, so an existing
request's meaning is never silently narrowed.

`scope=all` (explicit or by omission) SHALL require `ADMIN_ROLE` on the
resolved actor, checked with `requireRole` before the filter is applied, so an
authenticated actor lacking it receives 403. This is a **BREAKING** tightening
of a route that was previously open to every authenticated actor. The other
filters do not affect the check: narrowing an unfiltered listing does not make
it a participant's own listing.

When `scope=mine`, no role is required; the wrapper derives `assignedTo` (and
the resolved actor's roles, for `instance-query`'s role-matching half of the
inbox predicate — see that capability) from the resolved actor rather than a
query parameter, and SHALL reject a request that combines `scope=mine` with an
explicit `assignedTo` value as a request error — `scope=mine` and `assignedTo`
are alternatives, never combined.

The response SHALL carry the page of summaries and the next cursor, with the
cursor absent on the last page.

#### Scenario: Listing with no query parameters

- **WHEN** `GET /instances` is requested with a resolvable credential holding
  `system:admin`
- **THEN** the response is 200 and carries every instance summary, subject to the default limit

#### Scenario: An omitted scope without the admin role is refused

- **WHEN** `GET /instances` is requested with a resolvable credential that does
  not hold `system:admin`
- **THEN** the response is 403 and no listing read is performed

#### Scenario: scope=all without the admin role is refused

- **WHEN** `GET /instances?scope=all` is requested with a resolvable credential
  that does not hold `system:admin`
- **THEN** the response is 403

#### Scenario: scope=mine needs no role

- **WHEN** `GET /instances?scope=mine` is requested with a resolvable
  credential holding no reserved role
- **THEN** the response is 200 and carries that actor's assignments

#### Scenario: Listing an actor's inbox

- **WHEN** `GET /instances?assignedTo=user-1&status=running` is requested with
  a resolvable credential holding `system:admin`
- **THEN** the response carries only running instances claimed by, or claimable by, `user-1`

#### Scenario: An unrecognized scope value is a request error

- **WHEN** `GET /instances?scope=sideways` is requested with a resolvable credential
- **THEN** the response is 400 with a typed error body

#### Scenario: scope=mine rejects an explicit assignedTo

- **WHEN** `GET /instances?scope=mine&assignedTo=user-1` is requested with a resolvable credential
- **THEN** the response is a request error, and neither value is applied

#### Scenario: Repeating the status parameter widens the filter

- **WHEN** `GET /instances?status=running&status=cancelled` is requested with a
  resolvable credential holding `system:admin`
- **THEN** instances of both statuses are returned

#### Scenario: Paging over HTTP

- **WHEN** `GET /instances?limit=2` is requested with a resolvable credential
  holding `system:admin` and more than two instances exist
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

It SHALL then require `ADMIN_ROLE` on the resolved actor, unconditionally —
there is no "the record of an instance I am assigned to" carve-out. The record
is the audit backbone: it carries actor ids, action outcomes and resolved
handler builds across every participant of the instance. This is a **BREAKING**
tightening of a route that was previously open to every authenticated actor.

An unknown instance id SHALL return 200 with an empty sequence, consistent
with the read itself and with the wrapper's existing choice not to invent
404s for absent instances — but only once the actor resolves and the role
check passes.

#### Scenario: Reading a record

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:admin` for an instance that has transitioned
- **THEN** the response is 200 and carries the merged, ordered record

#### Scenario: An actor without the admin role is refused

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential that does not hold `system:admin`
- **THEN** the response is 403 and no record read is performed

#### Scenario: Reading the record of an unknown instance

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:admin` for an id that does not exist
- **THEN** the response is 200 with an empty sequence

#### Scenario: An unresolvable credential is rejected regardless of whether the instance exists

- **WHEN** `GET /instances/:id/record` is requested with no resolvable credential
- **THEN** the response is 401, whether or not `:id` names a real instance
