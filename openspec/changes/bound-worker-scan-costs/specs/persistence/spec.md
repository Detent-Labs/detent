# Spec Delta

## ADDED Requirements

### Requirement: The worker scans and the admin outbox list have supporting indexes

`initSchema` SHALL declare an index for each of three reads whose cost would
otherwise follow the volume of instances or outbox rows ever stored. The
resolution claim reads only instances that carry a re-resolution mark. The
retention sweep reads only unredacted terminal instances, in entry-time order.
The admin outbox list reads rows newest-first.

#### Scenario: Initialisation creates the marked-instance index

- **WHEN** `initSchema` runs
- **THEN** a partial index over `instances (instance_id)` exists for rows whose
  `resolve_state` differs from `idle`
- **AND** the former index over `instances (resolve_state)` does not exist

#### Scenario: Initialisation creates the retention index

- **WHEN** `initSchema` runs
- **THEN** a partial index over the entry time of `completed` and `cancelled`
  instances with a `NULL` `redacted_at` exists, with `instance_id` as tie-break
- **AND** the former index over `instances (redacted_at)` does not exist

#### Scenario: Initialisation creates the outbox list index

- **WHEN** `initSchema` runs
- **THEN** an index over `outbox (created_at DESC, idempotency_key DESC)` exists

#### Scenario: A second initialisation succeeds

- **WHEN** the schema initialises twice
- **THEN** the second run succeeds and all three indexes stay as they were
