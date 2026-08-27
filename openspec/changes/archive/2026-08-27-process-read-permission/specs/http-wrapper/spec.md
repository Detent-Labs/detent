<!-- antislop: allow-file passive-voice sentence-length em-dash run-ons long-words -->
<!-- Copied http-wrapper requirement text; only the scope=all gate changed. -->

## MODIFIED Requirements

### Requirement: List instances over HTTP

The HTTP wrapper SHALL expose the instance listing read as `GET /instances`,
translating query parameters to the read's filters: `processId`, `status`
(repeatable, one value per accepted status), `currentStepId`, `startedBy`,
`claimedBy`, `assignedTo`, `version`, `excludeInstanceId`, `createdAfter` and
`createdBefore`, plus `limit` and `cursor`. Absent parameters SHALL mean
"unfiltered", never an error.

The route SHALL reject a malformed parameter as a request error rather than
ignoring it. That covers a `limit` or a `version` that is not a positive
integer. It covers a `status` value that is not an instance status. It also
covers a `createdAfter` or a `createdBefore` that is not an ISO-8601 instant.

The route SHALL reject a `version` parameter carrying no `processId` as a
request error. The `instance-query` capability requires that pairing. The
route enforces it before the read runs.

The route SHALL expose no `dataWhere` parameter. The `instance-data-query`
capability's comparisons reach the Runtime API Layer reads in process. The
route that carries them over HTTP arrives with the consumer that reads them.

Like every other route, it SHALL first resolve the actor through the injected
`ActorResolver` (see "Every route rejects a missing or invalid bearer token
when the JWT resolver is active").

The route SHALL additionally accept a `scope` query parameter whose recognized
values are `"mine"`, `"started"` and `"all"`; any other value SHALL be rejected
as a request error. An omitted `scope` SHALL resolve to `"all"` — that is what
an omitted `scope` has always meant — rather than defaulting to `"mine"`, so an
existing request's meaning is never silently narrowed.

`scope=all` (explicit or by omission) SHALL rest on the process-scoped
`"read"` gate rather than on a flat role test.

Where the request names a `processId`, the wrapper SHALL call
`requirePermission` with `"read"` over that process, before the filter is
applied. An actor holding `ADMIN_ROLE` passes by the reserved-role
short-circuit, reading no grant row. An actor holding a `"read"` grant over
that process passes by the grant. Any other authenticated actor receives 403.

Where the request names no `processId`, the wrapper SHALL keep requiring
`ADMIN_ROLE` through `requireRole`. A process-scoped grant cannot answer a
query naming no process, and this capability adds no result-set predicate over
the processes an actor holds a grant over. A grant holder therefore names the
process it holds.

This stays a **BREAKING** tightening of a route once open to every
authenticated actor. It takes no answer away from an account that had one:
every account reaching the unfiltered listing holds `ADMIN_ROLE`, which
short-circuits the gate. The other filters do not affect the check: narrowing
an unfiltered listing does not make it a participant's own listing.

When `scope=mine`, no role is required; the wrapper derives `assignedTo` (and
the resolved actor's roles, for `instance-query`'s role-matching half of the
inbox predicate — see that capability) from the resolved actor rather than a
query parameter, and SHALL reject a request that combines `scope=mine` with an
explicit `assignedTo` value as a request error — `scope=mine` and `assignedTo`
are alternatives, never combined.

`scope=started` needs no role either. The wrapper SHALL derive `startedBy`
from the resolved actor rather than from a query parameter. It SHALL reject a
request combining `scope=started` with an explicit `startedBy` value as a
request error, the rule `scope=mine` already carries for `assignedTo`.

`scope=started` SHALL add no assignment predicate of its own. An instance the
actor started matches whatever its current step's assignment says, and
whatever its status is. The engine already authorizes that actor to read each
one. The scope therefore lists what a `GET /instances/:id` would answer for.

An explicit `assignedTo` SHALL still narrow the page conjunctively, as it does
under `scope=all`. It reaches nothing outside what the caller started, so it
needs no role of its own.

The response SHALL carry the page of summaries and the next cursor, with the
cursor absent on the last page.

`scope=all` SHALL set `instance-query`'s `includeDegraded` filter, since that
scope already passes the `"read"` gate. An instance whose summary cannot be
produced then comes back as a degraded item, per that capability's own
requirement. Neither `scope=mine` nor `scope=started` SHALL set it. An
instance whose summary cannot be produced under either scope is absent from
the page instead. No degraded item represents it, and the response still
carries no error over it.

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

#### Scenario: A read grant admits scope=all over the named process

- **WHEN** `GET /instances?scope=all&processId=P` is requested with a
  resolvable credential that does not hold `system:admin`
- **AND** the store holds a `"read"` grant over P to one of that actor's roles
- **THEN** the response is 200 and carries that process's instance summaries

#### Scenario: A read grant over another process does not admit this one

- **WHEN** `GET /instances?scope=all&processId=P` is requested with a
  resolvable credential that does not hold `system:admin`
- **AND** the store holds a `"read"` grant over Q alone to that actor's roles
- **THEN** the response is 403

#### Scenario: A grant holder still names the process

- **WHEN** `GET /instances?scope=all` with no `processId` is requested with a
  resolvable credential that does not hold `system:admin`
- **AND** the store holds a `"read"` grant over P to one of that actor's roles
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

#### Scenario: An admin-scoped listing surfaces a degraded item

- **WHEN** `GET /instances` (or `?scope=all`) is requested with a resolvable
  credential holding `system:admin`
- **AND** one matched instance's summary cannot be produced
- **THEN** the response is 200
- **AND** that instance's item is a degraded summary
- **AND** every other instance in the page returns as a normal summary

#### Scenario: A scope=mine listing never surfaces a degraded item

- **WHEN** `GET /instances?scope=mine` is requested with a resolvable
  credential
- **AND** one instance among that actor's own assignments has a summary that
  cannot be produced
- **THEN** the response is 200
- **AND** that instance is absent from the page
- **AND** no item in the page is a degraded summary

#### Scenario: scope=started needs no role

- **WHEN** `GET /instances?scope=started` is requested with a resolvable
  credential holding no reserved role
- **THEN** the response is 200 and carries the instances that actor started

#### Scenario: scope=started rejects an explicit startedBy

- **WHEN** `GET /instances?scope=started&startedBy=user-1` is requested with a
  resolvable credential
- **THEN** the response is a request error, and neither value is applied

#### Scenario: scope=started ignores the assignment

- **WHEN** an actor started an instance whose current step names another actor
  as its only candidate
- **AND** that actor requests `GET /instances?scope=started`
- **THEN** the page carries that instance

#### Scenario: scope=started carries a finished case

- **WHEN** an actor started an instance that has since completed, and another
  that has since been cancelled
- **AND** that actor requests `GET /instances?scope=started`
- **THEN** the page carries both

#### Scenario: scope=started never carries another actor's case

- **WHEN** two actors have each started an instance
- **AND** one of them requests `GET /instances?scope=started`
- **THEN** the page carries that actor's own instance alone

#### Scenario: A degraded summary is absent under scope=started

- **WHEN** `GET /instances?scope=started` is requested with a resolvable
  credential
- **AND** one instance that actor started has a summary that cannot be produced
- **THEN** the response is 200
- **AND** that instance is absent from the page
- **AND** no item in the page is a degraded summary

#### Scenario: Filtering by version over HTTP

- **WHEN** a caller requests `GET /instances?processId=p1&version=2` with a
  resolvable credential holding `system:admin`
- **THEN** the response carries the instances of `p1` pinned to version 2
- **AND** it omits an instance of `p1` pinned to version 1

#### Scenario: An unparseable version is a request error

- **WHEN** a caller requests `GET /instances?processId=p1&version=abc` with a
  resolvable credential
- **THEN** the response is 400 with a typed error body

#### Scenario: A dataWhere query parameter reaches no filter

- **WHEN** a caller requests `GET /instances` with a `dataWhere` query
  parameter, holding `system:admin`
- **THEN** the route passes no `dataWhere` to the read

#### Scenario: A version parameter with no processId is a request error

- **WHEN** a caller requests `GET /instances?version=2` with a resolvable
  credential holding `system:admin`
- **THEN** the response is 400 with a typed error body

#### Scenario: Excluding one instance by id over HTTP

- **WHEN** a caller requests `GET /instances?excludeInstanceId=inst-1` with a
  resolvable credential holding `system:admin`
- **THEN** the page omits `inst-1`
- **AND** it carries every other matching instance

#### Scenario: Bounding by creation time over HTTP

- **WHEN** a caller passes `createdAfter` and `createdBefore` as ISO-8601
  instants
- **THEN** the page carries the instances created inside that window

#### Scenario: A malformed creation bound is a request error

- **WHEN** a caller requests `GET /instances?createdAfter=yesterday` with a
  resolvable credential
- **THEN** the response is 400 with a typed error body
