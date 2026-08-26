## MODIFIED Requirements

### Requirement: List instances over HTTP

The HTTP wrapper SHALL expose the instance listing read as `GET /instances`. It
SHALL translate query parameters to the read's filters. The parameters are
`processId`, `status` (repeatable, one value per accepted status),
`currentStepId`, `startedBy`, `claimedBy`, `assignedTo`, `version`,
`excludeInstanceId`, `createdAfter` and `createdBefore`, plus `limit` and
`cursor`. An absent parameter SHALL mean "unfiltered", never an error.

The route SHALL reject a malformed parameter as a request error rather than
ignoring it. That covers a `limit` or a `version` that is not a positive
integer. It covers a `status` value that is not an instance status. It also
covers a `createdAfter` or a `createdBefore` that is not an ISO-8601 instant.

The route SHALL reject a `version` parameter carrying no `processId` as a
request error. The `instance-query` capability requires that pairing. The route
enforces it before the read runs.

The route SHALL expose no `dataWhere` parameter. The `instance-data-query`
capability's comparisons reach the Runtime API Layer reads in process. The
route that carries them over HTTP arrives with the consumer that reads them.

It SHALL first resolve the actor through the injected `ActorResolver`, like
every other route. See "Every route rejects a missing or invalid bearer token
when the JWT resolver is active".

The route SHALL additionally accept a `scope` query parameter. Its recognized
values are `"mine"`, `"started"` and `"all"`. The route SHALL reject any other
value as a request error. An omitted `scope` SHALL resolve to `"all"`. That is
what an omitted `scope` has always meant, so an existing request's meaning
never narrows silently.

`scope=all`, explicit or by omission, SHALL need `ADMIN_ROLE` on the
resolved actor. The route SHALL check it with `requireRole` before applying the
filter, so an authenticated actor lacking it receives 403. This is a
**BREAKING** tightening of a route previously open to every authenticated
actor. The other filters do not affect the check. Narrowing an unfiltered
listing does not make it a participant's own listing.

Under `scope=mine` the route SHALL need no role. It SHALL derive
`assignedTo` from the resolved actor rather than from a query parameter. It
SHALL derive that actor's roles the same way, for `instance-query`'s
role-matching half of the inbox predicate. It SHALL reject a request combining
`scope=mine` with an explicit `assignedTo` value as a request error. The two
are alternatives, never combined.

`scope=started` needs no role either. The route SHALL derive `startedBy` from
the resolved actor rather than from a query parameter. It SHALL reject a
request combining `scope=started` with an explicit `startedBy` value as a
request error. That is the rule `scope=mine` already carries for `assignedTo`.

`scope=started` SHALL add no assignment predicate of its own. An instance the
actor started matches whatever its current step's assignment says, and whatever
its status is. The engine already authorizes that actor to read each one. So
the scope lists what a `GET /instances/:id` would answer for.

An explicit `assignedTo` SHALL still narrow the page conjunctively, as it does
under `scope=all`. It reaches nothing outside what the caller started, so it
needs no role of its own.

The response SHALL carry the page of summaries and the next cursor. The cursor
is absent on the last page.

`scope=all` SHALL set `instance-query`'s `includeDegraded` filter, since that
scope already requires `ADMIN_ROLE`. An instance whose summary the read cannot
produce then comes back as a degraded item, per that capability's own
requirement. Neither `scope=mine` nor `scope=started` SHALL set it. Under
either of those the page omits such an instance instead. No degraded item
represents it, and the response still carries no error over it.

#### Scenario: Listing with no query parameters

- **WHEN** a caller requests `GET /instances` with a resolvable credential
  holding `system:admin`
- **THEN** the response is 200 and carries every instance summary, subject to
  the default limit

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: An omitted scope without the admin role is refused

- **WHEN** a caller requests `GET /instances` with a resolvable credential that
  does not hold `system:admin`
- **THEN** the response is 403 and the route performs no listing read

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: scope=all without the admin role is refused

- **WHEN** a caller requests `GET /instances?scope=all` with a resolvable
  credential that does not hold `system:admin`
- **THEN** the response is 403

#### Scenario: scope=mine needs no role

- **WHEN** a caller requests `GET /instances?scope=mine` with a resolvable
  credential holding no reserved role
- **THEN** the response is 200 and carries that actor's assignments

#### Scenario: Listing an actor's inbox

- **WHEN** a caller requests `GET /instances?assignedTo=user-1&status=running`
  with a resolvable credential holding `system:admin`
- **THEN** the response carries the running instances `user-1` holds or can
  claim, and no others

#### Scenario: An unrecognized scope value is a request error

- **WHEN** a caller requests `GET /instances?scope=sideways` with a resolvable
  credential
- **THEN** the response is 400 with a typed error body

#### Scenario: scope=mine rejects an explicit assignedTo

- **WHEN** a caller requests `GET /instances?scope=mine&assignedTo=user-1` with
  a resolvable credential
- **THEN** the response is a request error, and the route applies neither value

#### Scenario: Repeating the status parameter widens the filter

- **WHEN** a caller requests `GET /instances?status=running&status=cancelled`
  with a resolvable credential holding `system:admin`
- **THEN** the response carries instances of both statuses

#### Scenario: Paging over HTTP

- **WHEN** a caller requests `GET /instances?limit=2` with a resolvable
  credential holding `system:admin`, and more than two instances exist
- **THEN** the response carries two summaries and a cursor
- **AND** the same route with that cursor carries the following summaries

#### Scenario: An unparseable limit is a request error

- **WHEN** a caller requests `GET /instances?limit=abc` with a resolvable
  credential
- **THEN** the response is 400 with a typed error body

#### Scenario: An unknown status value is a request error

- **WHEN** a caller requests `GET /instances?status=sideways` with a resolvable
  credential
- **THEN** the response is 400 with a typed error body

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: An unresolvable credential is rejected before the filter is even parsed

- **WHEN** a caller requests `GET /instances`, with or without query
  parameters, and carries no resolvable credential
- **THEN** the response is 401 and the route performs no listing read

#### Scenario: An admin-scoped listing surfaces a degraded item

- **WHEN** a caller requests `GET /instances`, or `?scope=all`, with a
  resolvable credential holding `system:admin`
- **AND** the read cannot produce one matched instance's summary
- **THEN** the response is 200
- **AND** that instance's item is a degraded summary
- **AND** every other instance in the page returns as a normal summary

#### Scenario: A scope=mine listing never surfaces a degraded item

- **WHEN** a caller requests `GET /instances?scope=mine` with a resolvable
  credential
- **AND** the read cannot produce the summary of one instance among that
  actor's own assignments
- **THEN** the response is 200
- **AND** the page omits that instance
- **AND** no item in the page is a degraded summary

#### Scenario: scope=started needs no role

- **WHEN** a caller requests `GET /instances?scope=started` with a resolvable
  credential holding no reserved role
- **THEN** the response is 200 and carries the instances that actor started

#### Scenario: scope=started rejects an explicit startedBy

- **WHEN** a caller requests `GET /instances?scope=started&startedBy=user-1`
  with a resolvable credential
- **THEN** the response is a request error, and the route applies neither value

#### Scenario: scope=started ignores the assignment

- **WHEN** an actor started an instance whose current step names another actor
  as its only candidate
- **AND** that actor requests `GET /instances?scope=started`
- **THEN** the page carries that instance

#### Scenario: scope=started carries a finished case

- **WHEN** an actor started an instance that has since completed, and another
  that an operator has since cancelled
- **AND** that actor requests `GET /instances?scope=started`
- **THEN** the page carries both

#### Scenario: scope=started never carries another actor's case

- **WHEN** two actors have each started an instance
- **AND** one of them requests `GET /instances?scope=started`
- **THEN** the page carries that actor's own instance alone

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A degraded summary is absent under scope=started

- **WHEN** a caller requests `GET /instances?scope=started` with a resolvable
  credential
- **AND** the read cannot produce the summary of one instance that actor
  started
- **THEN** the response is 200
- **AND** the page omits that instance
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
