## MODIFIED Requirements

### Requirement: Starting the server creates the schema

Outside SaaS mode, `startHttpServer` SHALL run `initSchema` against its
database before it begins accepting requests. In SaaS mode it SHALL NOT,
because the provisioning command builds each tenant database's schema. The user-administration CLI SHALL run `initSchema` before
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
