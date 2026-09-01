<!-- antislop: allow-file passive-voice -->
<!-- Matches the base persistence spec.md's own directive: Gherkin-style scenarios ("WHEN the schema is initialised") read naturally as passive and that file already permits it. -->
## ADDED Requirements

### Requirement: Five more standardized instance keys are generated columns

The datastore SHALL carry five more `instances` columns, each a
`GENERATED ALWAYS AS (...) STORED` projection of a key already present in
the jsonb `body`:

- `claimed_by text GENERATED ALWAYS AS ((body->'assignment'->>'claimedBy')) STORED`
- `candidates jsonb GENERATED ALWAYS AS ((body->'assignment'->'candidates')) STORED`
- `parent_instance_id text GENERATED ALWAYS AS ((body->'parent'->>'instanceId')) STORED`
- `current_step_entered_at text GENERATED ALWAYS AS ((body->>'currentStepEnteredAt')) STORED`
- `chained_from text GENERATED ALWAYS AS ((body->>'chainedFrom')) STORED`

`initSchema` SHALL add each with `ALTER TABLE instances ADD COLUMN IF NOT
EXISTS`, the additive pattern the six columns above already follow.

`candidates` SHALL be `jsonb`, not `text[]`. `assignment.candidates` is a
jsonb array, and unnesting one into a `text[]` needs a set-returning
function inside a subquery. Postgres rejects a subquery in a generation
expression. `jsonb -> text` is immutable and yields jsonb, so the column
holds the array as jsonb and the two operators the inbox predicate uses,
`@>` and `?|`, apply to it unchanged.

`current_step_entered_at` SHALL be `text`, not `timestamptz`, for the
reason `started_at` already is. A generation expression casting to
`timestamptz` is not immutable, because that cast reads session `DateStyle`
and `TimeZone`. Every writer produces `currentStepEnteredAt` as
`new Date().toISOString()`.

The jsonb key backing each column SHALL remain in `body`, unchanged.
`parseInstance` SHALL keep reading the body.

#### Scenario: Initialisation adds the five columns

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `instances` gains `claimed_by`, `candidates`,
  `parent_instance_id`, `current_step_entered_at` and `chained_from`, each
  generated from the matching `body` key

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the five columns are unchanged

#### Scenario: A pre-existing row backfills on column addition

- **WHEN** the five columns are added to a table already holding instance
  rows
- **THEN** every existing row's new columns read back the value already
  present at that key in `body`

#### Scenario: An absent key reads as NULL

- **WHEN** an instance has no `parent`, no `chainedFrom` and no
  `assignment.claimedBy`
- **THEN** `parent_instance_id`, `chained_from` and `claimed_by` are all
  SQL NULL on that row

#### Scenario: A generated column tracks its body key

- **WHEN** an instance's `body` is updated so that `assignment.claimedBy`
  changes, as a claim or a release does
- **THEN** `claimed_by` reads the new value, in the same row, with no
  separate write

### Requirement: The assignment and parent predicates read generated columns

The datastore SHALL carry three indexes over the columns the requirement
above adds, and SHALL NOT carry the three expression indexes they replace:

- `instances_claimed_idx`, a btree over `instances (claimed_by)`
- `instances_candidate_idx`, a GIN index over `instances (candidates)`
- `instances_parent_instance_idx`, a btree over
  `instances (parent_instance_id)`

`initSchema` SHALL drop `instances_claimed_by_idx`,
`instances_candidates_idx` and `instances_parent_idx` with `DROP INDEX IF
EXISTS`, then create the three above with `CREATE INDEX IF NOT EXISTS`. The
new names differ from the old ones, so no run has to compare an index's
definition against the one it wants.

Each reader's predicate SHALL name the column rather than the jsonb path
the column was generated from. The planner substitutes neither for the
other, so an unrewritten query would leave the new index unused. The
readers are:

- `buildInstanceWhere` (`src/runtime/api.ts`), for its `claimedBy` filter
  and for the inbox predicate its `assignedTo` filter builds
- `sweepCancelledChildren` (`src/engine/transition.ts`) and the live-child
  gate in `migrateOne` (`src/engine/migration.ts`), both for
  `parent_instance_id`

`chained_from` SHALL carry no index. Nothing reads it.

Each index SHALL carry a comment naming its readers, the convention the
surrounding indexes follow.

#### Scenario: Initialisation creates the three column indexes

- **WHEN** `initSchema` runs
- **THEN** `instances_claimed_idx`, `instances_candidate_idx` and
  `instances_parent_instance_idx` exist

#### Scenario: Initialisation retires the three expression indexes

- **WHEN** `initSchema` runs against a database that holds
  `instances_claimed_by_idx`, `instances_candidates_idx` and
  `instances_parent_idx`
- **THEN** none of those three exists afterwards

#### Scenario: Initialisation is idempotent

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and the three column indexes are
  unchanged

#### Scenario: The inbox predicate reads the assignment columns

- **WHEN** `listInstances` runs with an `assignedTo` filter
- **THEN** its query filters on `claimed_by` and `candidates`, and returns
  the same instances the jsonb-path predicate returned

#### Scenario: The child sweep reads the parent column

- **WHEN** the cancel cascade sweeps a parent's children
- **THEN** its query filters on `parent_instance_id`, and finds the same
  children the jsonb-path predicate found

### Requirement: The retention sweep compares ISO-8601 text

This requirement constrains how the sweep's SQL is written, not which
instances it selects. `data-retention` owns the eligibility rule and keeps
it unchanged: `completed` or `cancelled`, `redacted_at` NULL, and
`currentStepEnteredAt` older than the window.

`sweepRetention` (`src/engine/retention.ts`) SHALL select an instance for
redaction by comparing `COALESCE(current_step_entered_at, started_at)`
against a cutoff string, rather than by casting either `body` key to
`timestamptz`.

The cutoff SHALL be built in the same statement, as
`to_char((now() - make_interval(days => $1)) AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`. That format matches what
`Date.prototype.toISOString` produces, so the two sides of the comparison
share one representation.

`make_interval` SHALL stay the source of the window, so the sweep keeps
counting calendar days rather than fixed 24-hour spans.

The `COALESCE` fallback to `started_at` SHALL remain. An instance created
before `currentStepEnteredAt` existed has no value at that key, and without
the fallback the oldest instances would never become eligible.

#### Scenario: An instance past the window is selected

- **WHEN** the sweep runs with a window of 30 days against an instance
  whose `currentStepEnteredAt` is 31 days old
- **THEN** that instance is selected for redaction

#### Scenario: An instance inside the window is skipped

- **WHEN** the sweep runs with a window of 30 days against an instance
  whose `currentStepEnteredAt` is 29 days old
- **THEN** that instance is not selected

#### Scenario: An instance without the key falls back to its start

- **WHEN** the sweep runs against an instance whose `body` carries no
  `currentStepEnteredAt`
- **THEN** its `startedAt` decides eligibility

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
  throughput.
- `instances (parent_instance_id)`, named
  `instances_parent_instance_idx`. A plain btree over the generated column,
  which replaced the expression index `instances_parent_idx`. Its readers
  are the cancel cascade's child sweep and the migration live-child gate.
  The cancel sweep runs once per nesting level, inside the caller's
  transaction, holding instance row locks.
- `instances ((body->>'currentStepId'))`, named `instances_current_step_idx`. A
  plain expression index. Its readers are the instance list read and the
  instance data read, both reaching it through `buildInstanceWhere`'s shared
  `currentStepId` filter.
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
`instances_claimed_idx`, the btree over the generated `claimed_by` column.
The `currentStepId` and `startedBy` filters reach the two indexes above.

An expression index and a generated column are not interchangeable to the
planner. It substitutes an expression index into a predicate naming that
expression, and it substitutes no generated column. So an index over a
generated column SHALL be paired with a predicate that names the column.
Where no such rewrite has happened, as with `currentStepId` and
`startedBy`, the index SHALL stay an expression index.

Both tables are append-only or never pruned. So an unindexed predicate against
them grows with lifetime volume rather than live volume.

Each index SHALL carry a comment naming its readers, the way the existing
expression indexes do. A reader treats that file as the schema's documentation.

<!-- antislop: allow synonym-rotation -->
<!-- "change" names an OpenSpec change here; the "update" it pairs with is the SQL privilege the audit requirements above withhold. -->
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
- **THEN** a btree index over `instances (parent_instance_id)` exists

#### Scenario: Initialisation creates the current-step index

- **WHEN** `initSchema` runs
- **THEN** an expression index over `instances (body->>'currentStepId')` exists

#### Scenario: Initialisation creates the started-by index

- **WHEN** `initSchema` runs
- **THEN** an expression index over `instances (body->>'startedBy')` exists

#### Scenario: Initialisation is idempotent

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and changes none of the enumerated indexes
