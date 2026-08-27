## MODIFIED Requirements

### Requirement: Every query predicate the engine relies on has a supporting index

`initSchema` SHALL declare an index for each predicate the engine queries hot
paths on. The enumeration below names the predicates identified so far:

- `history_entries (instance_id, transition_seq)`. Its structurally identical
  sibling `instance_events` already has this index. Its readers are the outcome
  append and the instance record read. The outcome append runs
  `UPDATE ... WHERE instance_id = $1 AND transition_seq = $2`, for every
  delivered and dead-lettered outbox row. It runs inside the delivery's marking
  transaction, holding the outbox row lock, so its scan cost caps outbox
  throughput. The instance record read has an indexed `instance_events`
  counterpart.
- `instances ((body->'parent'->>'instanceId'))`. A plain expression index,
  matching the treatment the sibling jsonb predicates already get. Those are
  `instances_claimed_by_idx`, the selection index and the candidates GIN index.
  Its readers are the cancel cascade's child sweep and the migration live-child
  gate. The cancel sweep runs once per nesting level, inside the caller's
  transaction, holding instance row locks.
- `instances ((body->>'currentStepId'))`, named `instances_current_step_idx`. A
  plain expression index too, of the same shape as the parent-instance one.
  Its readers are the instance list read and the instance data read, both
  reaching it through `buildInstanceWhere`'s shared `currentStepId` filter.
- `instances ((body->>'startedBy'))`, named `instances_started_by_idx`. A plain
  expression index of that same shape. Its readers are the instance list read
  and the instance data read, both reaching it through `buildInstanceWhere`'s
  shared `startedBy` filter. The `GET /instances` route sets that filter for
  every `scope=started` request, which is a participant-facing screen.

Those last two predicates carry filters both reads share: `currentStepId` and
`startedBy`. Both reads carry six plain filters in common: `processId`,
`status`, `currentStepId`, `startedBy`, `claimedBy` and `version`. Of the six,
`processId` reaches `instances_selection_idx`'s leading column. The `version`
filter reaches that index's second column with `processId` bound beside it.
That index covers `processId`, `version` and `status`.

A `status` filter reaches its third column, which needs the two ahead of it
bound to narrow a scan. A `claimedBy` filter reaches
`instances_claimed_by_idx`. The `currentStepId` and `startedBy` filters reach
the two indexes above.

A `STORED` generated column does not serve the current-step predicate. Postgres
substitutes an expression index into a predicate. It substitutes no generated
column. So the index SHALL be an expression index.

Both tables are append-only or never pruned. So an unindexed predicate against
them grows with lifetime volume rather than live volume.

Each index SHALL carry a comment naming its readers, the way the existing
expression indexes do. A reader treats that file as the schema's documentation.

As with the instance population scan, this requirement asks only that the index
exist. It asserts no query plan. A planner may legitimately choose a sequential
scan on a small relation. Asserting the plan would assert something the
datastore is free to vary. Confirming that a plan uses each index is a
verification step for the change that adds it. It is not a property of the
specification.

#### Scenario: Initialisation creates the history-entry index

- **WHEN** `initSchema` runs
- **THEN** an index over `history_entries (instance_id, transition_seq)`
  exists, mirroring the one `instance_events` already has

#### Scenario: Initialisation creates the parent-instance index

- **WHEN** `initSchema` runs
- **THEN** an expression index over `instances (body->'parent'->>'instanceId')`
  exists

#### Scenario: Initialisation creates the current-step index

- **WHEN** `initSchema` runs
- **THEN** an expression index over `instances (body->>'currentStepId')` exists

#### Scenario: Initialisation creates the started-by index

- **WHEN** `initSchema` runs
- **THEN** an expression index over `instances (body->>'startedBy')` exists

#### Scenario: Initialisation is idempotent

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and changes none of the enumerated indexes
