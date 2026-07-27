## MODIFIED Requirements

### Requirement: List instance summaries with filters

The Runtime API Layer SHALL expose a read that returns a page of instance
summaries. A summary carries the instance's identity and lifecycle state —
`instanceId`, `processId`, `version`, `status`, `currentStepId`,
`transitionSeq`, `assignment` (candidates and claim state), `startedBy`,
`createdAt`, `currentStepEnteredAt`, `processLabel`, `stepLabel`,
`processBaseLocale` — and SHALL NOT carry the instance `data` payload.
`processLabel` and `stepLabel` are `LocalizedText`, resolved through the
existing cached definition store against the pinned version body;
`processBaseLocale` is that same body's `baseLocale`, included so a caller can
resolve `processLabel`/`stepLabel` with the correct fallback locale without a
second request. No other part of the process body (guards, action configs) is
exposed through the summary.

The read SHALL accept these optional filters, combined conjunctively:
`processId`, `status` (one or more of the instance statuses), `currentStepId`,
`startedBy`, `claimedBy`, and `assignedTo`. `assignedTo` SHALL match an
instance whose current step is claimed by that actor, OR whose current step is
unclaimed and lists that actor among its assignment candidates — the
participant inbox predicate. The read SHALL additionally accept `scope: "mine"`,
which applies the identical inbox predicate against the calling actor resolved
from the request's credential rather than a client-supplied id; a caller MUST
NOT be able to substitute `scope=mine` for the effect of an arbitrary
`assignedTo` value belonging to another actor.

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
