<!-- antislop: allow-file passive-voice -->
<!-- The scenarios copied here are Gherkin ("WHEN listInstances is called"), which reads naturally as passive; the same allowance the persistence spec carries. -->
## MODIFIED Requirements

### Requirement: List instance summaries with filters

The Runtime API Layer SHALL expose a read that returns a page of instance
summaries. A summary carries the instance's identity and lifecycle state:
`instanceId`, `processId`, `version`, `status`, `currentStepId`,
`transitionSeq`, `assignment` (candidates and claim state), `startedBy`,
`createdAt`, `currentStepEnteredAt`, `processLabel`, `stepLabel` and
`processBaseLocale`. A summary SHALL NOT carry the instance `data` payload.

`processLabel` and `stepLabel` are `LocalizedText`. The read resolves both
through the existing cached definition store, against the pinned version body.
`processBaseLocale` is that same body's `baseLocale`. The summary includes it
so a caller resolves `processLabel` and `stepLabel` against the correct
fallback locale without a second request. The summary SHALL expose no other
part of the process body, guards and action configs included.

The read SHALL accept these optional filters: `processId`, `version`, `status`
(one or more of the instance statuses), `currentStepId`, `startedBy`,
`claimedBy`, `assignedTo`, `excludeInstanceId`, `createdAfter`,
`createdBefore` and `dataWhere`. It SHALL combine them conjunctively.

A `version` filter SHALL accompany a `processId` filter. The read SHALL reject
a `version` with no `processId`. A version number anchors to one process, so a
bare `version` names version 2 of every process at once. The
`instances_selection_col_idx` index also reaches its `version` column only with
the leading `process_id` column bound. That is the rule `dataWhere` carries,
for the first of those two reasons.

A `version` filter SHALL be an integer the datastore can hold. The read SHALL
reject any other value as a request-shape error, before it issues a query.
The filter compares against a generated `integer` column. A value that column
cannot hold surfaces from the datastore rather than from the read.

Two classes fail that rule. One is a value that is not an integer. The other
is an integer outside the `integer` column's own range. Both are caller
errors, and neither reaches a query.

`assignedTo` SHALL match an instance under either of two conditions. That actor
holds the claim on its current step. Or its current step carries no claim and
lists that actor's id among its assignment candidates. Together those two form
the participant inbox predicate.

The read SHALL additionally accept `scope: "mine"`. That applies the identical
inbox predicate against the calling actor. The read resolves that actor from
the request's credential, not from a client-supplied id. A caller MUST NOT be
able to substitute `scope=mine` for the effect of an arbitrary `assignedTo`
value belonging to another actor.

`scope: "mine"` resolves a full `Actor`, id and roles, rather than a bare id
string. So its inbox predicate additionally matches an unclaimed instance that
lists any of the actor's roles among its assignment candidates. That is the
same id-or-role eligibility `claimStep` already applies through
`isEligibleCandidate`. A bare `assignedTo=<id>` filter carries no role list to
check against. It therefore matches by id alone, identically for a claimed and
an unclaimed instance.

`excludeInstanceId` SHALL omit the named instance from the result.
`createdAfter` and `createdBefore` SHALL bound the result by the `created_at`
column. Both bounds SHALL include the instant they name. That matches the
inclusive convention `src/engine/reporting.ts` already uses for its own date
range.

Both bounds SHALL compare against the stored `created_at` value at its full
precision. Postgres writes that column with microseconds, and the summary's
`createdAt` truncates to milliseconds. A stored value can carry digits below the
millisecond. Its summary value then names an earlier instant than the row holds.
A `createdBefore` carrying that summary value SHALL omit the instance it came
from. The read exposes millisecond granularity on the value it returns, and
full precision on the value it compares.

A `dataWhere` filter SHALL carry comparisons against the instance `data`
payload. The `instance-data-query` capability defines their semantics. That
includes the `processId` filter a `dataWhere` requires. The comparisons join
the other filters conjunctively.

With no filters the read SHALL return every instance, subject to paging. The
read SHALL NOT scope results to the calling actor implicitly.

A test instance is an instance whose `kind` is `"test"`, per the
`draft-test-instances` capability. An ordinary instance carries the
`"published"` kind instead.

The read SHALL exclude a test instance from a summary list under a
participant-facing scope. Participant-facing scope means `scope: "mine"`,
`scope: "started"`, or any call from a caller with no administrative
standing over the read. The exclusion applies no matter how the actor
relates to the instance. It applies whether they started it, claim it, or
are an eligible assignment candidate on it. A participant-facing caller
cannot opt out.

The read SHALL include a test instance, subject to its other filters, in a
summary list under administrative scope. Administrative scope means
`scope: "all"`, gated by `ADMIN_ROLE` per the `http-wrapper` capability, or
an equivalent process-scoped read grant.

A matched instance's summary can fail to resolve. That happens when its pinned
`(processId, version)` has no resolvable published body. It also happens when
its `currentStepId` is absent from that body's steps. The read SHALL NOT fail
the whole page over one instance like this. Every other instance in the same
page SHALL resolve and return normally.

The read SHALL accept one further filter, `includeDegraded`. No query parameter
exposes it. See the `http-wrapper` capability for how a caller sets it. When
`includeDegraded` is true, the failed item SHALL come back as a degraded
summary carrying `instanceId`, `processId`, `version`, `status`,
`currentStepId`, `transitionSeq`, `startedBy`, `createdAt`, and a reason.

A degraded summary SHALL NOT carry `processLabel`, `stepLabel` or
`processBaseLocale`. When `includeDegraded` is false or absent, the read SHALL
omit the failed item from the page instead. Omitting it SHALL NOT pull extra
rows to keep the page at its requested `limit`. The page may come back shorter
than `limit` even while more matching instances exist.

#### Scenario: Listing every instance

- **WHEN** the read is called with no filters and three instances exist
- **THEN** all three summaries are returned
- **AND** no returned summary carries a `data` field

#### Scenario: Filtering by process and status

- **WHEN** the read is called with a `processId` and `status: ["running"]`
- **THEN** only running instances of that process are returned
- **AND** a completed instance of that process is excluded
- **AND** a running instance of another process is excluded

#### Scenario: Filtering by current step

- **WHEN** the read is called with a `currentStepId`
- **THEN** only instances currently parked on that step are returned

#### Scenario: Filtering by version

- **WHEN** the read runs with a `processId` and `version: 2`
- **THEN** it returns the instances pinned to version 2 of that process
- **AND** it omits an instance of that process pinned to version 1

#### Scenario: The read rejects a version with no processId

- **WHEN** a caller passes a `version` and no `processId`
- **THEN** the read rejects the call

#### Scenario: The read rejects a non-integer version

- **WHEN** a caller passes a `processId` and a fractional `version`
- **THEN** the read rejects the call as a request-shape error
- **AND** it surfaces no datastore error

#### Scenario: The read rejects a version outside the column's range

- **WHEN** a caller passes a `processId` and a `version` too large for the
  `integer` column
- **THEN** the read rejects the call as a request-shape error
- **AND** it surfaces no datastore error

#### Scenario: A version at the column's edge is accepted

- **WHEN** a caller passes a `processId` and the largest `version` the
  `integer` column holds
- **THEN** the read issues its query and returns an empty page, matching no
  instance

#### Scenario: Filtering by a data comparison

- **WHEN** the read runs with a `dataWhere` comparison naming a field id and a
  scalar literal
- **THEN** it returns the instances whose `data` holds that value under that
  field id

#### Scenario: Excluding one instance by id

- **WHEN** the read runs with `excludeInstanceId` naming an instance that every
  other filter matches
- **THEN** it omits that instance
- **AND** it returns every other matching instance

#### Scenario: Bounding by creation time

- **WHEN** the read runs with a `createdAfter` and a `createdBefore`
- **THEN** it returns the instances created inside that window
- **AND** it omits an instance created before the window
- **AND** it omits an instance created after the window

#### Scenario: A creation bound includes the instant it names

- **WHEN** the read runs with a `createdAfter` naming an instance's stored
  `created_at`, read at the column's full precision
- **THEN** it returns that instance
- **AND** a `createdBefore` naming that same instant returns it too

#### Scenario: A creation bound taken from a summary is millisecond-granular

- **WHEN** an instance's stored `created_at` carries digits below the
  millisecond
- **AND** a caller passes that instance's summary `createdAt` as a
  `createdBefore`
- **THEN** the read omits that instance

#### Scenario: The inbox predicate matches a claimed instance

- **WHEN** an instance's current step is claimed by actor A
- **AND** the read is called with `assignedTo: A`
- **THEN** that instance is returned

#### Scenario: The inbox predicate matches an unclaimed candidate instance

- **WHEN** an instance's current step is unclaimed and lists actor A as a candidate
- **AND** the read is called with `assignedTo: A`
- **THEN** that instance is returned

#### Scenario: The inbox predicate excludes an instance claimed by someone else

- **WHEN** an instance's current step lists actor A as a candidate but is claimed by actor B
- **AND** the read is called with `assignedTo: A`
- **THEN** that instance is not returned

#### Scenario: Filters combine conjunctively

- **WHEN** the read is called with both `assignedTo: A` and `status: ["running"]`
- **AND** a completed instance is claimed by A
- **THEN** that completed instance is not returned

#### Scenario: A summary carries resolved process and step labels

- **WHEN** the read is called and an instance's current process/step have
  `LocalizedText` labels in the pinned version body
- **THEN** the returned summary's `processLabel` and `stepLabel` carry those
  `LocalizedText` maps, and `processBaseLocale` matches the pinned body's
  `baseLocale`

#### Scenario: A summary carries the current step's entry time

- **WHEN** an instance has transitioned into its current step
- **THEN** the returned summary's `currentStepEnteredAt` reflects that
  transition's timestamp, not the instance's `createdAt`

#### Scenario: scope=mine resolves the same predicate as assignedTo for the caller

- **WHEN** the read is called with `scope: "mine"` by an authenticated actor A
- **AND** A is the claimant or an unclaimed candidate of an instance's current
  step
- **THEN** that instance is returned, identically to calling the read with
  `assignedTo: A`

#### Scenario: scope=mine ignores a client-supplied actor id

- **WHEN** the read is called with `scope: "mine"` by authenticated actor A
- **THEN** the predicate is evaluated against A, resolved from the request's
  credential
- **AND** the request has no way to substitute a different actor id

#### Scenario: scope=mine's inbox predicate also matches by role, not id alone

- **WHEN** an instance's current step is unclaimed and lists role R (not
  actor A's id) among its assignment candidates
- **AND** the read is called with `scope: "mine"` by authenticated actor A,
  who holds role R
- **THEN** that instance is returned
- **AND** an equivalent bare `assignedTo: A` call (no role list available)
  does not return it

#### Scenario: A participant-facing scope excludes a test instance

- **WHEN** a test instance and an ordinary instance both exist
- **AND** actor A started, claims, and is an eligible assignment candidate on
  the test instance's current step
- **AND** actor A, holding no administrative standing, calls the read with
  `scope: "mine"` (or `scope: "started"`)
- **THEN** the read returns the ordinary instance when it also matches A's
  filters
- **AND** the read omits the test instance from every page of the walk

#### Scenario: Administrative scope includes a test instance

- **WHEN** a test instance exists
- **AND** an actor holding `ADMIN_ROLE` calls the read under `scope: "all"`
- **THEN** the read returns the test instance in the page like any other
  instance

#### Scenario: With includeDegraded, an unresolvable body degrades instead of failing the page

- **WHEN** the read is called with `includeDegraded: true` and one matched
  instance's pinned `(processId, version)` has no published body
- **THEN** the read still returns 200 with a full page
- **AND** that instance's item is a degraded summary naming the reason
- **AND** every other instance in the page returns as a normal summary

#### Scenario: With includeDegraded, a missing current step degrades instead of failing the page

- **WHEN** the read is called with `includeDegraded: true` and one matched
  instance's `currentStepId` is not among the steps of its pinned body
- **THEN** the read still returns 200 with a full page
- **AND** that instance's item is a degraded summary naming the reason

#### Scenario: A degraded summary omits label fields

- **WHEN** the read returns a degraded summary
- **THEN** that item carries no `processLabel`, `stepLabel`, or
  `processBaseLocale`
- **AND** it still carries `instanceId`, `processId`, `version`, `status`,
  `currentStepId`, `transitionSeq`, `startedBy`, and `createdAt`

#### Scenario: Without includeDegraded, an unresolvable instance is silently omitted

- **WHEN** the read is called with `includeDegraded` false or absent, and
  one matched instance's pinned `(processId, version)` has no published body
- **THEN** the read still returns 200
- **AND** that instance is absent from `items`
- **AND** no item in the page is a degraded summary
- **AND** every other matched instance returns as a normal summary
