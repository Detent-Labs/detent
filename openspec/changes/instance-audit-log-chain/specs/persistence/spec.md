<!-- antislop: allow-file passive-voice -->
<!-- Carries the main spec's own directive and reason: the fixed SHALL/WHEN/THEN Gherkin grammar is structurally passive. -->

## ADDED Requirements

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
login-less owner role `initSchema` creates. Clearing the values of every
field an instance's entries name SHALL run under that owner's privilege.
The trigger's append and that redaction SHALL be the only two paths that
write the relation.

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

## MODIFIED Requirements

### Requirement: Starting the server creates the schema

<!-- antislop: allow sentence-length run-ons -->
<!-- Copied from the base requirement so the MODIFIED header pairs; the two edited sentences keep its existing shape. -->
`startHttpServer` SHALL run `initSchema` against its database before it begins
accepting requests, and the user-administration CLI SHALL do the same before
executing a command. Every statement in `initSchema` is idempotent:
`CREATE ... IF NOT EXISTS` for a relation or index, `ADD COLUMN IF NOT EXISTS`
for a column, `CREATE OR REPLACE` for a function, `DROP ... IF EXISTS`
before `CREATE TRIGGER`, a `DO` block guarding a role's creation on
`pg_roles`, and `GRANT`, which is idempotent by nature, so the
call is a no-op in effect against a database that already has the schema.

The audit relation and its redaction function SHALL be created by the
role that owns them, under `SET LOCAL ROLE`. `initSchema` SHALL run no
`ALTER ... OWNER TO`. That statement raises against a non-owner, and it
raises again on a run after the ownership is already correct. A
`CREATE OR REPLACE FUNCTION` raises the same way. The second run's
no-op therefore SHALL hold for a non-superuser role too.

<!-- antislop: allow sentence-length em-dash -->
<!-- Unchanged base text, copied character for character so the MODIFIED header pairs. -->
Today `initSchema` has exactly two non-test callers — its own definition and
the demo script — so `bun run serve`, a first-class documented script, fails
with a relation-does-not-exist error at *request* time against any database
that has not previously had the test suite or the demo script run against it,
and `add-user` fails the same way on a fresh database.

<!-- antislop: allow sentence-length em-dash synonym-rotation -->
<!-- Unchanged base text, copied character for character so the MODIFIED header pairs. -->
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

<!-- antislop: allow sentence-length -->
<!-- The THEN enumerates four outcomes of one run; splitting it would split the scenario. -->
- **WHEN** the server is started against a database that already has the
  schema
- **THEN** startup proceeds normally, no table, index or row is altered,
  each function and trigger is replaced by an identical definition, and the
  audit relation's ownership and grants are unchanged

#### Scenario: Administering users on a fresh database works

- **WHEN** the user-administration CLI is run against a database with no
  `auth_users` table
- **THEN** it creates the schema and completes the command

#### Scenario: A missing connection string fails at startup

- **WHEN** a process starts with `DATABASE_URL` unset
- **THEN** it fails immediately with an error naming the variable, rather than
  failing later on an unrelated-looking query
