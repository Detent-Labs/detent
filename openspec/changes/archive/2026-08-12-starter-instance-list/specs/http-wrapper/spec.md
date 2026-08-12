<!-- antislop: allow-file passive-voice sentence-length em-dash run-ons long-words -->
<!-- Why: a MODIFIED delta must copy the whole requirement, character for
     character, or the archive merge loses the part it did not copy. This one
     copies "List instances over HTTP" from openspec/specs/http-wrapper/spec.md,
     which holds 130 findings of its own. Rewriting them here would rewrite
     requirements from a dozen prior changes for a purely stylistic reason,
     which docs/decisions.md and CLAUDE.md's ratchet section both refuse. The
     sentences this change ADDS were linted on their own and report zero. -->

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
values are `"mine"`, `"started"` and `"all"`; any other value SHALL be rejected
as a request error. An omitted `scope` SHALL resolve to `"all"` — that is what
an omitted `scope` has always meant — rather than defaulting to `"mine"`, so an
existing request's meaning is never silently narrowed.

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
scope already requires `ADMIN_ROLE`. An instance whose summary cannot be
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
