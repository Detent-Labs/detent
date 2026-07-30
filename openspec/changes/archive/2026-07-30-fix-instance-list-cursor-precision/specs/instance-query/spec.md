<!-- antislop: allow-file passive-voice sentence-length em-dash run-ons synonym-rotation long-words -->
<!-- The MODIFIED Requirements section below carries the main spec's
     existing requirement body verbatim (per the MODIFIED-requirements
     workflow: paste the entire existing block, don't lose detail), plus
     one new scenario. Normative text is unchanged; the invariant it
     already states was correct, only the implementation was wrong. -->
## MODIFIED Requirements

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

- **WHEN** two instances were created within the same millisecond of each other
- **AND** the read is called with `limit: 1`, returning the newer one and a cursor
- **AND** the next page is read with that cursor
- **THEN** the older instance is returned on the second page, not dropped from the walk
