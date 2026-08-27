<!-- antislop: allow-file passive-voice -->
# persistence

## Purpose

Defines the engine's datastore and how it is accessed and configured.

## Requirements

### Requirement: PostgreSQL is the datastore
The engine SHALL persist its state to PostgreSQL. The database connection SHALL be
configured through a `DATABASE_URL` environment variable, and the development
environment SHALL provide a PostgreSQL instance addressed by that variable.

#### Scenario: Development database is available
- **WHEN** the devcontainer is started
- **THEN** a PostgreSQL 16 service is running and `DATABASE_URL` resolves to it

### Requirement: Native Postgres access via Bun.sql
Database access SHALL use Bun's native `Bun.sql`. The project MUST NOT add a
third-party PostgreSQL client library or ORM as a dependency for datastore access.

#### Scenario: No third-party Postgres client is added
- **WHEN** the project's dependencies are inspected
- **THEN** no external PostgreSQL client (e.g. `pg`, `postgres`) is present, and any
  database access is written against `Bun.sql`

### Requirement: Migration plans are persisted independently of definitions

The datastore SHALL hold migration plans in their own relation, keyed
`(processId, fromVersion, toVersion)`, carrying the rule and the instant it was first
applied. The `definitions` relation SHALL NOT be extended to carry migration rules.

Keeping the two apart is what lets a plan be corrected before use while a published
definition stays immutable, and what lets several source versions target one target
version.

#### Scenario: A plan is stored and retrieved by its version pair

- **WHEN** a plan is registered
- **THEN** it is retrievable by `(processId, fromVersion, toVersion)`

#### Scenario: The definitions relation is unchanged

- **WHEN** the schema is initialised on a database created before this capability
- **THEN** `definitions` has the same columns as before and no published row is
  rewritten

### Requirement: The instance population scan is indexed

Schema initialisation SHALL create an index supporting selection of instances by
`{processId, version, status}`.

Migration scans this predicate once per batch across the whole population, and the
instance relation stores those fields inside a jsonb body, so without an index each
batch re-scans every instance in the system. The requirement is on the index existing,
not on a particular query plan: a planner may legitimately choose a sequential scan on
a small relation, so asserting the plan would be asserting something the datastore is
free to vary.

#### Scenario: Initialisation creates the index

- **WHEN** the schema is initialised
- **THEN** an index over the instance selection fields exists

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the index is unchanged

### Requirement: Starting the server creates the schema

`startHttpServer` SHALL run `initSchema` against its database before it begins
accepting requests, and the user-administration CLI SHALL do the same before
executing a command. Every statement in `initSchema` is
`CREATE ... IF NOT EXISTS`, so the call is idempotent and a no-op against a
database that already has the schema.

Today `initSchema` has exactly two non-test callers — its own definition and
the demo script — so `bun run serve`, a first-class documented script, fails
with a relation-does-not-exist error at *request* time against any database
that has not previously had the test suite or the demo script run against it,
and `add-user` fails the same way on a fresh database.

The shared database client SHALL fail at construction, with an error naming
`DATABASE_URL`, when that variable is unset — rather than being built from an
empty string and deferring an opaque connection failure to whichever query
happens to run first.

#### Scenario: Serving against an empty database works

- **WHEN** the server is started against a Postgres database with none of the
  engine's tables
- **THEN** the schema is created before the first request is accepted, and
  requests succeed

#### Scenario: Serving against an existing database changes nothing

- **WHEN** the server is started against a database that already has the
  schema
- **THEN** startup proceeds normally and no table, index or row is altered

#### Scenario: Administering users on a fresh database works

- **WHEN** the user-administration CLI is run against a database with no
  `auth_users` table
- **THEN** it creates the schema and completes the command

#### Scenario: A missing connection string fails at startup

- **WHEN** a process starts with `DATABASE_URL` unset
- **THEN** it fails immediately with an error naming the variable, rather than
  failing later on an unrelated-looking query

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

### Requirement: Instance comments are persisted independently of the audit-trail relations

The datastore SHALL hold instance comments in their own relation,
`instance_comments` (`id`, `instance_id`, `actor_id`, `text`,
`created_at`). The `history_entries` and `instance_events` relations
SHALL NOT carry comment text.

Keeping comments in their own relation matters for one reason. A future
redaction pass can then clear personal data from a comment without
touching the append-only `HistoryEntry`/`InstanceEvent` audit trail. This
mirrors why migration plans already sit apart from `definitions`.

#### Scenario: A comment is stored in its own relation

- **WHEN** a comment is posted on an instance
- **THEN** a row is inserted into `instance_comments`, and no row is
  inserted into `history_entries` or `instance_events`

#### Scenario: The audit-trail relations are unchanged

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `history_entries` and `instance_events` have the same columns
  as before

### Requirement: Comment lookup by instance is indexed

`initSchema` SHALL create an index supporting `instance_comments`'
lookup by `(instance_id, created_at, id)`, mirroring the index
`instance_events` already has over its own `(instance_id,
transition_seq)`.

#### Scenario: Initialisation creates the comment lookup index

- **WHEN** the schema is initialised
- **THEN** an index over `instance_comments (instance_id, created_at,
  id)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the index is unchanged

### Requirement: Instance attachments are persisted independently of the audit-trail relations

The datastore SHALL hold instance attachments in their own relation,
`instance_attachments` (`id`, `instance_id`, `actor_id`, `filename`,
`content_type`, `size_bytes`, `data`, `created_at`). The `history_entries`
and `instance_events` relations SHALL NOT carry attachment data.

Keeping attachments in their own relation matters for one reason. A
future redaction pass can then clear personal data from an attachment
without touching the append-only `HistoryEntry`/`InstanceEvent` audit
trail. This mirrors why `instance_comments` already sits apart from that
audit trail.

#### Scenario: An attachment is stored in its own relation

- **WHEN** a file is uploaded to an instance
- **THEN** a row is inserted into `instance_attachments`, and no row is
  inserted into `history_entries` or `instance_events`

#### Scenario: The audit-trail relations are unchanged

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `history_entries` and `instance_events` have the same columns
  as before

### Requirement: Attachment lookup by instance is indexed

`initSchema` SHALL create an index supporting `instance_attachments`'
lookup by `(instance_id, created_at, id)`, mirroring the index
`instance_comments` already has over the same column shape.

#### Scenario: Initialisation creates the attachment lookup index

- **WHEN** the schema is initialised
- **THEN** an index over `instance_attachments (instance_id, created_at,
  id)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the index is unchanged

### Requirement: Instance redaction state is a nullable column

The datastore SHALL carry a nullable `instances.redacted_at
timestamptz` column. `initSchema` SHALL add it with:

`ALTER TABLE instances ADD COLUMN IF NOT EXISTS redacted_at timestamptz`

This is the same additive pattern every prior `instances` column
already follows: `resolve_state`, `cancel_sweep_state`,
`next_timer_at`, and `created_at`. A matching optional
`Instance.redactedAt` field SHALL join `src/schema/definition.ts`.

An instance row with `redacted_at IS NULL` SHALL be treated as not
redacted, whether it predates this column or was never redacted.

#### Scenario: Initialisation adds the column

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `instances` gains a `redacted_at timestamptz` column, nullable,
  with no default

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and `redacted_at` is unchanged

#### Scenario: A pre-existing instance reads as not redacted

- **WHEN** an instance row created before this column existed is read
- **THEN** its `redactedAt` is absent, the same as an instance whose
  `redacted_at` is `NULL`

### Requirement: initSchema creates the data list relations

`initSchema` SHALL create `data_lists` and `data_list_values` through the
same `CREATE TABLE IF NOT EXISTS` path it already uses for the other
relations.

`data_lists` holds `list_key` as its primary key, `label`, an optional
`description`, `updated_at`, and `updated_by`.

`data_list_values` holds `list_key`, `value`, a `jsonb` `label`, `active`,
`sort_order`, `updated_at`, and `updated_by`. Its key is
`(list_key, value)`. It references `data_lists` with `ON DELETE CASCADE`.

These two relations sit outside the audit backbone. They hold configuration
that an operator changes, not a record of what an instance did. No
append-only rule applies to them.

#### Scenario: Both relations exist after schema init
- **WHEN** `initSchema` runs against an empty database
- **THEN** `data_lists` and `data_list_values` exist

#### Scenario: Deleting a list takes its values with it
- **WHEN** a caller deletes a `data_lists` row
- **THEN** the values of that list go with it

#### Scenario: Schema init stays repeatable
- **WHEN** `initSchema` runs twice
- **THEN** the second run changes nothing and raises nothing

### Requirement: Each tenant database carries the whole schema

`initSchema` SHALL run against each tenant's database, unchanged in content.
Every tenant therefore holds every table this engine uses.

The control-plane schema SHALL stay separate, and `initSchema` SHALL NOT create
`tenants` in a tenant's database. A tenant that could list its siblings is the
leak this model exists to prevent.

Schema changes SHALL reach every tenant database. A tenant provisioned before a
change gains it the next time `initSchema` runs there. That makes the
idempotent `ADD COLUMN IF NOT EXISTS` convention load-bearing here, rather than
merely tidy.

#### Scenario: A provisioned tenant holds the full schema

- **WHEN** an operator provisions a tenant
- **THEN** that database carries every table `initSchema` creates

#### Scenario: A tenant cannot see the tenant list

- **WHEN** a tenant's database is inspected
- **THEN** it holds no `tenants` table

#### Scenario: An older tenant gains a later column

- **WHEN** `initSchema` runs against a tenant provisioned before a column landed
- **THEN** that database gains the column, and its existing rows survive

### Requirement: The data list tables carry columns and attributes

`data_lists` SHALL carry a `columns` relation holding the list's declared
column entries, and `data_list_values` SHALL carry an `attributes` relation
holding one value's attribute map. Both SHALL be `jsonb`, both SHALL be
`NOT NULL`, and both SHALL default to the empty case: `'[]'` for `columns` and
`'{}'` for `attributes`.

The defaults are what keep the addition free of a data migration. Every row an
existing deployment holds reads as a list with no columns. Its values read as
values with no attributes. That is exactly its behavior before this change.

Neither relation joins the audit backbone. Both are operator configuration, and
no append-only rule applies to either.

#### Scenario: An existing list reads as a list with no columns
- **WHEN** the schema is applied over a deployment whose `data_lists` rows
  predate this change
- **THEN** every such row carries an empty `columns`, and every value of it
  carries an empty `attributes`

#### Scenario: The cascade still fires on list deletion
- **WHEN** a list is deleted
- **THEN** its values go with it, attributes and all
