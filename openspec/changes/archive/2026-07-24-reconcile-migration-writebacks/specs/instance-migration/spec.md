## MODIFIED Requirements

### Requirement: An instance with actions in flight is not migrated

An instance holding an outbox row that is `claimed` with an active lease
(`claimed_at >= now() - CLAIM_LEASE_MS`) SHALL be skipped, with the reason
distinguishing it from an unmappable instance. It remains on the source
version and is migrated by a later invocation once that claim delivers or its
lease expires.

A live-claimed row's handler may be executing right now with the source
version's field ids already baked into its in-memory snapshot; nothing done to
the stored row can retroactively fix that computation.

An instance holding only `pending` rows, or `claimed` rows whose lease has
expired, SHALL NOT be skipped on this basis: those rows are eligible for
remap-in-place (see "A safe outbox row is remapped through the migration's
fieldMap") and the migration proceeds.

#### Scenario: An instance with a live-claimed action is skipped

- **WHEN** an instance in the population holds an outbox row `claimed` with an
  active lease
- **THEN** it is not migrated, it keeps its pin and step, and it is reported
  as skipped with the in-flight reason

#### Scenario: The skip is distinguishable from an unmappable skip

- **WHEN** the event log is queried after an invocation
- **THEN** an instance skipped for a live-claimed action is distinguishable
  from one skipped as unmappable

#### Scenario: A later invocation migrates it once the claim settles

- **WHEN** the live-claimed row is delivered, or its lease expires, and the
  migration is invoked again
- **THEN** it migrates normally

#### Scenario: Delivered rows do not block a migration

- **WHEN** an instance holds only delivered outbox rows
- **THEN** it migrates normally

#### Scenario: A pending row does not block migration

- **WHEN** an instance in the population holds only outbox rows with status
  `pending`
- **THEN** it migrates in this invocation rather than being skipped

#### Scenario: An abandoned claim does not block migration

- **WHEN** an instance holds a `claimed` outbox row whose lease has expired
- **THEN** it migrates in this invocation rather than being skipped

## ADDED Requirements

### Requirement: A safe outbox row is remapped through the migration's fieldMap

For each of an instance's outbox rows eligible under the in-flight-actions
requirement (`pending`, or `claimed` with an expired lease), `migrateOne`
SHALL rewrite the target field ids in that row's stored `Action.output`
mapping using the same snapshot-based `fieldMap` image the data-payload remap
uses: a target id present as a `fieldMap` key SHALL be replaced by its image;
every other target id SHALL be retained by identity. The rewrite SHALL be
computed once from the full map, not applied as sequential renames.

An identity-retained target id MAY point at a field the target catalog no
longer declares. Such a row SHALL still deliver and write through under that
id (orphan write-through), matching the data-payload remap's existing policy
for a retained orphan.

The remap SHALL be applied in the same transaction as the instance's own
migration commit.

#### Scenario: An action output target is renamed

- **WHEN** an eligible outbox row's `Action.output` targets a field id the
  plan's `fieldMap` renames from A to B
- **THEN** after migration the row's stored mapping targets B, and delivery
  writes the result under B

#### Scenario: A swap resolves correctly

- **WHEN** `fieldMap` maps A to B and B to A, and two eligible rows target A
  and B respectively
- **THEN** after migration the row that targeted A now targets B and the row
  that targeted B now targets A

#### Scenario: An unmapped target id is retained by identity

- **WHEN** an eligible outbox row's `Action.output` targets a field id absent
  from `fieldMap`
- **THEN** after migration the row still targets that same field id

#### Scenario: An orphaned target still writes through on delivery

- **WHEN** an eligible outbox row's target id is retained by identity and the
  target catalog no longer declares that field
- **THEN** the row still delivers normally and its `ActionOutcome` is recorded
  as `succeeded`, not suppressed or dropped

### Requirement: Outbox rows are locked before the instance row during migration

`migrateOne` SHALL lock an instance's undelivered outbox rows, in a stable
order, before locking and reading that instance's row, within the same
transaction — matching the lock order the outbox delivery transaction already
uses (outbox row before instance row), so concurrent migration and delivery
cannot deadlock.

#### Scenario: Migration locks outbox rows first

- **WHEN** `migrateOne` processes an instance holding undelivered outbox rows
- **THEN** those rows are locked before the instance row is locked, within the
  same transaction

#### Scenario: Concurrent migration and delivery do not deadlock

- **WHEN** a migration and a delivery of the same instance's outbox row are
  attempted concurrently
- **THEN** neither transaction deadlocks; one proceeds and the other either
  waits or is skipped via lock contention, never blocked circularly

### Requirement: A field-version mismatch on a locked outbox row fails the migration

Before remapping a safe outbox row, `migrateOne` SHALL verify that row's
stored `field_version` equals the instance's pre-migration version. A
mismatch SHALL fail that instance's migration (landing it in the `failed`
outcome, matching the existing `definitionHash` pin-mismatch precedent)
rather than being handled as a normal skip or silently remapped anyway.

#### Scenario: A matching field_version remaps normally

- **WHEN** a safe outbox row's `field_version` equals the instance's current
  version
- **THEN** the row is remapped and the migration proceeds

#### Scenario: A mismatched field_version fails the instance

- **WHEN** a safe outbox row's `field_version` does not equal the instance's
  current version
- **THEN** the instance's migration fails and it is reported in the `failed`
  outcome, with no `HistoryEntry` or `migration.skipped` event appended for it
