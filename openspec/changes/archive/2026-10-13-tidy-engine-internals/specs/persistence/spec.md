# Spec Delta

<!-- Why: each directive below covers text copied from the base requirement; its wording stays unchanged so the archive diff shows only the real edits. -->



## ADDED Requirements

### Requirement: initSchema leaves an older database as it is

`initSchema` SHALL declare every column of a table in that table's `CREATE TABLE`. It SHALL run no `ALTER TABLE ... ADD COLUMN`, no `DROP INDEX` and no data-fixing `UPDATE`. A database from before a column or an index existed stays as it is. Its operator drops that database and seeds it again.

#### Scenario: A fresh database holds every column from its CREATE TABLE

- **WHEN** `initSchema` runs against an empty database
- **THEN** every table has all of its columns, and the run issues no `ALTER TABLE ... ADD COLUMN`

#### Scenario: A table that lacks a later column stays as it is

- **WHEN** `initSchema` runs against a database whose `instances` table has no `redacted_at` column
- **THEN** the table still has no `redacted_at` column afterwards

#### Scenario: A second run changes no row

- **WHEN** `initSchema` runs twice against one database that holds outbox rows
- **THEN** the second run writes no row in `outbox` or `instances`

### Requirement: The audit grants quote the engine role as an identifier

`initSchema` SHALL name the engine's role in the audit relation's grants through `quote_ident`. A role name with a double quote SHALL NOT break the grant statements. It SHALL NOT change which role they name.

#### Scenario: A role name with a double quote receives the grants

- **WHEN** `initSchema` runs as a role whose name has a `"`
- **THEN** that role has insert and select on the audit relation and execute on the redaction function

### Requirement: The instances table declares a nullable redaction column

The datastore SHALL carry a nullable `instances.redacted_at timestamptz` column. `initSchema` SHALL declare it in the `CREATE TABLE` of `instances`, with no default. A matching optional `Instance.redactedAt` field SHALL join `src/schema/definition.ts`. An instance row with `redacted_at IS NULL` SHALL count as not redacted.

#### Scenario: Initialisation creates the redaction column

- **WHEN** the schema runs on an empty database
- **THEN** `instances` has a `redacted_at timestamptz` column, nullable, with no default

#### Scenario: A second initialisation leaves the column alone

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and `redacted_at` is the same

#### Scenario: A never-redacted instance reads as not redacted

- **WHEN** the engine reads an instance row whose `redacted_at` is `NULL`
- **THEN** its `redactedAt` is absent

### Requirement: Each tenant database carries the whole schema from its creation

`initSchema` SHALL run against each tenant's database, unchanged in content. Every tenant therefore has every table this engine uses. The control-plane schema SHALL stay separate. `initSchema` SHALL NOT create `tenants` in a tenant's database, because a tenant that could list its siblings is the leak this model exists to prevent. A tenant database from before a column landed SHALL NOT gain that column from `initSchema`. The operator provisions that tenant again.

#### Scenario: A provisioned tenant has the full schema

- **WHEN** an operator provisions a tenant
- **THEN** that database has every table `initSchema` creates

#### Scenario: A tenant has no tenant list

- **WHEN** an operator inspects a tenant's database
- **THEN** it has no `tenants` table

### Requirement: The instances table declares six generated key columns

The datastore SHALL carry six more `instances` columns: `process_id`, `version`, `status`, `current_step_id`, `started_by` and `started_at`. Each is a `GENERATED ALWAYS AS (...) STORED` projection of the jsonb `body` key of the same meaning. `initSchema` SHALL declare each in the `CREATE TABLE` of `instances`.

#### Scenario: Initialisation creates the six generated columns

- **WHEN** the schema runs on an empty database
- **THEN** `instances` has the six columns, generated from `body->>'processId'`, `(body->>'version')::integer`, `body->>'status'`, `body->>'currentStepId'`, `body->>'startedBy'` and `body->>'startedAt'`

#### Scenario: A second initialisation leaves the six columns alone

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and the six columns are the same

### Requirement: The started_at column is text

`started_at` SHALL be `text`. Every writer produces `startedAt` as `new Date().toISOString()`, a fixed-width ISO-8601 string in UTC. A `text` column therefore ranges and sorts the same way a `timestamptz` column would. A generation expression cast to `timestamptz` does not work here, because Postgres rejects it as not immutable.

#### Scenario: started_at sorts as time

- **WHEN** a query orders instances by `started_at`
- **THEN** the order equals the order of their start times

### Requirement: The jsonb key behind a generated column stays in the body

The jsonb key behind each generated column SHALL stay in `body`, unchanged. No read path has to switch to the generated column. A query MAY use one directly.

#### Scenario: A generated column follows its body key

- **WHEN** an update changes one of the six keys in an instance's `body`, for example a transition that changes `currentStepId` and `status`
- **THEN** the matching generated column reads the new value in the same row, with no separate write

### Requirement: The data list tables declare columns and attributes

`data_lists` SHALL carry a `columns` relation with the list's declared column entries. `data_list_values` SHALL carry an `attributes` relation with one value's attribute map. Both SHALL be `jsonb` and `NOT NULL`. Each SHALL default to the empty case: `'[]'` for `columns` and `'{}'` for `attributes`. `initSchema` SHALL declare both in the `CREATE TABLE` of their table.

Neither relation joins the audit backbone. Both are operator configuration, and no append-only rule applies to either.

#### Scenario: A new list reads as a list with no columns

- **WHEN** a caller creates a list with no declared columns
- **THEN** its `columns` is empty, and each of its values has an empty `attributes`

#### Scenario: Deleting a list still removes its values

- **WHEN** a caller deletes a list
- **THEN** its values go with it, attributes and all

## MODIFIED Requirements

### Requirement: Starting the server creates the schema

`startHttpServer` SHALL run `initSchema` against its database before it begins
accepting requests, and the user-administration CLI SHALL do the same before
executing a command. Every statement in `initSchema` is idempotent:
`CREATE ... IF NOT EXISTS` for a relation or index, `CREATE OR REPLACE` for a
function, and `DROP ... IF EXISTS` before `CREATE TRIGGER`. A `DO` block
guards a role's creation on `pg_roles`, and `GRANT` is idempotent by nature.
The call is therefore a no-op in effect against a database that already has
the schema.

<!-- antislop: allow passive-voice -->
The audit relation and its redaction function SHALL be created by the
role that owns them, under `SET LOCAL ROLE`. `initSchema` SHALL run no
`ALTER ... OWNER TO`. That statement raises against a non-owner, and it
raises again on a run after the ownership is already correct. A
`CREATE OR REPLACE FUNCTION` raises the same way. The second run's
no-op therefore SHALL hold for a non-superuser role too.

Today `initSchema` has exactly two non-test callers. They are its own definition
and the demo script. `bun run serve` is a first-class documented script. It
fails at request time with a relation-does-not-exist error. That happens against
any database that has not had the test suite or the demo script run against it.
`add-user` fails the same way on a fresh database.

The shared database client SHALL fail at construction when `DATABASE_URL` is
unset. The error SHALL name that variable. The client SHALL NOT build from an
empty string and defer an opaque connection error to whichever query runs first.

#### Scenario: Serving against an empty database works

<!-- antislop: allow passive-voice -->
- **WHEN** the server is started against a Postgres database with none of the
  engine's tables
- **THEN** the schema is created before the first request is accepted, and
  requests succeed

#### Scenario: Serving against an existing database changes nothing

<!-- antislop: allow passive-voice -->
- **WHEN** the server is started against a database that already has the
  schema
- **THEN** startup proceeds normally: no table, index or row is altered.
  Each function and trigger is replaced by an identical definition, and the
  audit relation's ownership and grants are unchanged

#### Scenario: Administering users on a fresh database works

<!-- antislop: allow passive-voice -->
- **WHEN** the user-administration CLI is run against a database with no
  `auth_users` table
- **THEN** it creates the schema and completes the command

#### Scenario: A missing connection string fails at startup

- **WHEN** a process starts with `DATABASE_URL` unset
- **THEN** it fails immediately with an error naming the variable, rather than
  failing later on an unrelated-looking query

### Requirement: The worker scans and the admin outbox list have supporting indexes

`initSchema` SHALL declare an index for each of three reads whose cost would
otherwise follow the volume of instances or outbox rows ever stored. The
resolution claim reads only instances that carry a re-resolution mark. The
retention sweep reads only unredacted terminal instances, in entry-time order.
The admin outbox list reads rows newest-first. `initSchema` SHALL drop no
index of an earlier shape.

#### Scenario: Initialisation creates the marked-instance index

- **WHEN** `initSchema` runs
- **THEN** a partial index over `instances (instance_id)` exists for rows whose
  `resolve_state` differs from `idle`

#### Scenario: Initialisation creates the retention index

- **WHEN** `initSchema` runs
- **THEN** a partial index over the entry time of `completed` and `cancelled`
  instances with a `NULL` `redacted_at` exists, with `instance_id` as tie-break

#### Scenario: Initialisation creates the outbox list index

- **WHEN** `initSchema` runs
- **THEN** an index over `outbox (created_at DESC, idempotency_key DESC)` exists

#### Scenario: A second initialisation succeeds

- **WHEN** the schema initialises twice
- **THEN** the second run succeeds and all three indexes stay as they were

## REMOVED Requirements

### Requirement: Instance redaction state is a nullable column

**Reason**: `initSchema` no longer adds the column to an older table. The renamed requirement "The instances table declares a nullable redaction column" holds the column's rules.

**Migration**: Drop a local database from before the column and seed it again.

### Requirement: Each tenant database carries the whole schema

**Reason**: The base text says a later column reaches an older tenant through `ADD COLUMN IF NOT EXISTS`. `initSchema` no longer does that. The renamed requirement "Each tenant database carries the whole schema from its creation" replaces it.

**Migration**: Provision the tenant again.

<!-- antislop: allow passive-voice -->
### Requirement: Six standardized instance keys are generated columns

**Reason**: `initSchema` declares the six columns in the `CREATE TABLE` of `instances` and no longer adds them to an older table. The renamed requirement "The instances table declares six generated key columns" replaces it.

**Migration**: Drop a local database from before the six columns and seed it again.

### Requirement: The data list tables carry columns and attributes

**Reason**: `initSchema` declares `columns` and `attributes` in their `CREATE TABLE` and no longer adds them to an older table. The renamed requirement "The data list tables declare columns and attributes" replaces it.

**Migration**: Drop a local database from before the two columns and seed it again.

### Requirement: The rebuilt column indexes replace their expression predecessors by name

**Reason**: `initSchema` no longer has retrofits for a database that predates the column indexes. A developer database that still has the three retired expression indexes gets dropped and seeded again. The three column indexes stay, and `initSchema` still creates them.

**Migration**: Drop a local database with any of the three retired indexes. Seed it again. The names are `instances_selection_idx`, `instances_current_step_idx` and `instances_started_by_idx`.
