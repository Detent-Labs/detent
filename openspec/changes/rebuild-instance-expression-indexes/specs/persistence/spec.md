<!-- antislop: allow-file passive-voice -->
<!-- Matches the base persistence spec.md's own directive: Gherkin-style scenarios ("WHEN the schema is initialised") read naturally as passive and that file already permits it. -->
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
  matching the treatment the sibling jsonb-only predicates get. Those are
  `instances_claimed_by_idx` and the candidates GIN index. Its readers are the
  cancel cascade's child sweep and the migration live-child gate. The cancel
  sweep runs once per nesting level, inside the caller's transaction, holding
  instance row locks.
- `instances (current_step_id)`, named `instances_current_step_col_idx`. A
  plain btree over the generated column, not an expression index. Its readers
  are the instance list read and the instance data read, both reaching it
  through `buildInstanceWhere`'s shared `currentStepId` filter. The bottlenecks
  work-in-progress query's `GROUP BY` reads it too.
- `instances (started_by)`, named `instances_started_by_col_idx`. A plain btree
  over the generated column too. Its readers are the instance list read and the
  instance data read, both reaching it through `buildInstanceWhere`'s shared
  `startedBy` filter. The `GET /instances` route sets that filter for every
  `scope=started` request, which is a participant-facing screen.
- `instances (process_id, version, status)`, named
  `instances_selection_col_idx`. A plain btree over three generated columns.
  It is the index the requirement "The instance population scan is indexed"
  asks for. Its readers are the migration population scan, the orphan-key
  scan, the live-version count and the bottlenecks work-in-progress query. One
  branch of the inbox predicate reaches it too, as do `buildInstanceWhere`'s
  `processId`, `version` and `status` filters.

Those last three predicates carry filters both reads share: `currentStepId`,
`startedBy`, `processId`, `status` and `version`. Both reads carry six plain
filters in common, the five above plus `claimedBy`.

Of the six, `processId` reaches `instances_selection_col_idx`'s leading
column. The `version` filter reaches that index's second column with
`processId` bound beside it. A `status` filter reaches its third column, which
needs the two ahead of it bound to narrow a scan. A `claimedBy` filter reaches
`instances_claimed_by_idx`. The `currentStepId` and `startedBy` filters reach
the two column indexes above.

An index over a generated column and an index over the expression that
generates it are not interchangeable. Postgres substitutes an expression index
into a query naming that expression. It substitutes a plain index into a query
naming that column. It crosses neither way. A predicate SHALL therefore name
the same form its index is built over. Where a column exists for a key, the
index and its predicates SHALL use the column.

A predicate that reaches none of these indexes is not bound by that rule. Two
kinds may keep naming the jsonb expression. One is a comparison already
narrowed to a single row by `instance_id`. The other is a residual filter
behind another index's selection.

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
- **THEN** an expression index over `instances (body->'parent'->>'instanceId')`
  exists

#### Scenario: Initialisation creates the current-step index

- **WHEN** `initSchema` runs
- **THEN** a plain index over `instances (current_step_id)` exists

#### Scenario: Initialisation creates the started-by index

- **WHEN** `initSchema` runs
- **THEN** a plain index over `instances (started_by)` exists

#### Scenario: Initialisation creates the selection index

- **WHEN** `initSchema` runs
- **THEN** a plain index over `instances (process_id, version, status)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and changes none of the enumerated indexes

## ADDED Requirements

### Requirement: The rebuilt column indexes replace their expression predecessors by name

`initSchema` SHALL drop `instances_selection_idx`,
`instances_current_step_idx` and `instances_started_by_idx` with
`DROP INDEX IF EXISTS`, before it creates the three column indexes.

Each new index SHALL carry a name none of the three old ones uses. A
`CREATE INDEX IF NOT EXISTS` statement leaves an index of that name alone,
whatever its definition. A reused name would therefore strand every
already-initialised database on the expression form. This project has exactly
one schema path, `initSchema`, and it MUST NOT hold a definition check or an
unconditional rebuild.

The drop SHALL stay in `initSchema` rather than run once and retire. A
database that has never seen this change reaches it through the same code path
as one that has.

A rebuilt index carries the predicates the dropped index carried. No such
predicate SHALL keep naming the dropped index's expression.

#### Scenario: Initialisation over a database holding the old indexes

- **WHEN** `initSchema` runs against a database whose `instances` relation
  carries `instances_selection_idx`, `instances_current_step_idx` and
  `instances_started_by_idx`
- **THEN** those three indexes are gone and the three column indexes exist

#### Scenario: Initialisation over a fresh database

- **WHEN** `initSchema` runs against a database with no `instances` relation
  yet
- **THEN** it succeeds, creates the three column indexes, and creates none of
  the three dropped names

#### Scenario: Re-initialisation leaves the rebuilt indexes alone

- **WHEN** `initSchema` runs twice in a row
- **THEN** the second run succeeds and the three column indexes are unchanged

### Requirement: The instance version filter compares as an integer

A predicate filtering instances by `version` SHALL compare against the
generated `version integer` column, not against `body->>'version'` as text.

`version` is a JSON number in every stored body, so the two forms agree on
every row the engine has written. They part on a value the column cannot hold.
Two classes qualify. One is not the canonical decimal form of an integer. The
other falls outside the range an `integer` column carries.

A text comparison matches no row for either. An integer comparison makes the
datastore reject both.

A caller-supplied value of either class has to be rejected before the query
runs. The `instance-query` capability carries that rule.

A cast around an indexed expression is not that expression. A predicate
casting `body->>'version'` to `int` therefore reaches no column of an index
built over `(body->>'version')`. That is why the migration scans carried an
unusable second index column before this change.

#### Scenario: A version filter selects the pinned instances

- **WHEN** the instance list read runs with `processId` and `version` set
- **THEN** it returns exactly the instances pinned to that process and version

#### Scenario: The migration population scan reads the column

- **WHEN** the migration population scan selects the instances pinned to one
  process and version
- **THEN** its predicate names `process_id`, `version` and `status`
- **AND** its `version` comparison carries no cast
