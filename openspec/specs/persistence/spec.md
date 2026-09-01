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
executing a command. Every statement in `initSchema` is idempotent:
`CREATE ... IF NOT EXISTS` for a relation or index, `ADD COLUMN IF NOT EXISTS`
for a column, `CREATE OR REPLACE` for a function, and `DROP ... IF EXISTS`
before `CREATE TRIGGER`. A `DO` block guards a role's creation on
`pg_roles`, and `GRANT` is idempotent by nature. The call is therefore
a no-op in effect against a database that already has the schema.

The audit relation and its redaction function SHALL be created by the
role that owns them, under `SET LOCAL ROLE`. `initSchema` SHALL run no
`ALTER ... OWNER TO`. That statement raises against a non-owner, and it
raises again on a run after the ownership is already correct. A
`CREATE OR REPLACE FUNCTION` raises the same way. The second run's
no-op therefore SHALL hold for a non-superuser role too.

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
- **THEN** startup proceeds normally: no table, index or row is altered.
  Each function and trigger is replaced by an identical definition, and the
  audit relation's ownership and grants are unchanged

#### Scenario: Administering users on a fresh database works

- **WHEN** the user-administration CLI is run against a database with no
  `auth_users` table
- **THEN** it creates the schema and completes the command

#### Scenario: A missing connection string fails at startup

- **WHEN** a process starts with `DATABASE_URL` unset
- **THEN** it fails immediately with an error naming the variable, rather than
  failing later on an unrelated-looking query

### Requirement: initSchema creates the instance audit relation

`initSchema` SHALL create a relation holding one row per written
instance field. The relation SHALL key on the instance and a per-instance
sequence. It SHALL also carry the transition sequence in force. A reader
can then join it to `history_entries` and `instance_events`.

The relation SHALL carry an index on the instance and its sequence. That
index serves the two reads the capability rests on. The first replays one
instance's entries in order. The second finds its chain head. The index
SHALL carry a comment naming its two readers, as this capability's
`Every query predicate the engine relies on has a supporting index`
requirement already demands of every index.

`initSchema` SHALL also install the `pgcrypto` extension. The trigger's
per-row salt calls `gen_random_bytes`, which core Postgres does not
ship. The install SHALL be idempotent, so a second `initSchema` run
neither fails nor replaces it.

#### Scenario: Starting the server creates the audit relation

- **WHEN** `initSchema` runs against an empty database
- **THEN** the audit relation and its index exist

#### Scenario: Starting the server installs pgcrypto

- **WHEN** `initSchema` runs against a database without the extension
- **THEN** `pgcrypto` is installed, and a second run leaves it in place

#### Scenario: Starting the server twice leaves the relation alone

- **WHEN** `initSchema` runs against a database that already holds the
  relation and rows
- **THEN** the relation and its rows are unchanged

### Requirement: A trigger populates the audit relation

`initSchema` SHALL create triggers on `instances` firing after an insert
and after an update. They SHALL share one function. That function SHALL
compare the old and new field data. It SHALL write one row per field
whose value differs.

The second trigger SHALL carry a `WHEN` clause rejecting a row whose new
field data matches its old. A write touching nothing else then never
enters the function.

The shared function SHALL run with the invoking role's privileges. That
role keeps `INSERT` on the relation and holds no `UPDATE` or `DELETE`. It
SHALL read the acting actor and the write path from transaction-scoped
settings. An entry whose write path supplied no actor or no source SHALL
carry a null in that column. It SHALL NOT carry a fabricated value.

A value an earlier transaction on that connection left behind SHALL read
as none supplied. The column carries a null there, never an empty
string.

These are the schema's first triggers, and the redaction function beside
them is its first definer-rights function. All are created idempotently,
so a second `initSchema` replaces them rather than failing.

#### Scenario: Starting the server creates the triggers

- **WHEN** `initSchema` runs against an empty database
- **THEN** both triggers and their shared function exist on `instances`

#### Scenario: An insert of instance data writes audit rows

- **WHEN** a row is inserted into `instances` with two fields in its data
- **THEN** the audit relation gains two rows

#### Scenario: An update touching no field data writes no audit row

- **WHEN** an `instances` row is updated without changing its field data
- **THEN** the audit relation gains no row

### Requirement: The audit relation is append-only for the application

`initSchema` SHALL grant only insert and select on the audit relation to
the role the engine connects as. It SHALL NOT grant update or delete.
Insert SHALL stay, so the trigger's own writes still land.

`initSchema` SHALL also revoke the redaction function's execute
privilege from `PUBLIC`. A function created with no explicit privilege
list carries one. The redaction is the single path that clears a stored
value, and it belongs to the engine's role alone.

The relation and the redaction function SHALL belong to a separate
login-less owner role `initSchema` creates. Clearing the redactable
fields' values SHALL run under that owner's privilege. The trigger's
append and that redaction SHALL be the only two paths that write the
relation.

`initSchema` SHALL grant the engine's role membership in that owner role
without inheritance. Creating the owner's objects needs the membership.
An inheriting grant would hand the engine's role the owner's update and
delete outright, with no assumption of the role.

A superuser is restrained by no grant. The guarantee therefore holds
against a non-superuser role, and the tests SHALL create one to prove it
there.

#### Scenario: A non-superuser role cannot update an audit row

- **WHEN** a non-superuser role with the engine's grants and its
  membership updates a row of the audit relation
- **THEN** the database refuses the statement

#### Scenario: A non-superuser role cannot delete an audit row

- **WHEN** a non-superuser role with the engine's grants and its
  membership deletes a row of the audit relation
- **THEN** the database refuses the statement

### Requirement: Chain verification is a database function

`initSchema` SHALL create a function verifying one instance's audit
chain. The function SHALL walk the instance's rows in sequence order and
recompute each row's hash.

It SHALL do two things per row. It SHALL recompute the row's hash from
the row's metadata, its stored value fingerprint and its predecessor's
hash. It SHALL also recompute that fingerprint from the row's salt and
value, but only where the salt is present. A redacted row's fingerprint
is unverifiable against a value that no longer exists. That is the one
check redaction deliberately gives up.

Verification SHALL live in the database rather than in the engine's
TypeScript. The hash covers the database's own rendering of a value. A
second implementation would have to reproduce that rendering exactly.

#### Scenario: Starting the server creates the verification function

- **WHEN** `initSchema` runs against an empty database
- **THEN** the verification function exists

#### Scenario: Verification reads an untampered chain as holding

- **WHEN** the function runs against an instance whose rows the trigger
  alone wrote
- **THEN** it reports the chain as holding

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

### Requirement: Six standardized instance keys are generated columns

The datastore SHALL carry six more `instances` columns, each a
`GENERATED ALWAYS AS (...) STORED` projection of a key already present in
the jsonb `body`:

- `process_id text GENERATED ALWAYS AS ((body->>'processId')) STORED`
- `version integer GENERATED ALWAYS AS (((body->>'version')::integer)) STORED`
- `status text GENERATED ALWAYS AS ((body->>'status')) STORED`
- `current_step_id text GENERATED ALWAYS AS ((body->>'currentStepId')) STORED`
- `started_by text GENERATED ALWAYS AS ((body->>'startedBy')) STORED`
- `started_at text GENERATED ALWAYS AS ((body->>'startedAt')) STORED`

`initSchema` SHALL add each with `ALTER TABLE instances ADD COLUMN IF NOT
EXISTS`, the same additive pattern `redacted_at` and every other `instances`
column already follows.

`started_at` SHALL be `text`, not `timestamptz`. Every writer produces
`startedAt` as `new Date().toISOString()`, a fixed-width ISO-8601 string in
UTC. A `text` column therefore ranges and sorts the same way a `timestamptz`
column would.

A generation expression casting to `timestamptz` is not usable here.
Postgres rejects it as not immutable, because that cast reads session
`DateStyle` and `TimeZone`.

The jsonb key backing each column SHALL remain in `body`, unchanged. No read
path has to switch to the generated column. The six columns exist so a
query MAY use one directly.

#### Scenario: Initialisation adds the six columns

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `instances` gains `process_id`, `version`, `status`,
  `current_step_id`, `started_by` and `started_at`, each generated from the
  matching `body` key

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the six columns are unchanged

#### Scenario: A pre-existing row backfills on column addition

- **WHEN** the six columns are added to a table already holding instance
  rows
- **THEN** every existing row's new columns read back the value already
  present at that key in `body`

#### Scenario: A generated column tracks its body key

- **WHEN** an instance's `body` is updated so that one of the six keys
  changes (for example a transition changes `currentStepId` and `status`)
- **THEN** the matching generated column reads the new value, in the same
  row, with no separate write

### Requirement: The `started_at` predicate is indexed

The datastore SHALL carry `CREATE INDEX IF NOT EXISTS instances_started_idx
ON instances (started_at)`. This is a plain btree index over the generated
column the requirement above adds.

`selectInRange` (`src/engine/reporting.ts`) SHALL filter on `started_at`
directly, as `started_at >= range.from AND started_at <= range.to`, rather
than casting `body->>'startedAt'` to `timestamptz`. A query naming the
original jsonb expression cannot use an index built over the generated
column. The planner does not substitute one for the other, so the rewrite
is what makes the new index usable.

#### Scenario: Initialisation creates the started_at index

- **WHEN** `initSchema` runs
- **THEN** an index over `instances (started_at)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and `instances_started_idx` is unchanged

#### Scenario: A cycle-time query filters through the generated column

- **WHEN** `selectInRange` runs for a process and a date range
- **THEN** its query filters on `started_at`, not on a `timestamptz` cast of
  `body->>'startedAt'`, and returns the same instances a range check against
  `startedAt` would

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
database that has never run it reaches it through the same code path as one
that has.

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
every row the engine has written. They part on a value that names no stored
row. Two classes qualify, and they fail in different ways.

A value outside the range an `integer` column carries makes the datastore
raise. The read binds the filter through a cast, and that cast is where the
range fails.

A value that is not an integer raises nothing. The datastore rounds it, or
promotes the comparison and matches no row. Its cost is a silently empty page
rather than an answer.

Neither outcome is one the read should hand back. A caller-supplied value of
either class SHALL be rejected before the query runs. The `instance-query`
capability carries that rule. The `http-wrapper` applies it to every version a
route reads, since every `version integer` column shares the range.

A cast around an indexed expression is not that expression. A predicate
casting `body->>'version'` to `int` therefore reaches no column of an index
built over `(body->>'version')`. That is why the migration scans carried an
unusable second index column beforehand.

#### Scenario: A version filter selects the pinned instances

- **WHEN** the instance list read runs with `processId` and `version` set
- **THEN** it returns exactly the instances pinned to that process and version

#### Scenario: The migration population scan reads the column

- **WHEN** the migration population scan selects the instances pinned to one
  process and version
- **THEN** its predicate names `process_id`, `version` and `status`
- **AND** its `version` comparison carries no cast
