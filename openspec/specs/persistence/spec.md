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

`initSchema` SHALL declare an index for each predicate the engine queries
hot paths on, including the two currently missing:

- `history_entries (instance_id, transition_seq)` — mirroring the index its
  structurally identical sibling `instance_events` already has. Its readers
  are the outcome append (`UPDATE ... WHERE instance_id = $1 AND
  transition_seq = $2`), which runs for every delivered and dead-lettered
  outbox row *inside the delivery's marking transaction while it holds the
  outbox row lock* — so the scan cost converts directly into lock-hold time
  and caps outbox throughput — and the instance record read, whose
  `instance_events` counterpart is already indexed.
- `instances ((body->'parent'->>'instanceId'))` — a plain expression index,
  matching the treatment the sibling jsonb predicates
  (`instances_claimed_by_idx`, the selection index, the candidates GIN index)
  already get. Its readers are the cancel cascade's child sweep and the
  migration live-child gate. The cancel sweep runs once per nesting level,
  inside the caller's transaction, holding instance row locks.

Both tables are append-only or never pruned, so an unindexed predicate against
them grows with lifetime volume rather than live volume.

Each index SHALL carry a comment naming its readers, as the existing
expression indexes do — the file is read as the schema's documentation.

As with the instance population scan, the requirement is on the **index
existing**, not on a particular query plan: a planner may legitimately choose
a sequential scan on a small relation, so asserting the plan would assert
something the datastore is free to vary. Confirming that the plan actually
uses each index is a verification step for the change that adds it, not a
property of the specification.

#### Scenario: Initialisation creates the history-entry index

- **WHEN** the schema is initialised
- **THEN** an index over `history_entries (instance_id, transition_seq)`
  exists, mirroring the one `instance_events` already has

#### Scenario: Initialisation creates the parent-instance index

- **WHEN** the schema is initialised
- **THEN** an expression index over `instances (body->'parent'->>'instanceId')`
  exists

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and both indexes are unchanged

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
