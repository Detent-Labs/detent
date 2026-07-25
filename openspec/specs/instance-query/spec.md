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
summaries. A summary carries the instance's identity and lifecycle state —
`instanceId`, `processId`, `version`, `status`, `currentStepId`,
`transitionSeq`, `assignment` (candidates and claim state), `startedBy`,
`createdAt` — and SHALL NOT carry the instance `data` payload.

The read SHALL accept these optional filters, combined conjunctively:
`processId`, `status` (one or more of the instance statuses), `currentStepId`,
`startedBy`, `claimedBy`, and `assignedTo`. `assignedTo` SHALL match an
instance whose current step is claimed by that actor, OR whose current step is
unclaimed and lists that actor among its assignment candidates — the
participant inbox predicate.

With no filters the read SHALL return every instance, subject to paging. The
read SHALL NOT scope results to the calling actor implicitly.

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

### Requirement: Instance listing is keyset-paginated in a stable order

The listing read SHALL order results newest-first by creation time, tie-broken
by `instanceId`, and SHALL page by keyset cursor rather than by offset — the
same technique `migrateInstances` and `findOrphanKeys` use. It SHALL accept a
`limit` (with a documented default and an enforced maximum) and an opaque
`cursor`, and SHALL return the cursor to pass for the next page, absent when
the page is the last one.

Because runtime ids are UUIDv4 and not time-sortable, instance creation time
SHALL be persisted as its own column rather than inferred from the id.

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
