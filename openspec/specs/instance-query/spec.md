# instance-query

## Purpose

Runtime-level discovery over persisted instances: filtered, keyset-paginated
listing of instance summaries (the participant-inbox / process-monitoring
surface), and reading one instance's append-only record (its `HistoryEntry`
and `InstanceEvent` rows merged into a single chronologically ordered
sequence). Lives in the Runtime API Layer (`src/runtime/api.ts`), alongside
`createProcessInstance`/`getInstanceView`/`submitAndTransition`/`claimStep`/
`releaseClaim` — it resolves nothing the engine internals own, only reads
what they already persist. Exposed over HTTP by the `http-wrapper`
capability's `GET /instances` and `GET /instances/:instanceId/record` routes.

## Requirements

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
`instances_selection_idx` index also reaches its `version` column only with the
leading `processId` column bound. That is the rule `dataWhere` carries, for the
first of those two reasons.

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
the whole page over a failure like this. Every other instance in the same page
SHALL resolve and return normally.

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
  who is the claimant or an unclaimed candidate of an instance's current step
- **THEN** that instance is returned, identically to calling the read with
  `assignedTo: A`

#### Scenario: scope=mine ignores a client-supplied actor id

- **WHEN** the read is called with `scope: "mine"` by authenticated actor A
- **THEN** the predicate is evaluated against A, resolved from the request's
  credential, with no way for the request to substitute a different actor id

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
- **AND** that instance's item is a degraded summary naming the failure
- **AND** every other instance in the page returns as a normal summary

#### Scenario: With includeDegraded, a missing current step degrades instead of failing the page

- **WHEN** the read is called with `includeDegraded: true` and one matched
  instance's `currentStepId` is not among the steps of its pinned body
- **THEN** the read still returns 200 with a full page
- **AND** that instance's item is a degraded summary naming the failure

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

### Requirement: Instance listing is keyset-paginated in a stable order

The listing read SHALL order results newest-first by creation time, tie-broken
by `instanceId`, and SHALL page by keyset cursor rather than by offset — the
same technique `migrateInstances` and `findOrphanKeys` use. It SHALL accept a
`limit` (with a documented default and an enforced maximum) and an opaque
`cursor`, and SHALL return the cursor to pass for the next page, absent when
the page is the last one.

Because runtime ids are UUIDv4 and not time-sortable, instance creation time
SHALL be persisted as its own column rather than inferred from the id.
`currentStepEnteredAt` SHALL likewise be persisted (as part of the instance
record, alongside `currentStepId`), written at step entry, rather than derived
from the runtime record at read time.

Paging SHALL be stable under concurrent writes in the sense that an instance
already returned on an earlier page is never returned again on a later page of
the same walk.

#### Scenario: Paging through more instances than the limit

- **WHEN** five instances exist and the read is called with `limit: 2`
- **THEN** two summaries and a cursor are returned
- **AND** passing that cursor returns the next two, then the last one with no cursor
- **AND** the five summaries across the three pages are distinct and cover every instance

#### Scenario: Results are newest-first

- **WHEN** three instances are created in sequence
- **AND** the read is called with no filters
- **THEN** the most recently created instance is first

#### Scenario: A limit above the maximum is capped

- **WHEN** the read is called with a `limit` above the enforced maximum
- **THEN** at most the maximum number of summaries is returned

#### Scenario: An instance created after the walk started does not disturb it

- **WHEN** a page has been read with `limit: 2` and a cursor returned
- **AND** a new instance is created
- **AND** the next page is read with that cursor
- **THEN** no summary from the first page appears again

#### Scenario: Two instances created within the same millisecond page correctly

<!-- antislop: allow passive-voice -->
- **WHEN** two instances were created within the same millisecond of each other
- **AND** the read is called with `limit: 1`, returning the newer one and a cursor
- **AND** the next page is read with that cursor
- **THEN** the older instance is returned on the second page, not dropped from the walk

### Requirement: Read one instance's append-only record

The Runtime API Layer SHALL expose a read returning one instance's runtime
record as a single chronologically ordered sequence merging its `HistoryEntry`
rows and its `InstanceEvent` rows. Each returned element SHALL be
discriminated so a consumer can tell a transition from an event without
inspecting its shape.

Ordering SHALL be by `transitionSeq` ascending, then by `at` ascending — the
rule the runtime record already defines, since an event never advances the
sequence and may therefore share one with a transition and with other events.
The merge SHALL be performed by this read, not left to its callers.

Reading the record of an unknown instance SHALL return an empty sequence
rather than an error; the record is append-only and an unknown instance has
written nothing.

#### Scenario: Transitions and events are returned merged and ordered

- **WHEN** an instance has transitioned twice and recorded an event at the second sequence
- **THEN** the read returns three elements
- **AND** they are ordered by `transitionSeq` then `at`
- **AND** each is tagged as a history entry or an instance event

#### Scenario: Several events sharing one sequence order by time

- **WHEN** two events are recorded at the same `transitionSeq`
- **THEN** the one with the earlier `at` is returned first

#### Scenario: An unknown instance has an empty record

- **WHEN** the read is called with an instance id that does not exist
- **THEN** an empty sequence is returned and no error is raised

#### Scenario: The record read is paginated

- **WHEN** an instance's record is longer than the requested `limit`
- **THEN** a page of that length and a cursor are returned
- **AND** the cursor yields the following elements in the same order

### Requirement: The read accepts a visible scope

The read SHALL additionally accept `scope: "visible"`. It SHALL return two
sets, unioned. The first is the instances whose principal set matches the
calling actor, less those an administrator revoked from them. The second is
the instances that assign the actor now, which the existing `scope: "mine"`
predicate already describes. `instance-visibility-set` owns both rules.

The read resolves that actor from the request's credential, the same rule
`scope: "mine"` already carries. A caller MUST NOT reach another actor's
visible set.

`scope: "visible"` is participant-facing. The existing participant-facing rules
therefore apply to it unchanged: it excludes a test instance, and it does not
set `includeDegraded`.

The two participant scopes ask different questions. The `mine` scope asks which
instances await this actor now, so it reads the current step's assignment
alone. The `visible` scope asks which instances this actor took part in, so it
reads the accumulated set. An instance the actor approved last week answers the
second question and not the first.

The `started` scope differs the same way. A starter is one principal among
several, so that scope returns a subset.

The existing requirement that the read does not scope results to the calling
actor implicitly SHALL continue to hold. The `visible` scope scopes explicitly.
The caller names it.

Combining `scope: "visible"` with an explicit `assignedTo` or `startedBy` SHALL
narrow conjunctively, the way every other filter does. Neither reaches an
instance outside the caller's visible set.

#### Scenario: A former approver finds a completed instance

- **WHEN** actor A was an assignment candidate on a step of an instance
- **AND** that instance has since completed
- **AND** A calls the read with `scope: "visible"`
- **THEN** the result includes that instance

#### Scenario: scope=mine does not return the same instance

- **WHEN** that same actor A calls the read with `scope: "mine"`
- **THEN** the result excludes that instance, because A is not a candidate or
  claimant on its current step

#### Scenario: A cancelled instance stays visible to its participants

- **WHEN** an operator cancels an instance A took part in, and A calls the
  read with `scope: "visible"`
- **THEN** the result includes that instance

#### Scenario: An uninvolved actor sees nothing

- **WHEN** actor B, who is not a principal of any instance, calls the read with
  `scope: "visible"`
- **THEN** the result is empty

#### Scenario: scope=visible ignores a client-supplied actor id

- **WHEN** actor A calls the read with `scope: "visible"` and an `assignedTo`
  naming actor B
- **THEN** the result holds only instances of A's own visible set, narrowed
  further by the `assignedTo` predicate

#### Scenario: scope=visible excludes a test instance

- **WHEN** an actor who started a test instance calls the read with
  `scope: "visible"`
- **THEN** the result excludes that test instance

#### Scenario: A role-derived principal matches

- **WHEN** an instance holds role R as a principal, and an actor holding R calls
  the read with `scope: "visible"`
- **THEN** the result includes that instance

#### Scenario: Paging works the same way

- **WHEN** a `scope: "visible"` result spans more than one page
- **THEN** it pages by the same keyset order and cursor the read already uses
- **AND** no instance appears on two pages
